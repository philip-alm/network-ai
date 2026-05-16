'use client';

import { memo } from 'react';
import { motion } from 'motion/react';
import type { AgentToolInvocation } from '../../lib/agent';
import type { Segment } from '../../lib/agent/segments';
import { ToolCallCard } from './ToolCallCard';
import { ToolGroup, groupReadTools, type ToolRun } from './ToolGroup';
import { Markdown } from './Markdown';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: AgentToolInvocation[];
  /** Ordered (text | tool) timeline of the assistant turn. */
  segments?: Segment[];
  /** True for the in-flight streaming bubble — renders a quiet cursor on
   *  the trailing text segment only. */
  streaming?: boolean;
};

/**
 * MessageBubble — one chat turn. Memoized on the message reference so the
 * non-streaming bubbles never re-render when the streaming one mutates.
 *
 * Streaming bubble stays mounted for the entire turn lifecycle (see
 * useAgentLoop) — never unmounted and remounted, so no flash on commit.
 */
export const MessageBubble = memo(
  function MessageBubble({ message }: { message: ChatMessage }) {
    if (message.role === 'user') return <UserBubble text={message.text} />;
    return <AssistantBubble message={message} />;
  },
  (prev, next) => prev.message === next.message,
);

function UserBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
      className="flex justify-end"
    >
      <div
        data-testid="bubble-user"
        className="max-w-[88%] whitespace-pre-wrap rounded-2xl bg-fg px-3.5 py-2 text-sm leading-relaxed text-bg"
      >
        {text}
      </div>
    </motion.div>
  );
}

/** A renderable group of consecutive (text | tool-runs) chunks. */
type RenderItem =
  | { kind: 'text'; idx: number; text: string }
  | { kind: 'toolRun'; idx: number; run: ToolRun };

/**
 * Walk the flat segments and coalesce *consecutive* tool segments into
 * a single tool batch, then run groupReadTools on each batch so e.g.
 * "search × 5" collapses to one group card. Text segments remain
 * separate boundaries — a text breaks the tool batch.
 */
function buildRenderItems(segments: Segment[]): RenderItem[] {
  const items: RenderItem[] = [];
  let pendingTools: AgentToolInvocation[] = [];

  const flushTools = (): void => {
    if (pendingTools.length === 0) return;
    const runs = groupReadTools(pendingTools);
    for (const r of runs) {
      items.push({ kind: 'toolRun', idx: items.length, run: r });
    }
    pendingTools = [];
  };

  for (const s of segments) {
    if (s.kind === 'text') {
      flushTools();
      items.push({ kind: 'text', idx: items.length, text: s.text });
    } else {
      pendingTools.push(s.call);
    }
  }
  flushTools();
  return items;
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  const segments: Segment[] = message.segments?.length ? message.segments : legacySegments(message);

  const items = buildRenderItems(segments);

  // Find the trailing TEXT item index (cursor goes here, when streaming).
  let trailingTextIdx = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'text') {
      trailingTextIdx = i;
      break;
    }
  }
  const trailingIsText = items.length > 0 && items[items.length - 1].kind === 'text';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
      className="flex justify-start"
    >
      <div className="w-full max-w-[92%] space-y-3">
        {items.length === 0 && message.streaming ? (
          <span className="inline-block h-[14px] w-[3px] animate-cursor-blink rounded-[1px] bg-fg/60 align-text-bottom" />
        ) : null}

        {items.map((it, i) => {
          if (it.kind === 'text') {
            return (
              <TextSegment
                key={`t-${i}`}
                text={it.text}
                showCursor={!!message.streaming && i === trailingTextIdx && trailingIsText}
              />
            );
          }
          if (it.run.kind === 'single') {
            return <ToolCallCard key={`s-${callKey(it.run.call)}-${i}`} call={it.run.call} />;
          }
          return (
            <ToolGroup key={`g-${it.run.calls.map(callKey).join('+')}-${i}`} calls={it.run.calls} />
          );
        })}
      </div>
    </motion.div>
  );
}

function callKey(c: AgentToolInvocation): string {
  // Best-effort stable key; tool IDs aren't part of AgentToolInvocation
  // shape directly here. Name + sql/query hash is stable per call.
  const arg = (c.args as { sql?: string; query?: string } | undefined) ?? {};
  return `${c.name}-${(arg.sql ?? arg.query ?? '').slice(0, 16)}`;
}

function TextSegment({ text, showCursor }: { text: string; showCursor?: boolean }) {
  if (!text) return null;
  return (
    <div data-testid="bubble-assistant" className="relative">
      <Markdown text={text} />
      {showCursor ? (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-[14px] w-[3px] -translate-y-px animate-cursor-blink rounded-[1px] bg-fg/60 align-text-bottom"
        />
      ) : null}
    </div>
  );
}

function legacySegments(message: ChatMessage): Segment[] {
  const out: Segment[] = [];
  if (message.toolCalls && message.toolCalls.length > 0) {
    message.toolCalls.forEach((c, i) =>
      out.push({ kind: 'tool', id: `legacy-${message.id}-${i}`, call: c }),
    );
  }
  if (message.text) out.push({ kind: 'text', text: message.text });
  return out;
}
