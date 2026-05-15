'use client';

import { useCallback, useRef, useState } from 'react';
import {
  runBrowserAgentTurn,
  parseToolResult,
  type AgentMessage,
  type AgentToolInvocation,
} from '../../lib/agent';
import { useNetworkStore } from '../../lib/store';
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

/**
 * Drives the agent loop AND mirrors every successful tool mutation into the
 * cross-pane store optimistically, so the accordion reflects changes the
 * instant the tool returns — before Supabase Realtime echoes it back.
 */
export function useAgentLoop({ userId, threadId }: UseAgentLoopOptions): UseAgentLoopResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [streamingToolCalls, setStreamingToolCalls] = useState<AgentToolInvocation[]>([]);
  const [retryHint, setRetryHint] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const storeActions = useNetworkStore((s) => s.actions);

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
                { name: tc.name, args: tc.args, result: null, status: 'ok' },
              ]),
            onToolEnd: (tc) => {
              setStreamingToolCalls((prev) =>
                prev.map((t) =>
                  t.name === tc.name && t.result === null
                    ? { ...t, result: tc.result, status: tc.status, durationMs: tc.durationMs }
                    : t,
                ),
              );
              // Optimistic store merge — keeps the accordion in sync within ~50ms
              // of the tool returning, well ahead of Supabase Realtime echo.
              applyOptimistic(tc, storeActions);
            },
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
    [messages, userId, threadId, storeActions],
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

/**
 * Apply optimistic upserts/removes to the cross-pane store based on the
 * parsed tool result. No-op when the tool isn't a mutation or didn't
 * return a recognizable row.
 */
function applyOptimistic(
  tc: { name: string; args: unknown; result: unknown },
  actions: ReturnType<typeof useNetworkStore.getState>['actions'],
): void {
  const parsed = parseToolResult(tc.name, tc.args, tc.result);
  if (!parsed) return;
  switch (parsed.kind) {
    case 'contact_added':
    case 'contact_updated':
      actions.upsertContacts([parsed.contact]);
      break;
    case 'contact_deleted':
      actions.removeContact(parsed.contact.id);
      break;
    case 'asset_added':
    case 'asset_updated':
      actions.upsertAssets([parsed.asset]);
      break;
    case 'asset_deleted':
      actions.removeAsset(parsed.asset.id);
      break;
    default:
      break;
  }
}
