'use client';

import { useState } from 'react';

export type ChatComposerProps = {
  onSubmit: (text: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
};

export function ChatComposer({ onSubmit, disabled, placeholder }: ChatComposerProps) {
  const [value, setValue] = useState('');

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
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
        disabled={disabled}
        rows={2}
        data-testid="chat-input"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
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
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
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
        {disabled ? '…' : 'Send'}
      </button>
    </form>
  );
}
