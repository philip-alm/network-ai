'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import { ChatComposer } from './ChatComposer';

export type ChatThreadProps = {
  messages: ChatMessage[];
  isPending: boolean;
  error: string | null;
  onSubmit: (text: string) => void | Promise<void>;
};

export function ChatThread({ messages, isPending, error, onSubmit }: ChatThreadProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isPending]);

  return (
    <section
      data-testid="chat-thread"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRight: '1px solid #eee',
      }}
    >
      <div ref={scrollerRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.length === 0 ? (
          <p style={{ color: '#999', fontSize: 14, textAlign: 'center', marginTop: 60 }}>
            Tell me about someone you know, or ask "who could help with…"
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {isPending ? (
          <div
            style={{ color: '#999', fontSize: 13, fontStyle: 'italic' }}
            data-testid="chat-pending"
          >
            agent is thinking…
          </div>
        ) : null}
        {error ? (
          <div style={{ color: '#b00', fontSize: 13, marginTop: 8 }} data-testid="chat-error">
            error: {error}
          </div>
        ) : null}
      </div>
      <ChatComposer onSubmit={onSubmit} disabled={isPending} />
    </section>
  );
}
