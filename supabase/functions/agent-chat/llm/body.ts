/**
 * Request-body construction for the LLM chain.
 *
 * Faithful port of `crates/llm-client/src/stream.rs::build_request_body`.
 * Constructs the JSON body sent upstream by merging the caller's
 * payload (messages + tools + tool_choice + stream + max_tokens) with
 * the provider's static knobs (`extraBody`). Provider knobs win on key
 * conflict so per-provider reasoning/user settings are authoritative.
 *
 * The caller's `model` field is intentionally IGNORED — each provider
 * has its own model id. The client field is stripped at the Edge
 * Function entry so a misconfigured client can never override routing.
 */

import type { ProviderConfig } from './provider.ts';

/** Generic OpenAI-compatible body coming from the Vercel AI SDK. */
export type GenericLlmBody = {
  messages: unknown[];
  tools?: unknown[];
  tool_choice?: unknown;
  stream?: boolean;
  max_tokens?: number;
  /** Other fields the client may send — pass through unchanged. */
  [key: string]: unknown;
};

/**
 * Build the exact upstream body. The output is the shape the provider
 * sees on the wire; nothing else is added downstream.
 *
 * Field-merge order (later wins for overlapping keys):
 *   1. caller-provided fields (everything except `model`, `temperature`)
 *   2. provider model + temperature (always overrides)
 *   3. provider extraBody (always overrides)
 */
export function buildRequestBody(
  config: ProviderConfig,
  caller: GenericLlmBody,
): Record<string, unknown> {
  // Pluck fields we always override; everything else passes through.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { model: _ignored1, temperature: _ignored2, ...rest } = caller;

  const body: Record<string, unknown> = {
    ...rest,
    model: config.model,
    temperature: config.temperature,
    stream: caller.stream ?? true,
    ...config.extraBody,
  };

  // Drop tools key if empty — providers reject empty arrays.
  if (Array.isArray(body.tools) && body.tools.length === 0) {
    delete body.tools;
    delete body.tool_choice;
  }

  return body;
}
