/**
 * @reknowable/app/lib/agent — agent loop public API.
 */

export { runAgentTurn } from './runAgent';
export type {
  AgentMessage,
  RunAgentOptions,
  AgentToolInvocation,
  AgentTurnResult,
  StreamingCallbacks,
  AgentPhase,
} from './runAgent';

export type { Segment } from './segments';

export {
  parseToolResult,
  extractMutationRows,
  type ToolCardKind,
  type MutationRows,
} from './toolResultParser';

export { makeTools, type EmbedQueryFn, type AgentTools } from './tools';

export { systemPrompt, MODEL_ID, TOOL_NAMES, type ToolName } from './systemPrompt';

export { noopDebugRecorder, type DebugRecorder } from './debugRecorder';
export { createHttpDebugRecorder, type HttpDebugRecorderOptions } from './httpDebugRecorder';
// NOTE: createNodeDebugRecorder lives at '@reknowable/app/lib/agent/nodeDebugRecorder'
// so the browser bundle doesn't try to resolve `node:fs` / `node:path` / `node:os`.

export { browserEmbedQuery } from './browserEmbedQuery';
export { runBrowserAgentTurn, type BrowserAgentInput } from './browserAgent';

export { classifyError, type AgentError } from './errors';
