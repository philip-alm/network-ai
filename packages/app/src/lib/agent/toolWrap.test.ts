import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toolWrap, toolError, PG_HINTS, hintFromZodIssue, extractPgCode } from './toolWrap';

const schema = z.object({ name: z.string().min(1), warmth: z.number().int().min(1).max(5) });

async function runTool(tool: ReturnType<typeof toolWrap>, args: unknown) {
  // Vercel AI SDK's `tool({}).execute(args, runtime)` shape — we pass a minimal runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tool as any).execute(args, { toolCallId: 'test-call', abortSignal: undefined });
}

describe('toolWrap', () => {
  it('returns ok+data on a valid input + clean handler', async () => {
    const t = toolWrap('test_ok', 'desc', schema, async (input) => ({
      who: input.name,
      level: input.warmth,
    }));
    const res = await runTool(t, { name: 'Anna', warmth: 2 });
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ who: 'Anna', level: 2 });
  });

  it('returns envelope error with derived hint on Zod failure (missing field)', async () => {
    const t = toolWrap('test_zod', 'desc', schema, async (input) => input);
    const res = await runTool(t, { name: 'Anna' });
    expect(res.ok).toBe(false);
    expect(res.error.toLowerCase()).toContain('valid');
    expect(res.hint).toBeTruthy();
    expect(res.retriable).toBe(false);
  });

  it('returns envelope error with hint on Zod range failure', async () => {
    const t = toolWrap('test_range', 'desc', schema, async (input) => input);
    const res = await runTool(t, { name: 'Anna', warmth: 99 });
    expect(res.ok).toBe(false);
    expect(res.hint).toMatch(/warmth/);
  });

  it('handler-returned toolError() flows hint through PG_HINTS lookup', async () => {
    const t = toolWrap('test_pg', 'desc', schema, async () =>
      toolError({ error: 'fake', pgCode: '42P10', retriable: false }),
    );
    const res = await runTool(t, { name: 'Anna', warmth: 2 });
    expect(res.ok).toBe(false);
    expect(res.hint).toBe(PG_HINTS['42P10']);
  });

  it('handler-thrown error becomes envelope with no-hint default', async () => {
    const t = toolWrap('test_throw', 'desc', schema, async () => {
      throw new Error('something exploded');
    });
    const res = await runTool(t, { name: 'Anna', warmth: 2 });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('something exploded');
    expect(res.hint).toBeTruthy();
  });

  it('handler-thrown error with PG code in message gets the matching hint', async () => {
    const t = toolWrap('test_throw_pg', 'desc', schema, async () => {
      throw new Error('something failed (code: "23505") at runtime');
    });
    const res = await runTool(t, { name: 'Anna', warmth: 2 });
    expect(res.ok).toBe(false);
    expect(res.hint).toBe(PG_HINTS['23505']);
  });

  it('explicit hint in toolError overrides PG_HINTS lookup', async () => {
    const t = toolWrap('test_hint_override', 'desc', schema, async () =>
      toolError({ error: 'fake', pgCode: '42P10', hint: 'custom guidance' }),
    );
    const res = await runTool(t, { name: 'Anna', warmth: 2 });
    expect(res.hint).toBe('custom guidance');
  });
});

describe('hintFromZodIssue', () => {
  it('invalid_type gives a clear path + expected', () => {
    const r = schema.safeParse({ name: 1, warmth: 2 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(hintFromZodIssue(r.error.issues[0])).toMatch(/name/);
    }
  });
});

describe('extractPgCode', () => {
  it('parses a quoted code from a message', () => {
    expect(extractPgCode('something (code: "42P10") happened')).toBe('42P10');
  });
  it('returns undefined when no code', () => {
    expect(extractPgCode('plain error')).toBeUndefined();
  });
});
