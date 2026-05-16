'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUp, Square, X } from 'lucide-react';
import { WithTooltip } from '../ui';
import type { QueuedMessage } from './useAgentLoop';

export type ChatComposerProps = {
  onSubmit: (text: string) => void | Promise<void>;
  isPending?: boolean;
  onStop?: () => void;
  placeholder?: string;
  /** Messages queued while the AI is mid-turn. Rendered above the input. */
  queue?: QueuedMessage[];
  /** Remove a queued message by id (hover-X). */
  onRemoveQueued?: (id: string) => void;
  /** Pop the tail of the queue + return its text (Arrow Up). */
  onPopQueueTail?: () => string | null;
  /** Push current draft to queue (Arrow Down). */
  onPushToQueue?: (text: string) => void;
};

const MAX_HEIGHT = 200;

export function ChatComposer({
  onSubmit,
  isPending,
  onStop,
  placeholder,
  queue,
  onRemoveQueued,
  onPopQueueTail,
  onPushToQueue,
}: ChatComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${next}px`;
  }, [value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (e.key === '/' && !inField) {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue('');
    // Keep focus so the user can keep typing. Submits-while-pending get
    // queued downstream; submits while idle send immediately.
    queueMicrotask(() => textareaRef.current?.focus());
    await onSubmit(trimmed);
  };

  // Send button shows whenever there's text — sends immediately if idle,
  // queues if a turn is in flight. Stop only shows when there's nothing
  // to send (so the corner button has one meaning at a time).
  const hasText = value.trim().length > 0;
  const showStop = !!isPending && !!onStop && !hasText;
  const showSend = hasText;

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="chat-composer"
      className="px-1 pb-1 sm:px-1.5 sm:pb-1.5"
    >
      <QueueStack queue={queue ?? []} onRemove={onRemoveQueued} />
      <div
        className="group relative flex min-h-[104px] flex-col rounded-xl bg-surface-soft shadow-hairline-soft focus-within:shadow-focus"
        style={{ transition: 'box-shadow 200ms var(--ease-out)' }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            placeholder ??
            (isPending
              ? 'Keep typing — your next message will queue.'
              : 'Tell me about someone, or ask anything.')
          }
          rows={1}
          data-testid="chat-input"
          onKeyDown={(e) => {
            // Arrow Up on empty input → recall the latest queued message
            // so the user can edit it. Only fires when input is empty so
            // it doesn't fight with normal caret motion.
            if (e.key === 'ArrowUp' && value === '' && (queue?.length ?? 0) > 0 && onPopQueueTail) {
              const text = onPopQueueTail();
              if (text != null) {
                e.preventDefault();
                setValue(text);
                return;
              }
            }
            // Arrow Down at end-of-text → re-queue the current draft and
            // clear the input. Only fires when the caret is at the very
            // end so multi-line navigation still works.
            if (e.key === 'ArrowDown' && value.trim().length > 0 && onPushToQueue) {
              const ta = e.target as HTMLTextAreaElement;
              const atEnd =
                ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;
              if (atEnd) {
                e.preventDefault();
                onPushToQueue(value);
                setValue('');
                return;
              }
            }
            // Enter sends. Shift+Enter falls through to the browser
            // default and inserts a newline.
            if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          className="flex-1 resize-none bg-transparent px-3.5 pb-11 pt-3 text-[14px] leading-relaxed text-fg outline-none placeholder:text-faint"
          style={{ maxHeight: MAX_HEIGHT }}
        />
        <div className="absolute bottom-2 right-2">
          {showStop ? (
            <WithTooltip label="Stop" side="top">
              <button
                type="button"
                onClick={onStop}
                data-testid="chat-stop"
                aria-label="Stop"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-fg text-bg transition-all duration-[160ms] hover:opacity-90 focus-visible:opacity-90 active:scale-[0.92]"
                style={{
                  transitionTimingFunction: 'var(--ease-out)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Square size={10} fill="currentColor" aria-hidden />
              </button>
            </WithTooltip>
          ) : (
            <WithTooltip label={isPending ? 'Queue message' : 'Send'} shortcut="↵" side="top">
              <button
                type="submit"
                disabled={!showSend}
                data-testid="chat-send"
                aria-label={isPending ? 'Queue message' : 'Send'}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-all duration-[160ms] active:scale-[0.92] disabled:active:scale-100 ${
                  showSend
                    ? 'bg-accent text-bg hover:opacity-90 focus-visible:opacity-90'
                    : 'bg-bg text-faint shadow-hairline-soft'
                }`}
                style={{
                  transitionTimingFunction: 'var(--ease-out)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <ArrowUp size={13} aria-hidden strokeWidth={2.25} />
              </button>
            </WithTooltip>
          )}
        </div>
      </div>
      <p className="mt-2 px-2 text-center text-[11px] leading-tight text-faint">
        Reknowable can be wrong. Double-check what matters.
      </p>
    </form>
  );
}

/**
 * QueueStack — list of pending user messages waiting for the current
 * turn to finish. Lives just above the composer panel. Each item has a
 * hover-X to drop it; press ArrowUp in the empty composer to pop the
 * latest item back into the input for editing.
 */
function QueueStack({
  queue,
  onRemove,
}: {
  queue: QueuedMessage[];
  onRemove?: (id: string) => void;
}) {
  if (queue.length === 0) return null;
  return (
    <div
      className="mb-1.5 flex flex-col gap-1 px-1"
      role="list"
      aria-label={`${queue.length} queued message${queue.length === 1 ? '' : 's'}`}
    >
      <AnimatePresence initial={false}>
        {queue.map((q) => (
          <motion.div
            key={q.id}
            layout="position"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            role="listitem"
            className="group flex items-center gap-2 rounded-md bg-surface-soft px-3 py-1.5 shadow-hairline-soft"
          >
            <span
              aria-hidden
              className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint shrink-0"
            >
              Queued
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{q.text}</span>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(q.id)}
                aria-label="Remove queued message"
                data-testid={`queue-remove-${q.id}`}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-faint opacity-0 transition-all duration-[140ms] hover:bg-bg hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 active:scale-[0.9]"
                style={{
                  transitionTimingFunction: 'var(--ease-out)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <X size={11} aria-hidden />
              </button>
            ) : null}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
