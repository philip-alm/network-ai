'use client';

import { useMemo } from 'react';
import { useAgentLoop, ChatThread } from '../chat';
import { useContacts, ContactsAccordion } from '../contacts';

export type HomeScreenProps = {
  userId: string;
  userEmail: string;
  onSignOut: () => void;
};

export function HomeScreen({ userId, userEmail, onSignOut }: HomeScreenProps) {
  const threadId = useMemo(() => crypto.randomUUID(), []);
  const { messages, send, stop, isPending, error, streamingText, streamingToolCalls, retryHint } =
    useAgentLoop({ userId, threadId });
  const { contacts, assets, refetch } = useContacts();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: '48px 1fr',
        gridTemplateColumns: '1fr 1fr',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        style={{
          gridColumn: '1 / -1',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          borderBottom: '1px solid #eee',
          fontSize: 14,
        }}
      >
        <strong>network-ai</strong>
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: 13 }}>{userEmail}</span>
        <a
          href="/settings"
          data-testid="settings-link"
          style={{
            marginLeft: 16,
            padding: '4px 10px',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: 6,
            fontSize: 13,
            textDecoration: 'none',
          }}
        >
          Settings
        </a>
        <button
          type="button"
          onClick={onSignOut}
          data-testid="sign-out"
          style={{
            marginLeft: 8,
            padding: '4px 10px',
            background: 'transparent',
            border: '1px solid #ddd',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Sign out
        </button>
      </header>
      <ChatThread
        messages={messages}
        isPending={isPending}
        error={error}
        onSubmit={send}
        onStop={stop}
        streamingText={streamingText}
        streamingToolCalls={streamingToolCalls}
        retryHint={retryHint}
      />
      <ContactsAccordion contacts={contacts} assets={assets} onChange={refetch} />
    </div>
  );
}
