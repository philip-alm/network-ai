# packages/app/features/home

The two-pane home screen: chat on the left, contacts accordion on the right.
Composes `@network-ai/app/features/chat` + `@network-ai/app/features/contacts`.

The header shows the signed-in user's email + a sign-out button.

## Public API

- `HomeScreen({ userId, userEmail, onSignOut })`

## Tests

End-to-end via Playwright (Phase 6 verify:ui).

## Recent design decisions

- 2026-05-15: one thread per browser tab (UUID). Thread switcher / history
  is a Phase 7+ concern.
