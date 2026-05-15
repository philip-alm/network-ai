# packages/app/lib/store

Zustand store for cross-pane state in the home screen. Holds the user's
contacts + assets (the canonical list shown on the right pane) and the
ephemeral UI state that couples the chat to the accordion (the highlighted
contact, the optimistic insertions / updates / deletes coming from agent
tool calls).

## Public API

- `useNetworkStore` — Zustand hook. Read-only selectors recommended.
- `Contact`, `Asset` — row shapes (mirror DB).
- `actions` — non-component code can mutate via `useNetworkStore.getState().actions.*`.

## What's banned

- Calling `getBrowserSupabase()` here — the hook stays pure.
- Storing the LLM provider, the JWT, or any auth-derived state.
- Subscribing to Supabase directly — that lives in `features/contacts/useContacts`.

## Why a store (not pure hook state)

The chat (left pane) needs to:

1. Optimistically push a new contact into the accordion when the agent's
   mutate_sql RETURNS a row, BEFORE Supabase Realtime fires.
2. Trigger "scroll + highlight this row" on the accordion when the user
   clicks "Jump to Anna" in a tool-result card.

Both are cross-pane → a single source of truth is the only honest fix.
