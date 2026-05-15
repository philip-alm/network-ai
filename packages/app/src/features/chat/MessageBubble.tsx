'use client';

import { motion } from 'motion/react';
import type { AgentToolInvocation } from '../../lib/agent';
import { ToolCallCard } from './ToolCallCard';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: AgentToolInvocation[];
  streaming?: boolean;
};

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[88%] ${isUser ? 'order-2' : ''}`}>
        {!isUser && message.toolCalls && message.toolCalls.length > 0 ? (
          <div className="mb-1.5">
            {message.toolCalls.map((tc, i) => (
              <ToolCallCard key={`${message.id}-tc-${i}`} call={tc} />
            ))}
          </div>
        ) : null}

        {message.text || message.streaming ? (
          <div
            data-testid={`bubble-${message.role}`}
            className={
              isUser
                ? 'inline-block rounded-lg bg-fg px-3.5 py-2 text-sm leading-relaxed text-bg'
                : 'whitespace-pre-wrap text-base leading-relaxed tracking-tight text-fg/90'
            }
          >
            {message.text}
            {message.streaming ? <span aria-hidden className="cursor" /> : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
