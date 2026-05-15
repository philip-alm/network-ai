'use client';

import { useMemo } from 'react';
import { LogOut, Settings } from 'lucide-react';
import { useAgentLoop, ChatThread } from '../chat';
import { useContacts, ContactsAccordion } from '../contacts';

export type HomeScreenProps = {
  userId: string;
  userEmail: string;
  onSignOut: () => void;
};

export function HomeScreen({ userId, userEmail, onSignOut }: HomeScreenProps) {
  const threadId = useMemo(() => crypto.randomUUID(), []);
  const { messages, send, stop, isPending, error, phase, retryHint } = useAgentLoop({
    userId,
    threadId,
  });
  const { contacts, assets } = useContacts();

  return (
    <div className="grid h-screen w-screen grid-rows-[52px_1fr] overflow-hidden">
      <header className="z-20 flex items-center gap-3 border-b border-border-soft bg-bg/95 px-5 backdrop-blur">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight text-fg">network-ai</span>
          <span className="text-xs text-faint font-mono">v0</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden text-xs text-muted sm:inline">{userEmail}</span>
          <a
            href="/settings"
            data-testid="settings-link"
            aria-label="Settings"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-soft hover:text-fg"
          >
            <Settings size={14} aria-hidden />
          </a>
          <button
            type="button"
            onClick={onSignOut}
            data-testid="sign-out"
            aria-label="Sign out"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-soft hover:text-fg"
          >
            <LogOut size={14} aria-hidden />
          </button>
        </div>
      </header>

      <main className="grid min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        <ChatThread
          messages={messages}
          isPending={isPending}
          error={error}
          onSubmit={send}
          onStop={stop}
          phase={phase}
          retryHint={retryHint}
        />
        <ContactsAccordion contacts={contacts} assets={assets} />
      </main>
    </div>
  );
}
