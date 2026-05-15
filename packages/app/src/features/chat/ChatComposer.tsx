'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';

export type ChatComposerProps = {
  onSubmit: (text: string) => void | Promise<void>;
  isPending?: boolean;
  onStop?: () => void;
  placeholder?: string;
};

export function ChatComposer({ onSubmit, isPending, onStop, placeholder }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.min(el.scrollHeight, 180);
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
    if (!trimmed || isPending) return;
    setValue('');
    await onSubmit(trimmed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="chat-composer"
      className="border-t border-border-soft bg-bg p-3"
    >
      <div className="group relative flex items-end gap-2 rounded-lg bg-surface-soft p-2 shadow-hairline-soft transition-shadow focus-within:shadow-focus">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder ?? 'Tell me about someone, or ask anything…'}
          disabled={isPending}
          rows={1}
          data-testid="chat-input"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          className="flex-1 resize-none bg-transparent px-2 py-1.5 text-base leading-snug text-fg outline-none placeholder:text-faint disabled:opacity-60"
          style={{ maxHeight: 180 }}
        />
        {isPending && onStop ? (
          <button
            type="button"
            onClick={onStop}
            data-testid="chat-stop"
            aria-label="Stop"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-fg text-bg transition-opacity hover:opacity-90"
          >
            <Square size={12} fill="currentColor" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            disabled={isPending || value.trim().length === 0}
            data-testid="chat-send"
            aria-label="Send"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-fg text-bg transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <ArrowUp size={14} aria-hidden />
          </button>
        )}
      </div>
      <p className="mt-1.5 px-2 text-[11px] text-faint">
        <kbd className="rounded-sm bg-surface-soft px-1 py-0.5 font-mono">/</kbd> to focus ·{' '}
        <kbd className="rounded-sm bg-surface-soft px-1 py-0.5 font-mono">⌘ ↵</kbd> to send
      </p>
    </form>
  );
}
