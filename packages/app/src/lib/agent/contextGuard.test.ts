import { describe, expect, it } from 'vitest';
import { applyContextGuard, countChars } from './contextGuard';
import type { NormalizableMessage } from './normalizeHistory';

function chunk(size: number): string {
  return 'x'.repeat(size);
}

describe('applyContextGuard — under budget', () => {
  it('returns input untouched when total chars are under the budget', () => {
    const messages: NormalizableMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hi back' },
    ];
    const result = applyContextGuard(messages, { charBudget: 1000 });
    expect(result.messages).toEqual(messages);
    expect(result.actions).toEqual([]);
    expect(result.estimatedChars).toBeLessThan(50);
  });
});

describe('applyContextGuard — over budget', () => {
  it('drops oldest user/assistant pairs until under budget', () => {
    // 6 turns, each user message is ~5_000 chars. Total ~30k. Budget 10k.
    const messages: NormalizableMessage[] = [];
    for (let t = 0; t < 6; t++) {
      messages.push({ role: 'user', content: `turn ${t} ${chunk(5_000)}` });
      messages.push({ role: 'assistant', content: 'ack' });
    }
    const result = applyContextGuard(messages, { charBudget: 10_000 });

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ kind: 'dropped_oldest_pairs', count: expect.any(Number) });
    expect(result.estimatedChars).toBeLessThanOrEqual(10_000);

    // The oldest turn should be gone.
    const stillHasTurn0 = result.messages.some(
      (m) => typeof m.content === 'string' && m.content.includes('turn 0 xxxxx'),
    );
    expect(stillHasTurn0).toBe(false);

    // The current user prompt (last user) must survive.
    const lastUser = result.messages.filter((m) => m.role === 'user').pop();
    expect(lastUser?.content).toMatch(/turn 5/);
  });

  it('drops a user message together with its assistant reply and tool results', () => {
    const messages: NormalizableMessage[] = [
      { role: 'user', content: `old ask ${chunk(5_000)}` },
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1' }] },
      { role: 'tool', tool_call_id: 'c1', content: `tool result ${chunk(5_000)}` },
      { role: 'user', content: `recent ask ${chunk(1_000)}` },
    ];
    const result = applyContextGuard(messages, { charBudget: 5_000 });

    // All 3 of "old ask" + its assistant + its tool result should be dropped together.
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content as string).toMatch(/recent ask/);
  });

  it('never drops the most recent user message even when over budget alone', () => {
    // The single current prompt is bigger than the budget. The guard
    // returns it anyway — dropping it would mean the agent has no
    // question to answer. The LLM call will fail downstream, which is
    // the honest signal.
    const messages: NormalizableMessage[] = [{ role: 'user', content: chunk(50_000) }];
    const result = applyContextGuard(messages, { charBudget: 1_000 });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.actions).toEqual([]);
  });
});

describe('countChars', () => {
  it('roughly tracks the input size', () => {
    const small: NormalizableMessage[] = [{ role: 'user', content: 'hi' }];
    const big: NormalizableMessage[] = [{ role: 'user', content: chunk(30_000) }];
    expect(countChars(small)).toBeLessThan(50);
    expect(countChars(big)).toBeGreaterThanOrEqual(30_000);
    expect(countChars(big)).toBeLessThan(30_100);
  });

  it('counts tool_calls and tool_call_id too', () => {
    const m: NormalizableMessage = {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'find' } }],
    };
    expect(countChars([m])).toBeGreaterThan(30); // role + envelope + serialized tool_calls
  });
});
