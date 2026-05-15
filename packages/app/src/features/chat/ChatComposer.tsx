'use client';

import { useState } from 'react';

export type ChatComposerProps = {
  onSubmit: (text: string) => void | Promise<void>;
  /** When true, composer is locked + Send becomes Stop. */
  isPending?: boolean;
  /** Called when the user clicks Stop (only relevant while isPending). */
  onStop?: () => void;
  placeholder?: string;
};

export function ChatComposer({ onSubmit, isPending, onStop, placeholder }: ChatComposerProps) {
  const [value, setValue] = useState('');

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
      style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #eee' }}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? 'What would you like to do?'}
        disabled={isPending}
        rows={2}
        data-testid="chat-input"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit(e as unknown as React.FormEvent);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e as unknown as React.FormEvent);
          }
        }}
        style={{
          flex: 1,
          resize: 'none',
          padding: '8px 12px',
          fontSize: 14,
          border: '1px solid #ddd',
          borderRadius: 8,
          fontFamily: 'inherit',
        }}
      />
      {isPending && onStop ? (
        <button
          type="button"
          onClick={onStop}
          data-testid="chat-stop"
          style={{
            padding: '0 16px',
            background: '#b00',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={isPending || value.trim().length === 0}
          data-testid="chat-send"
          style={{
            padding: '0 16px',
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          {isPending ? '…' : 'Send'}
        </button>
      )}
    </form>
  );
}
