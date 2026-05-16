# packages/app/features/chat

Chat UI: thread + composer + bubbles + useAgentLoop hook.

## Public API

- `ChatThread` — message list with auto-scroll + composer
- `ChatComposer` — input with submit
- `MessageBubble` — user vs assistant rendering + collapsible tool-call summary
- `useAgentLoop({ userId, threadId })` — hook that drives runBrowserAgentTurn

## Dependencies

- `@reknowable/app/lib/agent` — runBrowserAgentTurn
- React only (no NativeWind/RN primitives yet — that's Phase 7)

## Tests

Component tests for MessageBubble + ChatComposer + ChatThread render +
basic interaction. Full E2E through Playwright (Phase 6 verify:ui) drives
the real chat path against a real Supabase + deployed agent-chat function.

## Recent design decisions

- 2026-05-15: minimal HTML/CSS for Phase 6. Phase 7 replaces with
  NativeWind + native-portable components.
