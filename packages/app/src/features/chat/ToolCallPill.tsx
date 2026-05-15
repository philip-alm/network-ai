'use client';

import type { AgentToolInvocation } from '../../lib/agent';

const COLORS: Record<'running' | 'ok' | 'error', { bg: string; fg: string; icon: string }> = {
  running: { bg: '#fff4d6', fg: '#7a5c00', icon: '⏳' },
  ok: { bg: '#e3f5e1', fg: '#0a6e2b', icon: '✓' },
  error: { bg: '#fbe1e1', fg: '#a01b1b', icon: '✗' },
};

export function ToolCallPill({ call }: { call: AgentToolInvocation & { id?: string } }) {
  const state: 'running' | 'ok' | 'error' =
    call.result === null ? 'running' : call.status === 'error' ? 'error' : 'ok';
  const color = COLORS[state];

  const out = call.result as { ok?: boolean; error?: string; hint?: string } | null;
  const tooltip =
    out?.ok === false
      ? `${call.name}\n\nerror: ${out.error ?? ''}\nhint: ${out.hint ?? ''}`
      : call.name;

  return (
    <span
      title={tooltip}
      data-testid={`tool-pill-${call.name}`}
      data-state={state}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        background: color.bg,
        color: color.fg,
        fontSize: 11,
        marginRight: 6,
        marginTop: 4,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
      }}
    >
      <span aria-hidden>{color.icon}</span>
      <code>{call.name}</code>
      {call.durationMs !== undefined ? (
        <span style={{ opacity: 0.65 }}>· {call.durationMs}ms</span>
      ) : null}
    </span>
  );
}
