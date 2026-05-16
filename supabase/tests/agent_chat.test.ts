/**
 * agent-chat: unit tests for the LLM chain primitives.
 *
 * Contract locks for:
 *   - buildRequestBody — body shape, forced stream, extraBody merge order,
 *     empty-tools stripping
 *   - isRetriable — exact classification of network / request / http_status
 *   - buildProductionChain — chain order, skip-missing-key behavior,
 *     no-keys-throws behavior
 *
 * The actual SSE streaming + fallback walk is exercised end-to-end by
 * Phase 5's verify:agent-loop (which runs the function locally via
 * `supabase functions serve` and drives a real conversation through it).
 */

import { describe, expect, it } from 'vitest';
import { buildRequestBody } from '../functions/agent-chat/llm/body';
import { isRetriable, type LlmError } from '../functions/agent-chat/llm/errors';
import { buildProductionChain } from '../functions/agent-chat/llm/chain';
import { asHeaderValue, truncate } from '../functions/agent-chat/llm/headers';
import {
  CEREBRAS_ZAI_GLM_47,
  GROQ_GPT_OSS_120B,
  FIREWORKS_KIMI_K2P5,
  OPENROUTER_GEMINI_3_FLASH,
} from '../functions/agent-chat/llm/provider';

const MSG = [{ role: 'user', content: 'hi' }];

describe('buildRequestBody', () => {
  it('always forces stream:true when caller omits stream', () => {
    const body = buildRequestBody(CEREBRAS_ZAI_GLM_47, { messages: MSG });
    expect(body.stream).toBe(true);
  });

  it('honours stream:false when caller sets it explicitly', () => {
    const body = buildRequestBody(CEREBRAS_ZAI_GLM_47, { messages: MSG, stream: false });
    expect(body.stream).toBe(false);
  });

  it('always pins provider model + temperature regardless of caller', () => {
    const body = buildRequestBody(GROQ_GPT_OSS_120B, {
      messages: MSG,
      model: 'caller-tried-to-set',
      temperature: 0.01,
    });
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.temperature).toBe(0.6);
  });

  it('merges extraBody after caller fields (provider wins)', () => {
    const body = buildRequestBody(CEREBRAS_ZAI_GLM_47, {
      messages: MSG,
      // Caller tries to override reasoning_effort to high — provider wins.
      reasoning_effort: 'high',
    });
    expect(body.reasoning_effort).toBe('medium');
    expect(body.reasoning_format).toBe('hidden');
  });

  it('passes through tools + tool_choice when non-empty', () => {
    const tools = [{ type: 'function', function: { name: 'query_sql' } }];
    const body = buildRequestBody(CEREBRAS_ZAI_GLM_47, {
      messages: MSG,
      tools,
      tool_choice: 'auto',
    });
    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toBe('auto');
  });

  it('strips empty tools array + tool_choice (providers reject empty arrays)', () => {
    const body = buildRequestBody(CEREBRAS_ZAI_GLM_47, {
      messages: MSG,
      tools: [],
      tool_choice: 'auto',
    });
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it('passes through arbitrary caller fields unchanged', () => {
    const body = buildRequestBody(CEREBRAS_ZAI_GLM_47, {
      messages: MSG,
      max_tokens: 4096,
      custom_field: 'preserved',
    });
    expect(body.max_tokens).toBe(4096);
    expect(body.custom_field).toBe('preserved');
  });

  it('cerebras body has reasoning low + hidden + user tag', () => {
    const body = buildRequestBody(CEREBRAS_ZAI_GLM_47, { messages: MSG });
    expect(body.model).toBe('zai-glm-4.7');
    expect(body.reasoning_effort).toBe('medium');
    expect(body.reasoning_format).toBe('hidden');
    expect(body.user).toBe('reknowable-agent');
  });

  it('groq body has reasoning low + include_reasoning false', () => {
    const body = buildRequestBody(GROQ_GPT_OSS_120B, { messages: MSG });
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.reasoning_effort).toBe('medium');
    expect(body.include_reasoning).toBe(false);
  });

  it('fireworks body has kimi-k2p5 model + reasoning low + user tag', () => {
    const body = buildRequestBody(FIREWORKS_KIMI_K2P5, { messages: MSG });
    expect(body.model).toBe('accounts/fireworks/models/kimi-k2p5');
    expect(body.reasoning_effort).toBe('medium');
    expect(body.user).toBe('reknowable-agent');
  });

  it('openrouter body has gemini model + no reasoning knobs', () => {
    const body = buildRequestBody(OPENROUTER_GEMINI_3_FLASH, { messages: MSG });
    expect(body.model).toBe('google/gemini-3-flash-preview');
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.reasoning_format).toBeUndefined();
  });
});

describe('isRetriable', () => {
  const cases: Array<[LlmError, boolean, string]> = [
    [{ kind: 'network', detail: 'ENOTFOUND' }, true, 'network is retriable'],
    [{ kind: 'request', detail: 'bad url' }, false, 'request is not retriable'],
    [{ kind: 'http_status', status: 429, body: '' }, true, '429 is retriable'],
    [{ kind: 'http_status', status: 500, body: '' }, true, '500 is retriable'],
    [{ kind: 'http_status', status: 503, body: '' }, true, '503 is retriable'],
    [{ kind: 'http_status', status: 599, body: '' }, true, '599 is retriable'],
    [{ kind: 'http_status', status: 400, body: '' }, false, '400 is not retriable'],
    [{ kind: 'http_status', status: 401, body: '' }, false, '401 is not retriable'],
    [{ kind: 'http_status', status: 403, body: '' }, false, '403 is not retriable'],
    [{ kind: 'http_status', status: 404, body: '' }, false, '404 is not retriable'],
    [{ kind: 'http_status', status: 422, body: '' }, false, '422 is not retriable'],
  ];
  for (const [err, expected, label] of cases) {
    it(label, () => {
      expect(isRetriable(err)).toBe(expected);
    });
  }
});

describe('truncate', () => {
  it('returns the string unchanged when within budget', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('exact', 5)).toBe('exact');
  });

  it('uses ASCII `...` not the `…` ellipsis (header ByteString safety)', () => {
    const out = truncate('a'.repeat(50), 10);
    expect(out).toBe('aaaaaaa...');
    expect(out).toHaveLength(10);
    expect(out).not.toMatch(/…/); // not the unicode ellipsis
  });

  it('degrades gracefully when max <= 3 (no room for ellipsis)', () => {
    expect(truncate('hello world', 3)).toBe('hel');
    expect(truncate('hello world', 2)).toBe('he');
  });
});

describe('asHeaderValue', () => {
  it('passes ASCII strings through unchanged', () => {
    expect(asHeaderValue('Cerebras GLM 4.7')).toBe('Cerebras GLM 4.7');
    expect(asHeaderValue('provider=http 429: queue_exceeded')).toBe(
      'provider=http 429: queue_exceeded',
    );
  });

  it('replaces the `…` ellipsis (U+2026) — the bug that crashed prod', () => {
    expect(asHeaderValue('truncated…')).toBe('truncated_');
  });

  it('replaces the `→` arrow (U+2192) used in chain descriptions', () => {
    expect(asHeaderValue('Cerebras → Groq → Fireworks')).toBe('Cerebras _ Groq _ Fireworks');
  });

  it('replaces smart quotes and accented letters from upstream errors', () => {
    expect(asHeaderValue('"We’re busy" — café')).toBe('"We_re busy" _ caf_');
  });

  it('collapses newlines to single spaces', () => {
    expect(asHeaderValue('line1\nline2\r\nline3')).toBe('line1 line2 line3');
  });

  it('strips control characters', () => {
    expect(asHeaderValue('abc\x00def\x07ghi')).toBe('abc_def_ghi');
  });

  it('trims leading/trailing whitespace', () => {
    expect(asHeaderValue('  hello  ')).toBe('hello');
  });
});

describe('buildProductionChain', () => {
  it('throws when no keys configured', () => {
    expect(() => buildProductionChain({})).toThrow(/no.*provider/i);
  });

  it('chain order is Cerebras → Groq → Fireworks → OpenRouter when all keys present', () => {
    const chain = buildProductionChain({
      CEREBRAS_API_KEY: 'a',
      GROQ_API_KEY: 'b',
      FIREWORKS_API_KEY: 'c',
      OPENROUTER_API_KEY: 'd',
    });
    expect(chain.config.id).toBe('cerebras');
    expect(chain.fallback?.config.id).toBe('groq');
    expect(chain.fallback?.fallback?.config.id).toBe('fireworks');
    expect(chain.fallback?.fallback?.fallback?.config.id).toBe('openrouter');
    expect(chain.fallback?.fallback?.fallback?.fallback).toBeNull();
  });

  it('skips tiers whose key is missing — Groq becomes primary if Cerebras key absent', () => {
    const chain = buildProductionChain({
      GROQ_API_KEY: 'b',
      OPENROUTER_API_KEY: 'd',
    });
    expect(chain.config.id).toBe('groq');
    expect(chain.fallback?.config.id).toBe('openrouter');
    expect(chain.fallback?.fallback).toBeNull();
  });

  it('single configured key gives a single-tier chain with no fallback', () => {
    const chain = buildProductionChain({ OPENROUTER_API_KEY: 'd' });
    expect(chain.config.id).toBe('openrouter');
    expect(chain.fallback).toBeNull();
  });
});
