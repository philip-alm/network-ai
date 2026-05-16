/**
 * LlmClient — streaming OpenAI-compatible chat client with pre-stream
 * fallback chaining.
 *
 * Faithful port of the production pattern in
 * `crates/llm-client/src/stream.rs` from the Incredible project.
 *
 * Behaviour
 * ---------
 *   - `streamChat` does ONE upstream POST and returns the upstream
 *     `Response` as-is. The Edge Function pipes `response.body` back
 *     to the browser — no SSE parsing, no transformation. The
 *     Vercel AI SDK reads the stream natively.
 *
 *   - If the primary attempt fails BEFORE any stream bytes arrive
 *     (network error, HTTP 429, HTTP 5xx — see `isRetriable`), we
 *     recursively retry on `fallback`. The fallback inherits the
 *     same caller body unchanged; only the provider knobs differ.
 *
 *   - Mid-stream errors are NEVER retried. Once the upstream
 *     responded with 2xx + headers and bytes started flowing, we are
 *     committed to that provider — swapping models mid-response would
 *     corrupt tool-call assembly and produce visible seams in chat.
 *
 *   - 4xx-other-than-429 is NOT retried. Bad auth or bad schema is
 *     our bug; the fallback would just waste its quota.
 *
 *   - Abort propagation: callers pass an `AbortSignal`. We forward it
 *     to `fetch`; on user abort, the in-flight upstream request is
 *     dropped. Aborts are NEVER treated as retriable.
 *
 *   - HTTP-Referer / X-Title headers are sent on OpenRouter requests
 *     only (they identify the app to OpenRouter's dashboards; other
 *     providers don't read them).
 */

import type { GenericLlmBody } from './body.ts';
import { buildRequestBody } from './body.ts';
import { describeError, isRetriable, type LlmError } from './errors.ts';
import type { ProviderConfig } from './provider.ts';

export type StreamChatInput = {
  body: GenericLlmBody;
  /** AbortSignal propagated to upstream fetch; aborts kill the chain. */
  signal: AbortSignal;
};

export type StreamChatResult = {
  /** Upstream Response with `.body` already streaming. Pipe back as-is. */
  response: Response;
  /** Which provider in the chain won (after any fallbacks). */
  providerLabel: string;
  /** Errors from providers that were attempted before the winner. Empty if primary won. */
  fallbackTrail: Array<{ providerLabel: string; error: string }>;
};

/** Top-level failure surface: the entire chain was exhausted. */
export class LlmChainExhaustedError extends Error {
  readonly attempts: Array<{ providerLabel: string; error: string }>;
  constructor(attempts: Array<{ providerLabel: string; error: string }>) {
    const detail = attempts.map((a) => `${a.providerLabel}: ${a.error}`).join(' | ');
    super(`All LLM providers failed — ${detail}`);
    this.name = 'LlmChainExhaustedError';
    this.attempts = attempts;
  }
}

export class LlmClient {
  readonly config: ProviderConfig;
  private readonly apiKey: string;
  private readonly fallbackClient: LlmClient | null;

  constructor(config: ProviderConfig, apiKey: string, fallback: LlmClient | null = null) {
    this.config = config;
    this.apiKey = apiKey;
    this.fallbackClient = fallback;
  }

  /** Next tier in the chain (if any). Used by callers for logging. */
  get fallback(): LlmClient | null {
    return this.fallbackClient;
  }

  /**
   * Attach a fallback client. Builder-style; returns a NEW LlmClient
   * so the original primary remains usable independently.
   * `A.withFallback(B.withFallback(C))` chains arbitrarily deep.
   */
  withFallback(fallback: LlmClient): LlmClient {
    return new LlmClient(this.config, this.apiKey, fallback);
  }

  /**
   * Send one request, returning the upstream streaming Response. On
   * pre-stream retriable failure, recursively attempts the fallback.
   */
  async streamChat(input: StreamChatInput): Promise<StreamChatResult> {
    const trail: Array<{ providerLabel: string; error: string }> = [];
    return this.attemptWithFallback(input, trail);
  }

  private async attemptWithFallback(
    input: StreamChatInput,
    trail: Array<{ providerLabel: string; error: string }>,
  ): Promise<StreamChatResult> {
    const single = await this.singleAttempt(input);
    if (single.ok) {
      return {
        response: single.response,
        providerLabel: this.config.label,
        fallbackTrail: trail,
      };
    }

    const err = single.error;
    const errStr = describeError(err);
    trail.push({ providerLabel: this.config.label, error: errStr });

    // Aborts are user-initiated — never walk the chain.
    if (input.signal.aborted) {
      throw new LlmChainExhaustedError(trail);
    }
    if (!this.fallbackClient || !isRetriable(err)) {
      throw new LlmChainExhaustedError(trail);
    }

    console.warn(
      `[llm] ${this.config.label} failed (${errStr.slice(0, 160)}) — falling back to ${this.fallbackClient.config.label}`,
    );
    return this.fallbackClient.attemptWithFallback(input, trail);
  }

  private async singleAttempt(
    input: StreamChatInput,
  ): Promise<{ ok: true; response: Response } | { ok: false; error: LlmError }> {
    if (!this.apiKey) {
      return {
        ok: false,
        error: { kind: 'request', detail: `missing API key for ${this.config.label}` },
      };
    }

    let body: string;
    try {
      body = JSON.stringify(buildRequestBody(this.config, input.body));
    } catch (e) {
      return {
        ok: false,
        error: { kind: 'request', detail: `body serialize: ${(e as Error).message}` },
      };
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    // OpenRouter likes a referer + title for its dashboards. Other
    // providers ignore these. Stamped here (not in extraBody) because
    // they're headers, not body fields.
    if (this.config.id === 'openrouter') {
      headers['HTTP-Referer'] = 'https://reknowable.app';
      headers['X-Title'] = 'reknowable';
    }

    let response: Response;
    try {
      response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body,
        signal: input.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // AbortError gets the same network classification — the chain
      // walker checks `signal.aborted` separately to bail without
      // calling the fallback.
      return { ok: false, error: { kind: 'network', detail: msg } };
    }

    if (!response.ok) {
      // Drain the body so we have the provider's error detail for logs.
      const body = await response.text().catch(() => '(unreadable)');
      return {
        ok: false,
        error: { kind: 'http_status', status: response.status, body },
      };
    }

    if (!response.body) {
      return {
        ok: false,
        error: { kind: 'network', detail: 'upstream returned 2xx with no body' },
      };
    }

    return { ok: true, response };
  }
}
