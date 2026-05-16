/**
 * Debug recorder — captures byte-exact LLM I/O + tool calls + DB state per turn.
 *
 * Per Incredible-style debug artifact contract (root CLAUDE.md §8):
 *   ~/Documents/reknowable-debug/<timestamp>-<slug>/
 *     metadata.json
 *     timeline.jsonl
 *     llm/turn-NN/request.json + response.sse
 *     tool_calls/<id>.json
 *
 * NoopDebugRecorder is the default — verify scripts and tests wire a real
 * recorder when they want artifacts. Phase 6 will add a browser-friendly
 * recorder that persists to IndexedDB.
 */

export type DebugRecorder = {
  /** Begins a new turn (bumps the internal turn counter). Returns the turn number. */
  startTurn(metadata: { threadId: string; userId: string; userMessage: string }): number;
  endTurn(outcome: 'ok' | 'error', detail?: string): void;
  /** Records the LLM request body for the CURRENT turn. */
  recordLlmRequest(body: unknown): void;
  /** Appends to the CURRENT turn's response.sse file. */
  recordLlmResponseChunk(chunk: string): void;
  recordToolCall(id: string, name: string, args: unknown): void;
  recordToolResult(id: string, result: unknown, durationMs: number): void;
  recordTimeline(event: string, payload?: unknown): void;
  /** Where the artifact directory lives (Node only). */
  readonly path?: string;
};

export const noopDebugRecorder: DebugRecorder = {
  startTurn: () => 0,
  endTurn() {},
  recordLlmRequest() {},
  recordLlmResponseChunk() {},
  recordToolCall() {},
  recordToolResult() {},
  recordTimeline() {},
};
