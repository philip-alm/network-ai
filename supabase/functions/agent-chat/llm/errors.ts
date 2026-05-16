/**
 * LLM client error model.
 *
 * Faithful port of `crates/llm-client/src/stream.rs::LlmError` from the
 * Incredible project. Three failure modes:
 *   - Request — our bug (bad URL, bad headers). Never retried.
 *   - Network — DNS / TLS / connect / abort. Retryable.
 *   - HttpStatus — non-2xx response. Retryable only on 429 or 5xx
 *     (4xx-other is our bug: bad auth, bad schema).
 *
 * `isRetriable` is the only knob the client uses to decide whether to
 * walk down the fallback chain. Matches the Rust `is_retriable` exactly.
 */

export type LlmError =
  | { kind: 'request'; detail: string }
  | { kind: 'network'; detail: string }
  | { kind: 'http_status'; status: number; body: string };

export function describeError(e: LlmError): string {
  switch (e.kind) {
    case 'request':
      return `request build failed: ${e.detail}`;
    case 'network':
      return `network error: ${e.detail}`;
    case 'http_status':
      return `http ${e.status}: ${e.body.slice(0, 200)}`;
  }
}

/** Pre-stream failures that warrant a fallback attempt. */
export function isRetriable(e: LlmError): boolean {
  switch (e.kind) {
    case 'network':
      return true;
    case 'request':
      return false;
    case 'http_status':
      return e.status === 429 || (e.status >= 500 && e.status <= 599);
  }
}
