'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import { ChatComposer } from './ChatComposer';
import type { AgentToolInvocation } from '../../lib/agent';

export type ChatThreadProps = {
  messages: ChatMessage[];
  isPending: boolean;
  error: string | null;
  onSubmit: (text: string) => void | Promise<void>;
  onStop?: () => void;
  /** In-flight streaming text for the assistant's current turn. */
  streamingText?: string;
  /** In-flight tool-call statuses. */
  streamingToolCalls?: AgentToolInvocation[];
  /** Display "retrying because X…" while teach-retry is active. */
  retryHint?: string | null;
};

const STARTER_PROMPTS = [
  'Add Anna Svensson, warmth 2, hardware engineer in Göteborg',
  'Who do I know in Stockholm?',
  'What assets do I have for a podcast event?',
];

export function ChatThread({
  messages,
  isPending,
  error,
  onSubmit,
  onStop,
  streamingText,
  streamingToolCalls,
  retryHint,
}: ChatThreadProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isPending, streamingText, streamingToolCalls?.length]);

  const inFlightAssistant: ChatMessage | null =
    isPending && (streamingText || (streamingToolCalls?.length ?? 0) > 0)
      ? {
          id: 'streaming',
          role: 'assistant',
          text: streamingText ?? '',
          toolCalls: streamingToolCalls,
          streaming: true,
        }
      : null;

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
        {messages.length === 0 && !inFlightAssistant ? (
          <div style={{ marginTop: 60, textAlign: 'center' }}>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
              Tell me about someone you know, or try one of these:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSubmit(p)}
                  data-testid={`starter-prompt`}
                  style={{
                    padding: '8px 14px',
                    border: '1px solid #ddd',
                    borderRadius: 999,
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#333',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {inFlightAssistant ? <MessageBubble message={inFlightAssistant} /> : null}
          </>
        )}
        {isPending && !inFlightAssistant ? (
          <div
            style={{ color: '#999', fontSize: 13, fontStyle: 'italic' }}
            data-testid="chat-pending"
          >
            agent is thinking…
          </div>
        ) : null}
        {retryHint ? (
          <div
            style={{ color: '#a76b00', fontSize: 12, marginTop: 8 }}
            data-testid="chat-retry-hint"
          >
            {retryHint}
          </div>
        ) : null}
        {error ? (
          <div style={{ color: '#b00', fontSize: 13, marginTop: 8 }} data-testid="chat-error">
            error: {error}
          </div>
        ) : null}
      </div>
      <ChatComposer onSubmit={onSubmit} onStop={onStop} isPending={isPending} />
    </section>
  );
}
