'use client';

import { useCallback, useState } from 'react';
import { runBrowserAgentTurn, type AgentMessage, type AgentToolInvocation } from '../../lib/agent';
import type { ChatMessage } from './MessageBubble';

export type UseAgentLoopOptions = {
  userId: string;
  threadId: string;
};

export type UseAgentLoopResult = {
  messages: ChatMessage[];
  send: (text: string) => Promise<void>;
  isPending: boolean;
  error: string | null;
};

let idSeq = 0;
const nextId = (): string => `m-${++idSeq}-${Date.now()}`;

/**
 * Drives the agent loop for a chat UI. Each user message kicks off a real
 * runBrowserAgentTurn (goes through agent-chat Edge Function), and the
 * assistant's reply lands as a new message once the turn completes.
 */
export function useAgentLoop({ userId, threadId }: UseAgentLoopOptions): UseAgentLoopResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string): Promise<void> => {
      setError(null);
      const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
      setMessages((prev) => [...prev, userMsg]);
      setIsPending(true);

      const historyBeforeThisTurn: AgentMessage[] = messages
        .filter((m): m is ChatMessage => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.text }));

      try {
        const result = await runBrowserAgentTurn({
          threadId,
          userId,
          userMessage: text,
          history: historyBeforeThisTurn,
        });
        const assistantMsg: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          text: result.text,
          toolCalls: result.toolCalls as AgentToolInvocation[],
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsPending(false);
      }
    },
    [messages, userId, threadId],
  );

  return { messages, send, isPending, error };
}
