import { describe, expect, it } from 'vitest';
import { normalizeHistory } from './normalizeHistory';
import { MalformedHistoryError } from './errors';

describe('normalizeHistory', () => {
  it('passes through a clean history unchanged in order', () => {
    const h = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: 'hello' },
      { role: 'user' as const, content: 'bye' },
    ];
    expect(normalizeHistory(h).map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('inlines tool result after assistant{tool_calls}', () => {
    const h = [
      { role: 'user' as const, content: 'add anna' },
      {
        role: 'assistant' as const,
        tool_calls: [{ id: 'c1', function: {} }],
      },
      { role: 'tool' as const, tool_call_id: 'c1', content: '{"ok":true}' },
    ];
    const out = normalizeHistory(h);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(out[2].tool_call_id).toBe('c1');
  });

  it('synthesizes a placeholder when a tool result is missing', () => {
    const h = [
      { role: 'user' as const, content: 'add anna' },
      {
        role: 'assistant' as const,
        tool_calls: [{ id: 'c1', function: {} }],
      },
      { role: 'user' as const, content: 'never mind' },
    ];
    const out = normalizeHistory(h);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'user']);
    const synth = out[2] as { content?: string; tool_call_id?: string };
    expect(synth.tool_call_id).toBe('c1');
    expect(String(synth.content)).toContain('dropped by runtime');
  });

  it('drops duplicate tool messages — last wins', () => {
    const h = [
      { role: 'assistant' as const, tool_calls: [{ id: 'c1', function: {} }] },
      { role: 'tool' as const, tool_call_id: 'c1', content: '{"ok":true,"v":1}' },
      { role: 'tool' as const, tool_call_id: 'c1', content: '{"ok":true,"v":2}' },
    ];
    const out = normalizeHistory(h);
    expect(out.length).toBe(2);
    expect(String((out[1] as { content?: string }).content)).toContain('"v":2');
  });

  it('inlines multiple parallel tool results in tool_calls order', () => {
    const h = [
      {
        role: 'assistant' as const,
        tool_calls: [
          { id: 'c1', function: {} },
          { id: 'c2', function: {} },
        ],
      },
      { role: 'tool' as const, tool_call_id: 'c2', content: '"second"' },
      { role: 'tool' as const, tool_call_id: 'c1', content: '"first"' },
    ];
    const out = normalizeHistory(h);
    // After assistant, expect [c1, c2] in that order (assistant's tool_calls order, not history order)
    expect((out[1] as { tool_call_id?: string }).tool_call_id).toBe('c1');
    expect((out[2] as { tool_call_id?: string }).tool_call_id).toBe('c2');
  });

  it('throws MalformedHistoryError on orphan trailing assistant{tool_calls}', () => {
    const h = [
      // No tool result anywhere; Pass 2 would synthesize one, so this path is
      // only reachable if we explicitly construct an unreachable trailer.
      // We use an empty tool_calls id to force Pass 2 to skip + Pass 3 to fire.
      { role: 'assistant' as const, tool_calls: [{ id: '', function: {} }] },
    ];
    expect(() => normalizeHistory(h)).toThrow(MalformedHistoryError);
  });

  it('dropOrphanTrailing silently drops the trailer', () => {
    const h = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, tool_calls: [{ id: '', function: {} }] },
    ];
    const out = normalizeHistory(h, { dropOrphanTrailing: true });
    expect(out.map((m) => m.role)).toEqual(['user']);
  });

  it('returns [] for empty input', () => {
    expect(normalizeHistory([])).toEqual([]);
  });
});
