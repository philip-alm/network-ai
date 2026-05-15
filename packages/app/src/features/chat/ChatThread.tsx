'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import { ChatComposer } from './ChatComposer';
import type { AgentToolInvocation } from '../../lib/agent';

export type ChatThreadProps = {
  messages: ChatMessage[];
  isPending: boolean;
  error: string | null;
  onSubmit: (text: string) => void | Promise<void>;
  onStop?: () => void;
  streamingText?: string;
  streamingToolCalls?: AgentToolInvocation[];
  retryHint?: string | null;
};

const STARTER_PROMPTS = [
  'Add Anna Svensson, warmth 2, hardware engineer in Göteborg',
  'Who do I know in Stockholm?',
  'What assets are available for a podcast event?',
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

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages.length, isPending, streamingText, streamingToolCalls?.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const inFlight: ChatMessage | null =
    isPending && (streamingText || (streamingToolCalls?.length ?? 0) > 0)
      ? {
          id: '__streaming__',
          role: 'assistant',
          text: streamingText ?? '',
          toolCalls: streamingToolCalls,
          streaming: true,
        }
      : null;

  return (
    <section
      data-testid="chat-thread"
      className="flex h-full min-h-0 flex-col border-r border-border-soft bg-bg"
    >
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto scroll-smooth">
        <div className="mx-auto max-w-2xl space-y-5 px-6 py-8">
          {messages.length === 0 && !inFlight ? (
            <EmptyState onPick={onSubmit} />
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              <AnimatePresence>
                {inFlight ? <MessageBubble key={inFlight.id} message={inFlight} /> : null}
              </AnimatePresence>
            </>
          )}

          {isPending && !inFlight ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-sm text-muted"
              data-testid="chat-pending"
            >
              <PendingDots /> Thinking
            </motion.div>
          ) : null}

          {retryHint ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-fg/80"
              data-testid="chat-retry-hint"
            >
              {retryHint}
            </motion.div>
          ) : null}

          {error ? (
            <div
              className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
              data-testid="chat-error"
              role="alert"
            >
              {error}
            </div>
          ) : null}
        </div>
      </div>
      <ChatComposer onSubmit={onSubmit} onStop={onStop} isPending={isPending} />
    </section>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void | Promise<void> }) {
  return (
    <div className="mt-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tighter text-fg">
          Your network, kept where it counts.
        </h1>
        <p className="mt-2 text-base text-muted">
          Tell me about someone you know, ask about assets, or query freely. I'll keep everything
          organized on the right.
        </p>
      </div>
      <div className="space-y-2">
        {STARTER_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            data-testid="starter-prompt"
            className="group flex w-full items-center justify-between rounded-md bg-surface-soft px-3.5 py-2.5 text-left text-sm text-fg/85 transition-colors hover:bg-bg hover:shadow-hairline"
          >
            <span>{p}</span>
            <span className="text-faint transition-colors group-hover:text-accent">↵</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PendingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-faint"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}
