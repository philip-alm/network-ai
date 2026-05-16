/**
 * browserAgent — wires the agent loop for the browser:
 *   - Provider points at our agent-chat Edge Function (key stays server-side)
 *   - embedQuery points at our embed-query Edge Function
 *   - Supabase comes from getBrowserSupabase()
 *
 * Use this from React components via the useAgentLoop hook.
 */

'use client';

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { getBrowserSupabase } from '../supabase';
import { useNetworkStore } from '../store';
import { env } from '../env';
import {
  runAgentTurn,
  type AgentTurnResult,
  type AgentMessage,
  type StreamingCallbacks,
} from './runAgent';
import { MODEL_ID } from './systemPrompt';
import { browserEmbedQuery } from './browserEmbedQuery';
import { createHttpDebugRecorder } from './httpDebugRecorder';
import { noopDebugRecorder } from './debugRecorder';

export type BrowserAgentInput = {
  threadId: string;
  userId: string;
  userMessage: string;
  history?: AgentMessage[];
  abortSignal?: AbortSignal;
  callbacks?: StreamingCallbacks;
  /** Mid-turn steering — read fresh queue + clear after injection. */
  getPendingQueue?: () => string[];
  clearPendingQueue?: () => void;
};

/** Drive one agent turn in the browser. */
export async function runBrowserAgentTurn(input: BrowserAgentInput): Promise<AgentTurnResult> {
  const supabase = getBrowserSupabase();
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error('runBrowserAgentTurn: not signed in');

  const provider = createOpenAICompatible({
    name: 'agent-chat',
    baseURL: `${env.supabaseUrl}/functions/v1/agent-chat`,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  // Dev-only: capture byte-exact browser turns to disk via the
  // /api/debug/recorder endpoint so failures can be diagnosed without
  // DevTools or screenshots. Falls back to no-op in prod or when the
  // recorder is unreachable (the recorder itself is best-effort).
  const recorder =
    process.env.NODE_ENV === 'development' ? createHttpDebugRecorder() : noopDebugRecorder;

  return runAgentTurn({
    model: provider(MODEL_ID),
    supabase,
    embedQuery: browserEmbedQuery,
    threadId: input.threadId,
    userId: input.userId,
    userMessage: input.userMessage,
    history: input.history,
    abortSignal: input.abortSignal,
    callbacks: input.callbacks,
    getPendingQueue: input.getPendingQueue,
    clearPendingQueue: input.clearPendingQueue,
    recorder,
    // Bind the set_panel tool to the live zustand store so the agent
    // can drive the right pane in the same way the user UI does.
    // `source: 'agent'` flags this as an AI-driven change so the store
    // captures an undo snapshot and the UI shows the "Filters set by
    // Reknowable" banner with Undo.
    setPanelState: (patch) =>
      useNetworkStore.getState().actions.setPanelState(patch, { source: 'agent' }),
  });
}
