'use client';

import { useCallback, useRef, useState } from 'react';
import {
  runBrowserAgentTurn,
  parseToolResult,
  type AgentMessage,
  type AgentToolInvocation,
  type AgentPhase,
} from '../../lib/agent';
import type { Segment } from '../../lib/agent/segments';
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
  /** Ordered (text | tool) segments of the in-flight turn — render this. */
  streamingSegments: Segment[];
  phase: AgentPhase;
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
  const [streamingSegments, setStreamingSegments] = useState<Segment[]>([]);
  const [phase, setPhase] = useState<AgentPhase>('idle');
  const [retryHint, setRetryHint] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const storeActions = useNetworkStore((s) => s.actions);

  const send = useCallback(
    async (text: string): Promise<void> => {
      setError(null);
      setStreamingSegments([]);
      setPhase('thinking');
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
            onSegmentsUpdate: (segs) => setStreamingSegments(segs),
            onPhaseChange: (p) => setPhase(p),
            onToolEnd: (tc) => applyOptimistic(tc, storeActions),
            onRetry: (attempt, kind) =>
              setRetryHint(`Retrying (attempt ${attempt + 1}) — recoverable ${kind}…`),
          },
        });

        const assistantMsg: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          text: result.text || (result.interrupted ? '(interrupted)' : ''),
          toolCalls: result.toolCalls as AgentToolInvocation[],
          segments: result.segments,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingSegments([]);
        setPhase('idle');
        setRetryHint(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('idle');
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
    streamingSegments,
    phase,
    retryHint,
  };
}

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
