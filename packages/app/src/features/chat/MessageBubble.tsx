'use client';

import { memo } from 'react';
import { motion } from 'motion/react';
import type { AgentToolInvocation } from '../../lib/agent';
import type { Segment } from '../../lib/agent/segments';
import { ToolCallCard } from './ToolCallCard';
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
        className="max-w-[88%] rounded-lg bg-fg px-3.5 py-2 text-sm leading-relaxed text-bg"
      >
        {text}
      </div>
    </motion.div>
  );
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  const segments: Segment[] = message.segments?.length ? message.segments : legacySegments(message);

  // Find the index of the trailing TEXT segment (cursor goes here, if any).
  let trailingTextIdx = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].kind === 'text') {
      trailingTextIdx = i;
      break;
    }
  }
  const hasTrailingTool = segments.length > 0 && segments[segments.length - 1].kind === 'tool';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
      className="flex justify-start"
    >
      <div className="w-full max-w-[92%] space-y-2.5">
        {segments.length === 0 && message.streaming ? (
          <span className="inline-block h-3 w-1.5 animate-cursor-blink rounded-sm bg-fg/70 align-text-bottom" />
        ) : null}

        {segments.map((seg, i) =>
          seg.kind === 'text' ? (
            <TextSegment
              key={`t-${i}`}
              text={seg.text}
              showCursor={!!message.streaming && i === trailingTextIdx && !hasTrailingTool}
            />
          ) : (
            <ToolCallCard key={`tc-${seg.id}`} call={seg.call} />
          ),
        )}
      </div>
    </motion.div>
  );
}

function TextSegment({ text, showCursor }: { text: string; showCursor?: boolean }) {
  if (!text) return null;
  return (
    <div data-testid="bubble-assistant" className="relative">
      <Markdown text={text} />
      {showCursor ? (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-3.5 w-[3px] -translate-y-px animate-cursor-blink rounded-[1px] bg-fg/60 align-text-bottom"
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
