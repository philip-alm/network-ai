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
- 2026-05-16: tool card redesign. Split the monolithic 992-LOC
  `ToolCallCard.tsx` into six focused files: the visual shell
  (`toolCardShell.tsx`), the pure copy dictionary (`toolCardCopy.ts`),
  the per-kind closed-state dispatcher (`ToolCallCard.tsx`), the
  expanded audit panel (`ToolCardExpanded.tsx`), the grouped-reads
  variant (`ToolGroup.tsx`), and the protocol-level RULE 1 enforcer
  (`autoPinFromMentions.ts`). Closed cards now narrate pane mutations
  in plain language ("Filtered the pane to X, pinned Y"), not the raw
  search string. Expanded cards expose the agent's actual call args +
  top result rows + an Undo button for pane writes. The shell binary
  is `read = soft accent pill / write = solid Brand Amber pill`, which
  is the user's at-a-glance signal that the agent authored a change.
  Auto-pin: every `[Name](contact:UUID)` mention in the final
  assistant text gets pinned by `useAgentLoop`, guaranteeing the
  invariant the system prompt's RULE 1 has been failing on.
