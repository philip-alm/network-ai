/**
 * runAgentTurn — drives one agent turn with reliability invariants:
 *
 *   - normalizeHistory before every LLM call (wire-format defense)
 *   - teach-and-retry on recoverable errors (max 2 retries)
 *   - first-chunk (8s) + stall (150s) timeout budgets
 *   - streaming via streamText so the UI updates token-by-token
 *
 * Provider is injected so the same code runs through:
 *   - Production Edge Function (browser/native): provider points at /functions/v1/agent-chat
 *   - Node scripts / tests: provider points directly at OpenRouter
 */

import { streamText, stepCountIs } from 'ai';
import type { LanguageModel, ModelMessage } from 'ai';
import { makeTools, type EmbedQueryFn } from './tools';
import type { SupabaseClient } from '../supabase';
import { systemPrompt } from './systemPrompt';
import { noopDebugRecorder, type DebugRecorder } from './debugRecorder';
import { normalizeHistory, type NormalizableMessage } from './normalizeHistory';
import {
  classifyError,
  isRecoverable,
  errorDetail,
  MAX_TEACH_RETRIES,
  TEACHING_MESSAGE,
} from './errors';
import { makeTimeoutController } from './timeouts';

export type AgentMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type AgentToolInvocation = {
  name: string;
  args: unknown;
  result: unknown;
  status: 'ok' | 'error';
  durationMs?: number;
};

export type AgentTurnResult = {
  text: string;
  toolCalls: AgentToolInvocation[];
  finishReason: string;
  debugPath?: string;
  /** How many teach-retry attempts were used (0 = first try succeeded). */
  retriesUsed: number;
  /** True if the user aborted mid-flight via the external AbortSignal. */
  interrupted: boolean;
};

export type StreamingCallbacks = {
  /** Fires for every text delta as the LLM streams. */
  onTextDelta?: (delta: string) => void;
  /** Fires when a tool call begins (status='running'). */
  onToolStart?: (call: { id: string; name: string; args: unknown }) => void;
  /** Fires when a tool call ends — status reflects the envelope's ok flag. */
  onToolEnd?: (call: AgentToolInvocation & { id: string }) => void;
  /** Fires when a teach-retry begins. */
  onRetry?: (attempt: number, errorKind: string) => void;
};

export type RunAgentOptions = {
  model: LanguageModel;
  supabase: SupabaseClient;
  embedQuery: EmbedQueryFn;
  threadId: string;
  userId: string;
  userMessage: string;
  history?: AgentMessage[];
  recorder?: DebugRecorder;
  maxSteps?: number;
  /** External AbortSignal — wires the user's stop button into the run. */
  abortSignal?: AbortSignal;
  /** Streaming callbacks for live UI updates. */
  callbacks?: StreamingCallbacks;
  /** Timeout overrides (mostly for tests). */
  firstChunkMs?: number;
  stallMs?: number;
};

const DEFAULT_FIRST_CHUNK_MS = 8_000;
const DEFAULT_STALL_MS = 150_000;

function buildMessages(opts: RunAgentOptions, extras: AgentMessage[]): ModelMessage[] {
  const all = [
    ...((opts.history ?? []) as AgentMessage[]),
    ...extras,
    { role: 'user', content: opts.userMessage } as AgentMessage,
  ];
  return all.map((m) => ({ role: m.role, content: m.content })) as ModelMessage[];
}

export async function runAgentTurn(opts: RunAgentOptions): Promise<AgentTurnResult> {
  const recorder = opts.recorder ?? noopDebugRecorder;
  recorder.startTurn({
    threadId: opts.threadId,
    userId: opts.userId,
    userMessage: opts.userMessage,
  });

  const tools = makeTools({
    supabase: opts.supabase,
    embedQuery: opts.embedQuery,
    recorder,
  });

  const teachingExtras: AgentMessage[] = [];
  let retriesUsed = 0;
  let interrupted = false;

  for (let attempt = 0; attempt <= MAX_TEACH_RETRIES; attempt++) {
    const raw = buildMessages(opts, teachingExtras);
    let messages: ModelMessage[];
    try {
      messages = normalizeHistory(raw as unknown as NormalizableMessage[]) as ModelMessage[];
    } catch (err) {
      const agentErr = classifyError(err);
      recorder.recordTimeline('history/malformed', {
        kind: agentErr.kind,
        detail: errorDetail(agentErr),
      });
      recorder.endTurn('error', agentErr.kind);
      throw err;
    }

    recorder.recordLlmRequest({ system: systemPrompt, messages, tools: Object.keys(tools) });
    recorder.recordTimeline('llm/request', {
      attempt,
      message_count: messages.length,
      tools: Object.keys(tools),
    });

    const timer = makeTimeoutController({
      firstChunkMs: opts.firstChunkMs ?? DEFAULT_FIRST_CHUNK_MS,
      stallMs: opts.stallMs ?? DEFAULT_STALL_MS,
      externalSignal: opts.abortSignal,
    });

    try {
      const stream = streamText({
        model: opts.model,
        system: systemPrompt,
        messages,
        tools,
        stopWhen: stepCountIs(opts.maxSteps ?? 10),
        abortSignal: timer.signal,
        providerOptions: { openai: { parallelToolCalls: false } },
        onChunk: ({ chunk }) => {
          timer.tick();
          if (chunk.type === 'text-delta' && opts.callbacks?.onTextDelta) {
            const delta =
              (chunk as { textDelta?: string; text?: string }).textDelta ??
              (chunk as { text?: string }).text ??
              '';
            if (delta) opts.callbacks.onTextDelta(delta);
          }
        },
      });

      // Race the consume against the timeout's tripped promise.
      const finalText = await Promise.race([
        (async () => {
          // Consume the full stream; AI SDK 5 surfaces stepCalls on the
          // resolved result. We touch fullStream to keep streaming alive.
          for await (const _chunk of stream.fullStream) {
            // onChunk callback already fired tick() above.
            void _chunk;
          }
          return await stream.text;
        })(),
        timer.tripped,
      ]);

      timer.dispose();

      const toolCalls: AgentToolInvocation[] = [];
      const steps = await stream.steps;
      for (const step of steps ?? []) {
        for (const tc of step.toolCalls ?? []) {
          opts.callbacks?.onToolStart?.({
            id: tc.toolCallId,
            name: tc.toolName,
            args: tc.input,
          });
          const matching = step.toolResults?.find(
            (r: { toolCallId: string }) => r.toolCallId === tc.toolCallId,
          );
          const out = matching?.output as { ok?: boolean } | undefined;
          const inv: AgentToolInvocation = {
            name: tc.toolName,
            args: tc.input,
            result: matching?.output ?? null,
            status: out?.ok === false ? 'error' : 'ok',
          };
          toolCalls.push(inv);
          opts.callbacks?.onToolEnd?.({ ...inv, id: tc.toolCallId });
        }
      }

      recorder.recordTimeline('llm/finished', {
        attempt,
        text_length: finalText.length,
        tool_calls: toolCalls.length,
      });
      recorder.endTurn('ok');

      return {
        text: finalText,
        toolCalls,
        finishReason: (await stream.finishReason) ?? 'unknown',
        debugPath: recorder.path,
        retriesUsed,
        interrupted,
      };
    } catch (err) {
      timer.dispose();
      const agentErr = classifyError(err);
      recorder.recordTimeline('llm/error', {
        attempt,
        kind: agentErr.kind,
        detail: errorDetail(agentErr),
      });

      // User-initiated abort: fail fast without retry.
      if (opts.abortSignal?.aborted) {
        interrupted = true;
        recorder.endTurn('error', 'interrupted');
        return {
          text: '(interrupted)',
          toolCalls: [],
          finishReason: 'stop',
          debugPath: recorder.path,
          retriesUsed,
          interrupted: true,
        };
      }

      if (!isRecoverable(agentErr) || attempt === MAX_TEACH_RETRIES) {
        recorder.endTurn('error', agentErr.kind);
        throw err;
      }

      retriesUsed++;
      opts.callbacks?.onRetry?.(retriesUsed, agentErr.kind);
      teachingExtras.push({ role: 'user', content: TEACHING_MESSAGE });
      recorder.recordTimeline('teach_retry', { attempt: retriesUsed, kind: agentErr.kind });
    }
  }

  throw new Error('runAgentTurn: unreachable — exited teach-retry loop without return');
}
