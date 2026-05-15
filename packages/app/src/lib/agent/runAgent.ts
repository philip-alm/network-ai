/**
 * runAgentTurn — drives one agent turn with reliability invariants:
 *
 *   - normalizeHistory before every LLM call (wire-format defense)
 *   - teach-and-retry on recoverable errors (max 2 retries)
 *   - first-chunk (8s) + stall (150s) timeout budgets
 *   - streaming via streamText so the UI updates token-by-token
 *   - INTERLEAVED segments: text and tool-call chunks emitted in their
 *     arrival order. The UI renders the agent's thinking + actions inline.
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
import { appendTextDelta, finishToolSegment, startToolSegment, type Segment } from './segments';

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
  /** Ordered timeline of text + tool segments — the chat renders this. */
  segments: Segment[];
  finishReason: string;
  debugPath?: string;
  retriesUsed: number;
  interrupted: boolean;
};

export type AgentPhase = 'idle' | 'thinking' | 'running_tools' | 'composing' | 'retrying' | 'done';

export type StreamingCallbacks = {
  /** Fires every time the ordered segment list grows — replace your slot with this. */
  onSegmentsUpdate?: (segments: Segment[]) => void;
  /** Coarse phase signal for the "agent is …" pill. */
  onPhaseChange?: (phase: AgentPhase) => void;
  /** Per-tool end hook (still useful for optimistic store merges). */
  onToolEnd?: (call: AgentToolInvocation & { id: string }) => void;
  /** Teach-retry trigger. */
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
  abortSignal?: AbortSignal;
  callbacks?: StreamingCallbacks;
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

  opts.callbacks?.onPhaseChange?.('thinking');

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
      opts.callbacks?.onPhaseChange?.('idle');
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

    // Live ordered list of segments; emitted to the UI on every update.
    let segments: Segment[] = [];
    const emit = (): void => opts.callbacks?.onSegmentsUpdate?.(segments);

    try {
      const stream = streamText({
        model: opts.model,
        system: systemPrompt,
        messages,
        tools,
        stopWhen: stepCountIs(opts.maxSteps ?? 12),
        abortSignal: timer.signal,
        onChunk: ({ chunk }) => {
          timer.tick();
          if (chunk.type === 'text-delta') {
            const delta =
              (chunk as { textDelta?: string; text?: string }).textDelta ??
              (chunk as { text?: string }).text ??
              '';
            if (delta) {
              segments = appendTextDelta(segments, delta);
              emit();
              opts.callbacks?.onPhaseChange?.('composing');
            }
          } else if (chunk.type === 'tool-call') {
            const tc = chunk as { toolCallId: string; toolName: string; input: unknown };
            segments = startToolSegment(segments, {
              id: tc.toolCallId,
              name: tc.toolName,
              args: tc.input,
            });
            emit();
            opts.callbacks?.onPhaseChange?.('running_tools');
          } else if (chunk.type === 'tool-result') {
            const tr = chunk as {
              toolCallId: string;
              toolName: string;
              input: unknown;
              output: unknown;
            };
            const out = tr.output as { ok?: boolean } | undefined;
            const patch: AgentToolInvocation & { id: string } = {
              id: tr.toolCallId,
              name: tr.toolName,
              args: tr.input,
              result: tr.output,
              status: out?.ok === false ? 'error' : 'ok',
            };
            segments = finishToolSegment(segments, patch);
            emit();
            opts.callbacks?.onToolEnd?.(patch);
          }
        },
      });

      const finalText = await Promise.race([
        (async () => {
          for await (const _chunk of stream.fullStream) {
            void _chunk;
          }
          return await stream.text;
        })(),
        timer.tripped,
      ]);

      timer.dispose();

      // Final reconciliation: walk steps for any tool calls/results not seen
      // through onChunk (rare, but a defense-in-depth pass).
      const finalToolCalls: AgentToolInvocation[] = [];
      const steps = await stream.steps;
      for (const step of steps ?? []) {
        for (const tc of step.toolCalls ?? []) {
          const matching = step.toolResults?.find(
            (r: { toolCallId: string }) => r.toolCallId === tc.toolCallId,
          );
          const out = matching?.output as { ok?: boolean } | undefined;
          finalToolCalls.push({
            name: tc.toolName,
            args: tc.input,
            result: matching?.output ?? null,
            status: out?.ok === false ? 'error' : 'ok',
          });
        }
      }

      recorder.recordTimeline('llm/finished', {
        attempt,
        text_length: finalText.length,
        tool_calls: finalToolCalls.length,
      });
      recorder.endTurn('ok');
      opts.callbacks?.onPhaseChange?.('done');

      return {
        text: finalText,
        toolCalls: finalToolCalls,
        segments,
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

      if (opts.abortSignal?.aborted) {
        interrupted = true;
        recorder.endTurn('error', 'interrupted');
        opts.callbacks?.onPhaseChange?.('idle');
        return {
          text: '(interrupted)',
          toolCalls: [],
          segments,
          finishReason: 'stop',
          debugPath: recorder.path,
          retriesUsed,
          interrupted: true,
        };
      }

      if (!isRecoverable(agentErr) || attempt === MAX_TEACH_RETRIES) {
        recorder.endTurn('error', agentErr.kind);
        opts.callbacks?.onPhaseChange?.('idle');
        throw err;
      }

      retriesUsed++;
      opts.callbacks?.onRetry?.(retriesUsed, agentErr.kind);
      opts.callbacks?.onPhaseChange?.('retrying');
      teachingExtras.push({ role: 'user', content: TEACHING_MESSAGE });
      recorder.recordTimeline('teach_retry', { attempt: retriesUsed, kind: agentErr.kind });
    }
  }

  throw new Error('runAgentTurn: unreachable — exited teach-retry loop without return');
}
