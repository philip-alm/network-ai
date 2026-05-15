# packages/app/features/contacts

Contacts accordion + the useContacts realtime hook.

## Public API

- `useContacts()` — fetches user's contacts + assets, keeps them current via
  Supabase Realtime postgres_changes subscription. Returns `{ contacts, assets, refetch }`.
- `ContactsAccordion`, `ContactRow`, `WarmthDot`.

## Realtime

Each `useContacts()` mount subscribes to `public:contacts` + `public:assets`
postgres_changes (any event). When the agent writes via mutate_sql, the
accordion updates within ~100ms without polling.

## Recent design decisions

- 2026-05-15: simple refetch-on-change strategy. Diff-based updates can wait
  until a row count of 100+ where it matters.
