/**
 * agent-chat core helpers — Node-importable for testing.
 */

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type ChatRequest = {
  model: string;
  messages: unknown[];
  tools?: unknown[];
  temperature?: number;
  /** Any additional OpenRouter-compatible fields the client sends. */
  [key: string]: unknown;
};

export type BuildOpts = {
  openrouterKey: string;
  /** Identifies the app to OpenRouter for their dashboards (no user data). */
  referer?: string;
  title?: string;
};

/**
 * Build the upstream fetch request for OpenRouter. Forces `stream: true`
 * regardless of what the client asked for — the function exists to stream.
 *
 * Throws if the input is missing required fields. The client passes
 * structured data via @ai-sdk/openai-compatible; we validate the floor here.
 */
export function buildUpstreamRequest(
  input: ChatRequest,
  opts: BuildOpts,
): { url: string; init: RequestInit } {
  if (!input.model || typeof input.model !== 'string') {
    throw new Error('agent-chat: `model` is required');
  }
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new Error('agent-chat: `messages` must be a non-empty array');
  }
  if (!opts.openrouterKey) {
    throw new Error('agent-chat: missing OPENROUTER_API_KEY');
  }

  const body = { ...input, stream: true };

  return {
    url: OPENROUTER_URL,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.openrouterKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(opts.referer ? { 'HTTP-Referer': opts.referer } : {}),
        ...(opts.title ? { 'X-Title': opts.title } : {}),
      },
      body: JSON.stringify(body),
    },
  };
}

/** Headers we set on the streaming response back to the client. */
export const STREAM_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
} as const;
