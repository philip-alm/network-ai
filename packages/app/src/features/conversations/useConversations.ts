'use client';

import { useCallback, useEffect, useState } from 'react';

export type Conversation = {
  id: string;
  title: string;
  /** Unix ms */
  lastMessageAt: number;
};

const STORAGE_KEY = 'reknowable:conversations';

/**
 * useConversations — local-first conversation list. Stored in
 * localStorage for now; the production wiring against `chat_threads`
 * (DB) is a follow-up.
 *
 * The "current" conversation is the one created on mount unless the
 * caller explicitly switches. Switching activates a different thread
 * id; messages re-hydrate.
 */
export function useConversations(initialThreadId: string): {
  conversations: Conversation[];
  currentId: string;
  newConversation: () => string;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  removeConversation: (id: string) => void;
} {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string>(initialThreadId);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Conversation[];
        if (Array.isArray(parsed)) {
          setConversations(parsed.filter((c) => c.id && c.title));
        }
      }
    } catch {
      // localStorage might be unavailable; conversations stay empty.
    }
    // Seed the initial thread as a conversation if it's not in the list.
    setConversations((prev) => {
      if (prev.some((c) => c.id === initialThreadId)) return prev;
      const next: Conversation = {
        id: initialThreadId,
        title: 'New conversation',
        lastMessageAt: Date.now(),
      };
      return [next, ...prev];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      // ignore
    }
  }, [conversations]);

  const newConversation = useCallback((): string => {
    const id = crypto.randomUUID();
    const next: Conversation = {
      id,
      title: 'New conversation',
      lastMessageAt: Date.now(),
    };
    setConversations((prev) => [next, ...prev]);
    setCurrentId(id);
    return id;
  }, []);

  const selectConversation = useCallback((id: string): void => {
    setCurrentId(id);
  }, []);

  const renameConversation = useCallback((id: string, title: string): void => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }, []);

  const removeConversation = useCallback((id: string): void => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return {
    conversations,
    currentId,
    newConversation,
    selectConversation,
    renameConversation,
    removeConversation,
  };
}
