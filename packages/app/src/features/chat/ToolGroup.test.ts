/**
 * groupReadTools — coalescing rules:
 *   - consecutive same-read-kind invocations collapse into a group
 *   - mixed-kind boundaries break the group
 *   - any non-read kind (mutate_sql) flushes the buffer
 *   - solo reads stay as `single` (no 1-item groups)
 */

import { describe, expect, it } from 'vitest';
import { groupReadTools } from './ToolGroup';
import type { AgentToolInvocation } from '../../lib/agent';

const mk = (name: string, args: unknown = {}, result: unknown = null): AgentToolInvocation => ({
  name,
  args,
  result,
  status: 'ok',
});

describe('groupReadTools', () => {
  it('returns empty for empty input', () => {
    expect(groupReadTools([])).toEqual([]);
  });

  it('keeps a solo read as single', () => {
    const calls = [mk('find', { query: 'anna' })];
    const out = groupReadTools(calls);
    expect(out).toEqual([{ kind: 'single', call: calls[0] }]);
  });

  it('groups two consecutive searches', () => {
    const a = mk('find', { query: 'anna' });
    const b = mk('find', { query: 'bo' });
    const out = groupReadTools([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ kind: 'group', calls: [a, b] });
  });

  it('groups five consecutive searches into one group', () => {
    const calls = ['a', 'b', 'c', 'd', 'e'].map((q) => mk('find', { query: q }));
    const out = groupReadTools(calls);
    expect(out).toEqual([{ kind: 'group', calls }]);
  });

  it('mixing search + query breaks into two groups', () => {
    const s1 = mk('find', { query: 'anna' });
    const s2 = mk('find', { query: 'bo' });
    const q1 = mk('query_sql', { sql: 'select 1' });
    const q2 = mk('query_sql', { sql: 'select 2' });
    const out = groupReadTools([s1, s2, q1, q2]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ kind: 'group', calls: [s1, s2] });
    expect(out[1]).toEqual({ kind: 'group', calls: [q1, q2] });
  });

  it('a mutate breaks the read group', () => {
    const s = mk('find', { query: 'anna' });
    const m = mk('mutate_sql', { sql: 'insert into contacts' });
    const s2 = mk('find', { query: 'bo' });
    const out = groupReadTools([s, m, s2]);
    expect(out).toEqual([
      { kind: 'single', call: s },
      { kind: 'single', call: m },
      { kind: 'single', call: s2 },
    ]);
  });

  it('find and find both classify as `search` and combine', () => {
    const a = mk('find', { query: 'anna' });
    const b = mk('find', { query: 'podcast mic' });
    const out = groupReadTools([a, b]);
    expect(out).toEqual([{ kind: 'group', calls: [a, b] }]);
  });
});
