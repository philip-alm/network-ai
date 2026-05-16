'use client';

import { motion, AnimatePresence } from 'motion/react';
import { ArrowDown, UserPlus, Search, Compass } from 'lucide-react';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import { ChatComposer } from './ChatComposer';
import { useStickToBottom } from './useStickToBottom';
import type { AgentPhase } from '../../lib/agent';
import type { QueuedMessage } from './useAgentLoop';
import { useCascadeIn } from '../contacts/useCascadeIn';

export type ChatThreadProps = {
  messages: ChatMessage[];
  isPending: boolean;
  error: string | null;
  onSubmit: (text: string) => void | Promise<void>;
  onStop?: () => void;
  phase?: AgentPhase;
  retryHint?: string | null;
  /** Queue of messages waiting for the current turn to finish. */
  queue?: QueuedMessage[];
  onRemoveQueued?: (id: string) => void;
  onPopQueueTail?: () => string | null;
  onPushToQueue?: (text: string) => void;
};

type StarterPrompt = {
  verb: 'Add' | 'Find' | 'Ask';
  Icon: typeof UserPlus;
  text: string;
};

const STARTER_PROMPTS: StarterPrompt[] = [
  {
    verb: 'Add',
    Icon: UserPlus,
    text: 'Add Anna Svensson, warmth 2, hardware engineer in Göteborg',
  },
  { verb: 'Find', Icon: Search, text: 'Who do I know in Stockholm?' },
  { verb: 'Ask', Icon: Compass, text: 'What assets are available for a podcast event?' },
];

const PHASE_COPY: Record<AgentPhase, string> = {
  idle: '',
  thinking: 'Thinking',
  running_tools: 'Working on it',
  composing: 'Writing',
  retrying: 'Retrying',
  done: '',
};

export function ChatThread({
  messages,
  isPending,
  error,
  onSubmit,
  onStop,
  phase,
  retryHint,
  queue,
  onRemoveQueued,
  onPopQueueTail,
  onPushToQueue,
}: ChatThreadProps) {
  const { scrollerRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom();

  const last = messages[messages.length - 1];
  const lastIsStreaming = !!last?.streaming;
  const showPhasePill = isPending && phase && phase !== 'idle' && phase !== 'done';

  return (
    <section data-testid="chat-thread" className="relative flex h-full min-h-0 flex-col">
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
        <div
          ref={contentRef}
          className="mx-auto max-w-2xl space-y-5 pl-2 pr-1 py-6 sm:pl-3 sm:pr-1.5"
        >
          {messages.length === 0 && !isPending ? (
            <EmptyState onPick={onSubmit} />
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}

              <AnimatePresence mode="wait" initial={false}>
                {showPhasePill && lastIsStreaming ? (
                  <motion.div
                    key={`phase-${phase}`}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
                    className="flex items-center gap-2 pl-[2px] text-xs text-faint"
                    data-testid="chat-phase"
                  >
                    <PendingDots />
                    <span className="tracking-tight">{PHASE_COPY[phase!]}…</span>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence>
                {retryHint ? (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                    className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted"
                    data-testid="chat-retry-hint"
                    role="status"
                  >
                    <span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-hidden>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
                    </span>
                    {retryHint}
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence>
                {error ? (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                    className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                    data-testid="chat-error"
                    role="alert"
                  >
                    {error}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {!isAtBottom && messages.length > 0 ? (
          <motion.button
            key="scroll-bottom"
            type="button"
            onClick={scrollToBottom}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="group absolute bottom-[96px] left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs text-fg shadow-lift transition-all duration-[160ms] hover:bg-fg hover:text-bg focus-visible:bg-fg focus-visible:text-bg active:scale-[0.95]"
            style={{
              transitionTimingFunction: 'var(--ease-out)',
              WebkitTapHighlightColor: 'transparent',
            }}
            data-testid="scroll-to-bottom"
            aria-label="Scroll to bottom"
          >
            <ArrowDown size={11} aria-hidden />
            <span>New</span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      <ChatComposer
        onSubmit={onSubmit}
        onStop={onStop}
        isPending={isPending}
        queue={queue}
        onRemoveQueued={onRemoveQueued}
        onPopQueueTail={onPopQueueTail}
        onPushToQueue={onPushToQueue}
      />
    </section>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void | Promise<void> }) {
  // Each piece gets its own cascade index, so the empty state arrives
  // top-down: title (0) → body (1) → three starter prompts (2-4). The
  // container itself has no animation — it's the parent stage.
  const titleStyle = useCascadeIn('chat-empty-title', 0);
  const bodyStyle = useCascadeIn('chat-empty-body', 1);
  return (
    <div className="mt-8 space-y-10">
      <div className="space-y-4">
        <h1
          className="text-[2rem] font-medium leading-[1.08] tracking-[-0.028em]"
          style={titleStyle}
        >
          <span className="text-fg">Add anyone you know.</span>{' '}
          <span className="text-muted">I'll remember everything that matters.</span>
        </h1>
        <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted" style={bodyStyle}>
          Just tell me about a contact, a city, or what they do. Ask anything later — I'll surface
          the right person.
        </p>
      </div>
      <div className="space-y-1.5">
        {STARTER_PROMPTS.map((p, i) => (
          <StarterPromptItem
            key={p.text}
            prompt={p}
            // Offset by 2 so prompts follow the title + body in the
            // overall cascade sequence (title=0, body=1, prompts=2..4).
            index={i + 2}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

function StarterPromptItem({
  prompt,
  index,
  onPick,
}: {
  prompt: StarterPrompt;
  index: number;
  onPick: (text: string) => void | Promise<void>;
}) {
  const cascadeStyle = useCascadeIn(`starter-${prompt.text}`, index);
  return (
    <button
      type="button"
      onClick={() => onPick(prompt.text)}
      data-testid="starter-prompt"
      className="group flex w-full items-center gap-2.5 rounded-md border border-border-soft bg-surface-soft/40 px-3 py-2.5 text-left text-[13px] text-muted transition-colors duration-[160ms] hover:border-accent/40 hover:bg-surface-soft hover:text-fg focus-visible:border-accent/40 focus-visible:bg-surface-soft focus-visible:text-fg active:scale-[0.99]"
      style={{
        transitionTimingFunction: 'var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
        ...cascadeStyle,
      }}
    >
      <prompt.Icon
        size={13}
        aria-hidden
        className="shrink-0 text-faint transition-colors duration-[160ms] group-hover:text-accent"
      />
      <span className="min-w-0 flex-1 truncate">{prompt.text}</span>
      <span className="font-mono text-xs text-faint opacity-0 transition-opacity duration-[160ms] group-hover:opacity-100">
        ↵
      </span>
    </button>
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
