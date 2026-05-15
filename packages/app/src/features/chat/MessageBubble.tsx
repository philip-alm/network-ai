'use client';

import { motion } from 'motion/react';
import type { AgentToolInvocation } from '../../lib/agent';
import type { Segment } from '../../lib/agent/segments';
import { ToolCallCard } from './ToolCallCard';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: AgentToolInvocation[];
  /** Ordered (text | tool) timeline of the assistant turn. */
  segments?: Segment[];
  /** True for the in-flight streaming bubble — renders a quiet cursor. */
  streaming?: boolean;
};

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
        className="flex justify-end"
      >
        <div
          data-testid="bubble-user"
          className="max-w-[88%] rounded-lg bg-fg px-3.5 py-2 text-sm leading-relaxed text-bg"
        >
          {message.text}
        </div>
      </motion.div>
    );
  }

  const segments: Segment[] = message.segments?.length ? message.segments : legacySegments(message);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
      className="flex justify-start"
    >
      <div className="max-w-[92%] space-y-2">
        {segments.map((seg, i) =>
          seg.kind === 'text' ? (
            <TextSegment
              key={`t-${i}`}
              text={seg.text}
              showCursor={message.streaming && i === segments.length - 1 && seg.kind === 'text'}
            />
          ) : (
            <ToolCallCard key={`tc-${seg.id}`} call={seg.call} />
          ),
        )}
        {message.streaming && segments[segments.length - 1]?.kind !== 'text' ? (
          <span aria-hidden className="cursor" />
        ) : null}
      </div>
    </motion.div>
  );
}

function TextSegment({ text, showCursor }: { text: string; showCursor?: boolean }) {
  if (!text && !showCursor) return null;
  return (
    <div
      data-testid="bubble-assistant"
      className="whitespace-pre-wrap text-base leading-relaxed tracking-tight text-fg/90"
    >
      {text}
      {showCursor ? <span aria-hidden className="cursor" /> : null}
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
