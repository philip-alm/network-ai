# packages/app/features/contacts

Contacts accordion + the useContacts realtime hook.

## Public API

- `useContacts()` — fetches user's contacts + assets, keeps them current via
  Supabase Realtime postgres_changes subscription. Returns `{ contacts, assets, refetch }`.
- `ContactsAccordion`, `ContactRow`, `WarmthDot`.

## Realtime

Each `useContacts()` mount subscribes to `public:contacts` + `public:assets`
postgres_changes. **The subscription is currently a no-op** — the
tables aren't in the `supabase_realtime` publication (see
`docs/LEARNINGS.md` L13). Until the publication migration ships,
cross-tab / cross-device sync requires a refresh.

In-session writes are covered by the optimistic-update path:
`useAgentLoop.applyOptimistic` calls `extractMutationRows` from
`lib/agent/toolResultParser.ts` and dispatches every contact/asset row
into the store. So a `mutate_sql` bulk insert of 20 contacts appears
in the accordion instantly — without Realtime.

## Recent design decisions

- 2026-05-15: simple refetch-on-change strategy. Diff-based updates can wait
  until a row count of 100+ where it matters.
- 2026-05-16: optimistic-update path rewritten to use
  `extractMutationRows` (every row, not just the first). The previous
  path went through `parseToolResult` which silently dropped N-1 rows
  of every bulk insert. Realtime echo still pending — once published,
  optimistic + realtime become belt-and-suspenders as intended.
