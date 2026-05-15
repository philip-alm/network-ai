'use client';

import type { AgentToolInvocation } from '../../lib/agent';
import { ToolCallPill } from './ToolCallPill';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: AgentToolInvocation[];
  /** True for the in-flight streaming bubble — renders a blinking cursor. */
  streaming?: boolean;
};

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <div
        data-testid={`bubble-${message.role}`}
        style={{
          maxWidth: '78%',
          padding: '10px 14px',
          borderRadius: 18,
          background: isUser ? '#111' : '#f1f1f1',
          color: isUser ? '#fff' : '#111',
          fontSize: 14,
          lineHeight: 1.4,
          whiteSpace: 'pre-wrap',
        }}
      >
        {!isUser && message.toolCalls && message.toolCalls.length > 0 ? (
          <div style={{ marginBottom: message.text ? 8 : 0 }}>
            {message.toolCalls.map((tc, i) => (
              <ToolCallPill key={i} call={tc} />
            ))}
          </div>
        ) : null}
        {message.text}
        {message.streaming ? (
          <span
            aria-hidden
            data-testid="streaming-cursor"
            style={{ display: 'inline-block', marginLeft: 2 }}
          >
            ▋
          </span>
        ) : null}
      </div>
    </div>
  );
}
