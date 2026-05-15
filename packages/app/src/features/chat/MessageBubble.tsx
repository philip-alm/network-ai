'use client';

import type { AgentToolInvocation } from '../../lib/agent';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: AgentToolInvocation[];
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
        {message.text}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 ? (
          <details style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            <summary style={{ cursor: 'pointer' }}>
              {message.toolCalls.length} tool call{message.toolCalls.length === 1 ? '' : 's'}
            </summary>
            <ul style={{ margin: '6px 0 0 0', paddingLeft: 18 }}>
              {message.toolCalls.map((tc, i) => (
                <li key={i}>
                  <code>{tc.name}</code>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}
