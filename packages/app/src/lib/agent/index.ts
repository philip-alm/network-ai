/**
 * @network-ai/app/lib/agent — agent loop public API.
 */

export { runAgentTurn } from './runAgent';
export type {
  AgentMessage,
  RunAgentOptions,
  AgentToolInvocation,
  AgentTurnResult,
} from './runAgent';

export { makeTools, type EmbedQueryFn, type AgentTools } from './tools';

export { systemPrompt, MODEL_ID, TOOL_NAMES, type ToolName } from './systemPrompt';

export { noopDebugRecorder, type DebugRecorder } from './debugRecorder';
export { createNodeDebugRecorder } from './nodeDebugRecorder';
