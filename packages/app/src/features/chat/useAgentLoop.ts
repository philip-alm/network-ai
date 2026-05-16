'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  runBrowserAgentTurn,
  extractMutationRows,
  classifyError,
  type AgentMessage,
  type AgentToolInvocation,
  type AgentPhase,
} from '../../lib/agent';
import type { Segment } from '../../lib/agent/segments';
import { useNetworkStore } from '../../lib/store';
import type { ChatMessage } from './MessageBubble';
import { computeAutoPinUpdate } from './autoPinFromMentions';

export type UseAgentLoopOptions = {
  userId: string;
  threadId: string;
};

export type QueuedMessage = { id: string; text: string };

export type UseAgentLoopResult = {
  messages: ChatMessage[];
  send: (text: string) => Promise<void>;
  stop: () => void;
  isPending: boolean;
  error: string | null;
  /** Coarse phase signal — the "thinking…" pill below the bubble reads this. */
  phase: AgentPhase;
  retryHint: string | null;
  /** Messages the user typed while a previous turn was still running.
   *  Drained one-by-one as `isPending` flips false. */
  queue: QueuedMessage[];
  /** Pop the tail of the queue and return its text. UI binds this to
   *  ArrowUp-on-empty-input so the user can recall + edit. */
  popQueueTail: () => string | null;
  /** Push raw text onto the queue tail. UI binds this to ArrowDown so
   *  the user can re-queue an in-progress draft. */
  pushToQueue: (text: string) => void;
  /** Remove a queued message by id (e.g. the hover-X on a queue bubble). */
  removeQueued: (id: string) => void;
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
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const queueRef = useRef<QueuedMessage[]>([]);
  // Keep the ref in sync so the runAgent prepareStep callback (which is
  // captured at turn-start) reads the freshest queue.
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  const abortRef = useRef<AbortController | null>(null);
  const optimisticHandledRef = useRef<Set<string>>(new Set());
  // Guards the drain effect from firing twice for the same queue head
  // when React re-runs the effect before our setQueue commits.
  const drainingRef = useRef(false);
  // Splitting state: when steering injects mid-turn we freeze the
  // current assistant bubble and spawn a new one. `currentAssistantIdRef`
  // tracks which bubble subsequent segment updates go to.
  // `segmentSplitIndexRef` is the cumulative segments length AT the
  // point of the latest split, so we can slice the cumulative array
  // emitted by runAgent into the post-split slice for the active bubble.
  const currentAssistantIdRef = useRef<string | null>(null);
  const segmentSplitIndexRef = useRef(0);
  const cumulativeSegmentsLenRef = useRef(0);

  const storeActions = useNetworkStore((s) => s.actions);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // If a turn is already running, queue the message instead of
      // dropping it. The drain effect picks it up when isPending flips.
      if (isPending) {
        setQueue((q) => [...q, { id: nextId(), text: trimmed }]);
        return;
      }
      setError(null);
      setPhase('thinking');
      setRetryHint(null);
      optimisticHandledRef.current = new Set();

      const userMsg: ChatMessage = { id: nextId(), role: 'user', text: trimmed };
      const assistantId = nextId();
      const placeholder: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: '',
        segments: [],
        streaming: true,
      };

      // Reset split tracking for this turn.
      currentAssistantIdRef.current = assistantId;
      segmentSplitIndexRef.current = 0;
      cumulativeSegmentsLenRef.current = 0;

      // Read history SYNCHRONOUSLY from the closure — React 18 queues
      // setState updates, so reading inside the setMessages updater
      // would be too late: runBrowserAgentTurn fires before the updater
      // runs and the LLM gets empty history every turn (bug 2026-05-15).
      const historyBeforeThisTurn = buildHistoryForLlm(messages);

      setMessages((prev) => [...prev, userMsg, placeholder]);
      setIsPending(true);

      // Update the *currently-active* assistant bubble (tracked via ref
      // so it can change mid-turn when steering splits).
      const updateAssistant = (mut: (m: ChatMessage) => ChatMessage): void => {
        const id = currentAssistantIdRef.current;
        if (!id) return;
        setMessages((prev) => {
          const next = prev.slice();
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].id === id) {
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
          userMessage: trimmed,
          history: historyBeforeThisTurn,
          abortSignal: controller.signal,
          getPendingQueue: () => queueRef.current.map((q) => q.text),
          clearPendingQueue: () => setQueue([]),
          callbacks: {
            onSegmentsUpdate: (segs) => {
              // runAgent emits CUMULATIVE segments across the whole
              // streamText call. After a split, the live bubble should
              // only show segments produced since the split.
              cumulativeSegmentsLenRef.current = segs.length;
              const sliced = segs.slice(segmentSplitIndexRef.current);
              updateAssistant((m) => ({ ...m, segments: sliced }));
            },
            onPhaseChange: (p) => setPhase(p),
            onToolEnd: (tc) => {
              if (optimisticHandledRef.current.has(tc.id)) return;
              optimisticHandledRef.current.add(tc.id);
              applyOptimistic(tc, storeActions);
            },
            onRetry: (attempt) => setRetryHint(`Reconnecting. Attempt ${attempt + 1}.`),
            onSteeringInjected: (texts) => {
              // SPLIT THE BUBBLE so the queued user messages land
              // chronologically — between what the AI said before
              // your input arrived and what it says next in response.
              //
              //   1. Freeze the current assistant bubble in place (mark
              //      not-streaming, keep its current segments slice).
              //   2. Append user bubbles for each queued message.
              //   3. Spawn a fresh streaming assistant bubble.
              //   4. Advance the split index so subsequent cumulative
              //      segments-emissions slice into the new bubble.
              const prevId = currentAssistantIdRef.current;
              const newAssistantId = nextId();
              const userBubbles: ChatMessage[] = texts.map((t) => ({
                id: nextId(),
                role: 'user',
                text: t,
              }));
              setMessages((prev) => {
                const next = prev.map((m) => (m.id === prevId ? { ...m, streaming: false } : m));
                next.push(...userBubbles);
                next.push({
                  id: newAssistantId,
                  role: 'assistant',
                  text: '',
                  segments: [],
                  streaming: true,
                });
                return next;
              });
              currentAssistantIdRef.current = newAssistantId;
              segmentSplitIndexRef.current = cumulativeSegmentsLenRef.current;
            },
          },
        });

        // Final commit for the currently-active bubble. Slice segments
        // into the post-split slice in case a steering split happened.
        const finalSegments = result.segments.slice(segmentSplitIndexRef.current);
        const finalText = result.text || (result.interrupted ? 'Stopped.' : '');
        updateAssistant((m) => ({
          ...m,
          text: finalText,
          toolCalls: result.toolCalls as AgentToolInvocation[],
          segments: finalSegments,
          streaming: false,
        }));

        // Protocol-level RULE 1 enforcement: every contact the agent
        // mentioned via [Name](contact:UUID) in its final text MUST be
        // in the pinned set. The agent's `set_panel` calls don't always
        // cover its own mentions (failure mode reproduced on 2026-05-16);
        // this guarantees the invariant from the UI side. See
        // `autoPinFromMentions.ts` for the why-this-exists comment.
        if (!result.interrupted) {
          const currentPinned = useNetworkStore.getState().panel.pinnedContactIds;
          const update = computeAutoPinUpdate(finalText, currentPinned);
          if (update) {
            storeActions.setPanelState(
              { pinnedContactIds: update.nextPinned },
              { source: 'agent' },
            );
          }
        }

        setPhase('idle');
        setRetryHint(null);
        // Belt-and-suspenders: trigger a network-side refetch in case
        // the optimistic path missed any rows (e.g. a bulk insert with
        // an unusual return shape) or Realtime is lagging. useContacts
        // listens for this event and re-hydrates the store.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('reknowable:network-changed'));
        }
      } catch (err) {
        setError(friendlyErrorMessage(err));
        setPhase('idle');
        // Mark the placeholder as no-longer-streaming so the cursor stops.
        updateAssistant((m) => ({ ...m, streaming: false }));
      } finally {
        setIsPending(false);
        abortRef.current = null;
      }
    },
    [isPending, messages, userId, threadId, storeActions],
  );

  // Drain the queue: when a turn finishes, bundle ALL queued messages
  // into one composite send (joined by newlines) and clear the queue.
  // The `drainingRef` guard keeps this effect idempotent if it re-runs
  // before our setQueue commits.
  useEffect(() => {
    if (isPending || queue.length === 0 || drainingRef.current) return;
    const bundled = queue.map((q) => q.text).join('\n');
    drainingRef.current = true;
    setQueue([]);
    void send(bundled).finally(() => {
      drainingRef.current = false;
    });
  }, [isPending, queue, send]);

  const popQueueTail = useCallback((): string | null => {
    let popped: string | null = null;
    setQueue((q) => {
      if (q.length === 0) return q;
      popped = q[q.length - 1].text;
      return q.slice(0, -1);
    });
    return popped;
  }, []);

  const pushToQueue = useCallback((text: string): void => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQueue((q) => [...q, { id: nextId(), text: trimmed }]);
  }, []);

  const removeQueued = useCallback((id: string): void => {
    setQueue((q) => q.filter((m) => m.id !== id));
  }, []);

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
    queue,
    popQueueTail,
    pushToQueue,
    removeQueued,
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

/**
 * Translate the raw thrown error into a user-facing line that follows
 * BRAND.md: lead with what to do, not what failed. Reference codes /
 * stack fragments stay in the dev recorder, not in the UI.
 */
function friendlyErrorMessage(err: unknown): string {
  const classified = classifyError(err);
  switch (classified.kind) {
    case 'recoverable_stream_stalled':
      return 'Connection went quiet. Try again in a moment.';
    case 'recoverable_stream_errored':
      return "Couldn't reach the assistant. Try again in a moment.";
    case 'recoverable_truncated':
      return 'The reply was cut short. Try again.';
    case 'recoverable_rate_limited':
      return 'Slow down for a moment. Try again shortly.';
    case 'fatal_auth':
      return 'Sign in again to continue.';
    case 'fatal_malformed_history':
      return 'Conversation state got tangled. Start a new thread.';
    case 'fatal_provider':
      return "Couldn't reach the assistant. Try again in a moment.";
  }
}

function applyOptimistic(
  tc: { name: string; args: unknown; result: unknown },
  actions: ReturnType<typeof useNetworkStore.getState>['actions'],
): void {
  if (tc.name !== 'mutate_sql') return;
  const rows = extractMutationRows(tc.args, tc.result);

  // CRITICAL: only optimistic-upsert rows whose id is ALREADY in the
  // loaded set (i.e. UPDATES — patch in place, no position change).
  // For brand-new ids (INSERTs), do nothing — the refetch fired below
  // will bring the row in at its correct server-sorted position. If we
  // prepended new rows here, the user would see a "shift to position 0
  // → re-sort to position 47" double jump that looks chaotic.
  const state = useNetworkStore.getState();
  const knownContactIds = new Set(state.contacts.map((c) => c.id));
  const knownAssetIds = new Set(state.assets.map((a) => a.id));

  const contactUpdates = rows.upsertContacts.filter((c) => knownContactIds.has(c.id));
  const assetUpdates = rows.upsertAssets.filter((a) => knownAssetIds.has(a.id));

  if (contactUpdates.length > 0) actions.upsertContacts(contactUpdates);
  if (assetUpdates.length > 0) actions.upsertAssets(assetUpdates);

  // Deletes are always optimistic — vanishing IS the user intent. The
  // refetch confirms.
  for (const id of rows.removeContactIds) actions.removeContact(id);
  for (const id of rows.removeAssetIds) actions.removeAsset(id);

  // Trigger the refetch immediately so brand-new rows appear in the
  // correct sort position within ~100ms. Without this, new rows would
  // wait until the agent's turn fully ended.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reknowable:network-changed'));
  }
}

// Re-export for callers that still want a streamingSegments slot —
// kept as `messages[last]?.segments` derivation.
export type { Segment };
