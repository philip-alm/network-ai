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
  /** Coarse phase signal — the "thinking…" pill below the bubble reads this. */
  phase: AgentPhase;
  retryHint: string | null;
};

let idSeq = 0;
const nextId = (): string => `m-${++idSeq}-${Date.now()}`;

/**
 * Drives the agent loop AND mirrors every successful tool mutation into the
 * cross-pane store optimistically, so the accordion reflects changes the
 * instant the tool returns — before Supabase Realtime echoes it back.
 *
 * Single-bubble flow (no flash on commit):
 *   1. send() pushes [user, placeholder-assistant{streaming:true, segments:[]}]
 *   2. onSegmentsUpdate mutates messages[last].segments in place via functional setState
 *   3. on done: flip messages[last].streaming = false (same React element)
 *
 * The assistant bubble mounts ONCE and stays in the messages array — never
 * replaced — so AnimatePresence never runs an exit animation on it, and
 * React's reconciliation keeps the same DOM node.
 */
export function useAgentLoop({ userId, threadId }: UseAgentLoopOptions): UseAgentLoopResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<AgentPhase>('idle');
  const [retryHint, setRetryHint] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const optimisticHandledRef = useRef<Set<string>>(new Set());

  const storeActions = useNetworkStore((s) => s.actions);

  const send = useCallback(
    async (text: string): Promise<void> => {
      setError(null);
      setPhase('thinking');
      setRetryHint(null);
      optimisticHandledRef.current = new Set();

      const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
      const assistantId = nextId();
      const placeholder: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: '',
        segments: [],
        streaming: true,
      };

      // Read history SYNCHRONOUSLY from the closure — React 18 queues
      // setState updates, so reading inside the setMessages updater
      // would be too late: runBrowserAgentTurn fires before the updater
      // runs and the LLM gets empty history every turn (bug 2026-05-15).
      const historyBeforeThisTurn = buildHistoryForLlm(messages);

      setMessages((prev) => [...prev, userMsg, placeholder]);
      setIsPending(true);

      const updateAssistant = (mut: (m: ChatMessage) => ChatMessage): void => {
        setMessages((prev) => {
          const next = prev.slice();
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].id === assistantId) {
              next[i] = mut(next[i]);
              break;
            }
          }
          return next;
        });
      };

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
            onSegmentsUpdate: (segs) => updateAssistant((m) => ({ ...m, segments: segs })),
            onPhaseChange: (p) => setPhase(p),
            onToolEnd: (tc) => {
              if (optimisticHandledRef.current.has(tc.id)) return;
              optimisticHandledRef.current.add(tc.id);
              applyOptimistic(tc, storeActions);
            },
            onRetry: (attempt, kind) =>
              setRetryHint(`Retrying (attempt ${attempt + 1}) — recoverable ${kind}…`),
          },
        });

        updateAssistant((m) => ({
          ...m,
          text: result.text || (result.interrupted ? '(interrupted)' : ''),
          toolCalls: result.toolCalls as AgentToolInvocation[],
          segments: result.segments,
          streaming: false,
        }));
        setPhase('idle');
        setRetryHint(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('idle');
        // Mark the placeholder as no-longer-streaming so the cursor stops.
        updateAssistant((m) => ({ ...m, streaming: false }));
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
    phase,
    retryHint,
  };
}

/**
 * Build the [role, content] history sent to the LLM next turn.
 *
 * Rules:
 *  - Drop any streaming placeholder (text === '', streaming===true).
 *  - For finalized assistant turns, prefer the joined text-segments over
 *    `message.text` — `streamText`'s `result.text` only contains the
 *    LAST step's text in a multi-step turn, so the joined segments are
 *    the complete record of what the assistant said across all steps.
 *  - Drop assistant turns with no text after the join (pure tool-call
 *    turns with no narration — uncommon but possible).
 */
export function buildHistoryForLlm(messages: ChatMessage[]): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (const m of messages) {
    if (m.streaming) continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    let content = m.text ?? '';
    if (m.role === 'assistant' && m.segments && m.segments.length > 0) {
      const joined = m.segments
        .filter((s): s is { kind: 'text'; text: string } => s.kind === 'text')
        .map((s) => s.text)
        .join('\n\n')
        .trim();
      if (joined.length > content.length) content = joined;
    }
    if (!content) continue;
    out.push({ role: m.role, content });
  }
  return out;
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

// Re-export for callers that still want a streamingSegments slot —
// kept as `messages[last]?.segments` derivation.
export type { Segment };
