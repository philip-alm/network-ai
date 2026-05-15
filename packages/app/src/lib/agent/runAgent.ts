/**
 * runAgentTurn — drives one agent turn against an OpenAI-compatible provider.
 *
 * Provider is injected so the same code runs through:
 *   - Production Edge Function (browser/native): provider points at /functions/v1/agent-chat
 *   - Node scripts / tests: provider points directly at OpenRouter
 *
 * Returns the final assistant text plus a summary of tool calls fired and the
 * debug recorder's artifact directory (if any).
 */

import { generateText, stepCountIs } from 'ai';
import type { LanguageModel, ModelMessage } from 'ai';
import { makeTools, type EmbedQueryFn } from './tools';
import type { SupabaseClient } from '../supabase';
import { systemPrompt } from './systemPrompt';
import { noopDebugRecorder, type DebugRecorder } from './debugRecorder';

export type AgentMessage = { role: 'user' | 'assistant' | 'system'; content: string };

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
};

export type AgentToolInvocation = { name: string; args: unknown; result: unknown };

export type AgentTurnResult = {
  text: string;
  toolCalls: AgentToolInvocation[];
  finishReason: string;
  debugPath?: string;
};

export async function runAgentTurn(opts: RunAgentOptions): Promise<AgentTurnResult> {
  const recorder = opts.recorder ?? noopDebugRecorder;
  recorder.startTurn({
    threadId: opts.threadId,
    userId: opts.userId,
    userMessage: opts.userMessage,
  });

  const tools = makeTools({ supabase: opts.supabase, embedQuery: opts.embedQuery });

  const messages: ModelMessage[] = [
    ...((opts.history ?? []).map((m) => ({ role: m.role, content: m.content })) as ModelMessage[]),
    { role: 'user', content: opts.userMessage } as ModelMessage,
  ];

  recorder.recordLlmRequest({ system: systemPrompt, messages, tools: Object.keys(tools) });

  let result;
  try {
    result = await generateText({
      model: opts.model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(opts.maxSteps ?? 10),
      // Disable parallel tool calls so the model thinks step-by-step and
      // sees each tool's result before issuing the next call.
      providerOptions: { openai: { parallelToolCalls: false } },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    recorder.endTurn('error', detail);
    throw err;
  }

  // Capture tool calls from the streamed steps.
  const toolCalls: AgentToolInvocation[] = [];
  for (const step of result.steps ?? []) {
    for (const tc of step.toolCalls ?? []) {
      const matching = step.toolResults?.find(
        (r: { toolCallId: string }) => r.toolCallId === tc.toolCallId,
      );
      const inv: AgentToolInvocation = {
        name: tc.toolName,
        args: tc.input,
        result: matching?.output ?? null,
      };
      toolCalls.push(inv);
      recorder.recordToolCall(tc.toolCallId, tc.toolName, tc.input);
      if (matching) {
        recorder.recordToolResult(tc.toolCallId, matching.output, 0);
      }
    }
  }

  recorder.endTurn('ok');

  return {
    text: result.text,
    toolCalls,
    finishReason: result.finishReason ?? 'unknown',
    debugPath: recorder.path,
  };
}
