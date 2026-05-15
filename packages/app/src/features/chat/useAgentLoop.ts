'use client';

import { useCallback, useRef, useState } from 'react';
import { runBrowserAgentTurn, type AgentMessage, type AgentToolInvocation } from '../../lib/agent';
import type { ChatMessage } from './MessageBubble';

export type UseAgentLoopOptions = {
  userId: string;
  threadId: string;
};

export type UseAgentLoopResult = {
  messages: ChatMessage[];
  send: (text: string) => Promise<void>;
  stop: () => void;
  isPending: boolean;
  error: string | null;
  streamingText: string;
  streamingToolCalls: AgentToolInvocation[];
  retryHint: string | null;
};

let idSeq = 0;
const nextId = (): string => `m-${++idSeq}-${Date.now()}`;

export function useAgentLoop({ userId, threadId }: UseAgentLoopOptions): UseAgentLoopResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [streamingToolCalls, setStreamingToolCalls] = useState<AgentToolInvocation[]>([]);
  const [retryHint, setRetryHint] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string): Promise<void> => {
      setError(null);
      setStreamingText('');
      setStreamingToolCalls([]);
      setRetryHint(null);

      const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
      setMessages((prev) => [...prev, userMsg]);
      setIsPending(true);

      const historyBeforeThisTurn: AgentMessage[] = messages
        .filter((m): m is ChatMessage => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.text }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await runBrowserAgentTurn({
          threadId,
          userId,
          userMessage: text,
          history: historyBeforeThisTurn,
          abortSignal: controller.signal,
          callbacks: {
            onTextDelta: (delta) => setStreamingText((prev) => prev + delta),
            onToolStart: (tc) =>
              setStreamingToolCalls((prev) => [
                ...prev,
                {
                  name: tc.name,
                  args: tc.args,
                  result: null,
                  status: 'ok',
                },
              ]),
            onToolEnd: (tc) =>
              setStreamingToolCalls((prev) =>
                prev.map((t) =>
                  t.name === tc.name && t.result === null
                    ? { ...t, result: tc.result, status: tc.status, durationMs: tc.durationMs }
                    : t,
                ),
              ),
            onRetry: (attempt, kind) =>
              setRetryHint(`Retrying (attempt ${attempt + 1}) — recoverable ${kind}…`),
          },
        });

        const assistantMsg: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          text: result.text || (result.interrupted ? '(interrupted)' : ''),
          toolCalls: result.toolCalls as AgentToolInvocation[],
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingText('');
        setStreamingToolCalls([]);
        setRetryHint(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsPending(false);
        abortRef.current = null;
      }
    },
    [messages, userId, threadId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    send,
    stop,
    isPending,
    error,
    streamingText,
    streamingToolCalls,
    retryHint,
  };
}
