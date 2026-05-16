/**
 * Production LLM chain assembly.
 *
 * Order (user-specified):
 *   1. Cerebras GLM 4.7 — reasoning low, hidden
 *   2. Groq gpt-oss-120b — reasoning low, include_reasoning false
 *   3. Fireworks Kimi K2.5 — reasoning low (K2.5 floor; no "none")
 *   4. OpenRouter Gemini 3 Flash Preview — Gemini handles reasoning
 *
 * Each fallback only fires on pre-stream retriable failure
 * (network / 429 / 5xx) of the prior tier. See `client.ts` for the
 * retry semantics, `errors.ts::isRetriable` for the classifier.
 *
 * A provider whose API key is missing is dropped from the chain at
 * build time — the resulting chain only includes providers we can
 * actually call. If all keys are missing, this throws so the request
 * handler returns a 500 with a clear message instead of a cryptic
 * "missing API key" on every attempt.
 */

import { LlmClient } from './client.ts';
import {
  CEREBRAS_ZAI_GLM_47,
  FIREWORKS_KIMI_K2P5,
  GROQ_GPT_OSS_120B,
  OPENROUTER_GEMINI_3_FLASH,
  type ProviderConfig,
} from './provider.ts';

export type ChainEnv = {
  CEREBRAS_API_KEY?: string;
  GROQ_API_KEY?: string;
  FIREWORKS_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
};

type Tier = { config: ProviderConfig; key: string };

export function buildProductionChain(env: ChainEnv): LlmClient {
  const tiers: Tier[] = [
    { config: CEREBRAS_ZAI_GLM_47, key: env.CEREBRAS_API_KEY ?? '' },
    { config: GROQ_GPT_OSS_120B, key: env.GROQ_API_KEY ?? '' },
    { config: FIREWORKS_KIMI_K2P5, key: env.FIREWORKS_API_KEY ?? '' },
    { config: OPENROUTER_GEMINI_3_FLASH, key: env.OPENROUTER_API_KEY ?? '' },
  ].filter((t) => t.key.length > 0);

  if (tiers.length === 0) {
    throw new Error(
      'No LLM provider API keys configured. Set at least one of CEREBRAS_API_KEY, GROQ_API_KEY, FIREWORKS_API_KEY, OPENROUTER_API_KEY.',
    );
  }

  // Build the chain from the tail back so each tier holds the next as
  // its fallback. The head of the resulting LlmClient is the primary.
  let chain: LlmClient | null = null;
  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i];
    chain = new LlmClient(tier.config, tier.key, chain);
  }
  return chain!; // tiers.length > 0 guaranteed above
}

/** Human-readable chain summary for logs. */
export function describeChain(chain: LlmClient): string {
  const labels: string[] = [];
  let cur: LlmClient | null = chain;
  while (cur) {
    labels.push(cur.config.label);
    cur = cur.fallback;
  }
  return labels.join(' → ');
}
