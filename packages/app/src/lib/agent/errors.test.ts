import { describe, expect, it } from 'vitest';
import {
  classifyError,
  isRecoverable,
  FirstChunkTimeoutError,
  StalledTimeoutError,
  MAX_TEACH_RETRIES,
  TEACHING_MESSAGE,
  type AgentError,
} from './errors';

describe('errors', () => {
  it('MAX_TEACH_RETRIES is conservative (≤3) so we never thrash', () => {
    expect(MAX_TEACH_RETRIES).toBeGreaterThanOrEqual(1);
    expect(MAX_TEACH_RETRIES).toBeLessThanOrEqual(3);
  });

  it('TEACHING_MESSAGE references the hint convention so the LLM learns', () => {
    expect(TEACHING_MESSAGE.toLowerCase()).toContain('hint');
  });

  describe('isRecoverable', () => {
    it.each([
      ['recoverable_stream_stalled' as const, true],
      ['recoverable_stream_errored' as const, true],
      ['recoverable_truncated' as const, true],
      ['recoverable_rate_limited' as const, true],
      ['fatal_auth' as const, false],
      ['fatal_malformed_history' as const, false],
      ['fatal_provider' as const, false],
    ])('%s → %s', (kind, expected) => {
      expect(isRecoverable({ kind } as AgentError)).toBe(expected);
    });
  });

  describe('classifyError', () => {
    it('FirstChunkTimeoutError → recoverable_stream_stalled', () => {
      const e = classifyError(new FirstChunkTimeoutError(8));
      expect(e.kind).toBe('recoverable_stream_stalled');
    });

    it('StalledTimeoutError → recoverable_stream_stalled', () => {
      const e = classifyError(new StalledTimeoutError(150));
      expect(e.kind).toBe('recoverable_stream_stalled');
    });

    it.each([
      ['MalformedHistory: …', 'fatal_malformed_history'],
      ['401 Unauthorized', 'fatal_auth'],
      ['invalid_api_key', 'fatal_auth'],
      ['429 Too Many Requests', 'recoverable_rate_limited'],
      ['HTTP 502 Bad Gateway', 'recoverable_stream_errored'],
      ['HTTP 503', 'recoverable_stream_errored'],
      ['Unexpected end of JSON input', 'recoverable_truncated'],
      ['random other error', 'fatal_provider'],
    ])('"%s" → %s', (msg, expectedKind) => {
      expect(classifyError(new Error(msg)).kind).toBe(expectedKind);
    });

    it('non-Error inputs are stringified', () => {
      const e = classifyError('plain string');
      expect(e.kind).toBe('fatal_provider');
      expect(e.detail).toContain('plain string');
    });
  });
});
