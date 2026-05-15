/**
 * agent-chat core helpers — Node-importable for testing.
 */

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type ChatRequest = {
  model: string;
  messages: unknown[];
  tools?: unknown[];
  temperature?: number;
  stream?: boolean;
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
 * Build the upstream fetch request for OpenRouter. We honor whatever
 * `stream` value the client sent — `streamText` sends `true`, `generateText`
 * sends `false`. Forcing one way breaks the other.
 *
 * Throws if the input is missing required fields.
 */
export function buildUpstreamRequest(
  input: ChatRequest,
  opts: BuildOpts,
): { url: string; init: RequestInit; streaming: boolean } {
  if (!input.model || typeof input.model !== 'string') {
    throw new Error('agent-chat: `model` is required');
  }
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new Error('agent-chat: `messages` must be a non-empty array');
  }
  if (!opts.openrouterKey) {
    throw new Error('agent-chat: missing OPENROUTER_API_KEY');
  }

  const streaming = input.stream === true;

  return {
    url: OPENROUTER_URL,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.openrouterKey}`,
        'Content-Type': 'application/json',
        Accept: streaming ? 'text/event-stream' : 'application/json',
        ...(opts.referer ? { 'HTTP-Referer': opts.referer } : {}),
        ...(opts.title ? { 'X-Title': opts.title } : {}),
      },
      body: JSON.stringify(input),
    },
    streaming,
  };
}

/** Headers for streaming responses back to the client. */
export const STREAM_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
} as const;

/** Headers for non-streaming (JSON) responses. */
export const JSON_RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache, no-transform',
} as const;
