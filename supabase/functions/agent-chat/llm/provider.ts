/**
 * Per-provider request-time configuration.
 *
 * Faithful port of `crates/llm-client/src/provider.rs::ProviderConfig`
 * from the Incredible project. Each entry pins:
 *   - the OpenAI-compatible chat-completions endpoint
 *   - the provider's model id
 *   - the temperature (Reknowable mirrors the Incredible benchmark default)
 *   - `extraBody` — provider-specific knobs merged at top level of
 *     the request body: `reasoning_effort`, `reasoning_format`,
 *     `include_reasoning`, `user` (for cache affinity), etc.
 *
 * All four providers use Bearer auth — no `Api-Key`-style providers in
 * this chain (Baseten was the only one in the reference codebase).
 *
 * If you change reasoning knobs here, update both `docs/LEARNINGS.md`
 * and this module's CLAUDE.md.
 */

export type ProviderId = 'cerebras' | 'groq' | 'fireworks' | 'openrouter';

export type ProviderConfig = {
  id: ProviderId;
  /** Display label used in fallback log lines. */
  label: string;
  endpoint: string;
  /** Model id sent in the request body. */
  model: string;
  /** Temperature sent in the request body. */
  temperature: number;
  /** Extra fields merged into the request body at top level. */
  extraBody: Record<string, unknown>;
};

/**
 * 1) Cerebras GLM 4.7 — primary.
 *
 * Reasoning enabled at the medium tier. GLM 4.7 supports a full
 * `none|low|medium|high` dial; `"medium"` is the sensible middle
 * ground for a chat agent doing multi-step tool calls — deeper than
 * "low" without "high"'s 4-6x TTFT penalty. `reasoning_format:
 * "hidden"` keeps the reasoning tokens out of the response stream
 * so the chat UI receives only the final assistant content.
 *
 * The static `user` value gives Cerebras a stable shard hint for
 * prefix-cache affinity — request bodies sharing the same `user` are
 * preferentially routed to the same backend, warming the cached
 * system+tools prefix turn-to-turn.
 */
export const CEREBRAS_ZAI_GLM_47: ProviderConfig = {
  id: 'cerebras',
  label: 'Cerebras GLM 4.7',
  endpoint: 'https://api.cerebras.ai/v1/chat/completions',
  model: 'zai-glm-4.7',
  temperature: 0.6,
  extraBody: {
    reasoning_effort: 'medium',
    reasoning_format: 'hidden',
    user: 'reknowable-agent',
  },
};

/**
 * 2) Groq gpt-oss-120b — first fallback.
 *
 * gpt-oss cannot fully disable reasoning. The dial is
 * `low|medium|high`; `"medium"` matches the Cerebras tier for
 * consistency across the chain. `include_reasoning: false` is a
 * Groq-specific knob that strips the reasoning tokens from the
 * response stream — the model still reasons internally, the wire
 * carries only the final content.
 */
export const GROQ_GPT_OSS_120B: ProviderConfig = {
  id: 'groq',
  label: 'Groq gpt-oss-120b',
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'openai/gpt-oss-120b',
  temperature: 0.6,
  extraBody: {
    reasoning_effort: 'medium',
    include_reasoning: false,
    user: 'reknowable-agent',
  },
};

/**
 * 3) Fireworks Kimi K2.5 — second fallback.
 *
 * Kimi K2.5 on Fireworks accepts `low|medium|high` for
 * `reasoning_effort` (no `"none"` floor per Incredible's note +
 * the `llm-proxy/adapters/fireworks.ts` reference). `"medium"`
 * matches the rest of the chain. Fireworks pins same-`user`
 * requests to the same GPU replica, boosting prompt-cache hit rate
 * (~83% token cost reduction on repeats).
 */
export const FIREWORKS_KIMI_K2P5: ProviderConfig = {
  id: 'fireworks',
  label: 'Fireworks Kimi K2.5',
  endpoint: 'https://api.fireworks.ai/inference/v1/chat/completions',
  model: 'accounts/fireworks/models/kimi-k2p5',
  temperature: 0.6,
  extraBody: {
    reasoning_effort: 'medium',
    user: 'reknowable-agent',
  },
};

/**
 * 4) OpenRouter Gemini 3 Flash Preview — final fallback.
 *
 * OpenRouter is a routing layer; Gemini 3 Flash handles reasoning
 * internally — no `reasoning_effort` knob applies here. The
 * `HTTP-Referer` + `X-Title` headers identify the app to OpenRouter's
 * dashboards (added at the auth-header layer in `client.ts`, not here).
 */
export const OPENROUTER_GEMINI_3_FLASH: ProviderConfig = {
  id: 'openrouter',
  label: 'OpenRouter Gemini 3 Flash',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'google/gemini-3-flash-preview',
  temperature: 0.6,
  extraBody: {},
};
