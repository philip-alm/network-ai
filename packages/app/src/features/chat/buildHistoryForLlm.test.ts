/**
 * Regression tests for buildHistoryForLlm.
 *
 * The 2026-05-15 bug: round-1 useAgentLoop rewrite captured history
 * inside a setMessages updater, but React 18 queues those updaters —
 * by the time runBrowserAgentTurn read the array, the updater hadn't
 * run, so the LLM got `[]` every turn. The model answered "yes" with
 * "I don't have any previous context here."
 *
 * The fix: read messages synchronously from the closure via this pure
 * helper. These tests pin its contract so the regression can't recur
 * silently.
 */

import { describe, expect, it } from 'vitest';
import { buildHistoryForLlm } from './useAgentLoop';
import type { ChatMessage } from './MessageBubble';

const mk = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: 'm',
  role: 'user',
  text: '',
  ...overrides,
});

describe('buildHistoryForLlm', () => {
  it('returns empty for empty input', () => {
    expect(buildHistoryForLlm([])).toEqual([]);
  });

  it('roundtrips a simple user/assistant pair', () => {
    const msgs: ChatMessage[] = [
      mk({ id: '1', role: 'user', text: 'hi' }),
      mk({ id: '2', role: 'assistant', text: 'hello there' }),
    ];
    expect(buildHistoryForLlm(msgs)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello there' },
    ]);
  });

  it('drops streaming placeholders so the LLM never sees ghost turns', () => {
    const msgs: ChatMessage[] = [
      mk({ id: '1', role: 'user', text: 'hi' }),
      mk({ id: '2', role: 'assistant', text: '', streaming: true, segments: [] }),
    ];
    expect(buildHistoryForLlm(msgs)).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('drops empty assistant turns (pure tool-call with no narration)', () => {
    const msgs: ChatMessage[] = [
      mk({ id: '1', role: 'user', text: 'go' }),
      mk({ id: '2', role: 'assistant', text: '' }),
      mk({ id: '3', role: 'user', text: 'yes' }),
    ];
    expect(buildHistoryForLlm(msgs)).toEqual([
      { role: 'user', content: 'go' },
      { role: 'user', content: 'yes' },
    ]);
  });

  it('prefers the joined text-segments when they are longer than .text', () => {
    // Multi-step assistant: step 1 says "looking", step 2 says "found
    // Anna". result.text from streamText only carries the LAST step;
    // segments carry both. The joined version is the truth.
    const msgs: ChatMessage[] = [
      mk({ id: '1', role: 'user', text: 'find anna' }),
      mk({
        id: '2',
        role: 'assistant',
        text: 'Found Anna.',
        segments: [
          { kind: 'text', text: 'Looking.' },
          {
            kind: 'tool',
            id: 't1',
            call: { name: 'search_contacts', args: {}, result: null, status: 'ok' },
          },
          { kind: 'text', text: 'Found Anna.' },
        ],
      }),
    ];
    const out = buildHistoryForLlm(msgs);
    expect(out).toEqual([
      { role: 'user', content: 'find anna' },
      { role: 'assistant', content: 'Looking.\n\nFound Anna.' },
    ]);
  });

  it('keeps .text when segments are shorter (single-step turn)', () => {
    const msgs: ChatMessage[] = [
      mk({
        id: '1',
        role: 'assistant',
        text: 'A longer, finalized response with details.',
        segments: [{ kind: 'text', text: 'short' }],
      }),
    ];
    expect(buildHistoryForLlm(msgs)).toEqual([
      { role: 'assistant', content: 'A longer, finalized response with details.' },
    ]);
  });

  it('reproduces the screenshot: ask → confirm → yes — history is non-empty', () => {
    // The user's reported scenario from the screenshot.
    const msgs: ChatMessage[] = [
      mk({ id: '1', role: 'user', text: 'delete all contacts' }),
      mk({
        id: '2',
        role: 'assistant',
        text: 'I want to make sure before doing anything irreversible. Reply "yes" to confirm.',
      }),
    ];
    const out = buildHistoryForLlm(msgs);
    expect(out).toHaveLength(2);
    expect(out[1].content).toContain('Reply "yes" to confirm');
  });
});
