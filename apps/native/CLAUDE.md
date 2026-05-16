# @reknowable/native

Expo SDK 54 native app shell using Expo Router. Targets iOS + Android. Thin: routing, deep linking, native auth callbacks. All screens come from `@reknowable/app`.

Requires a dev build (Expo Go won't work because of `@react-native-google-signin/google-signin`).

## Public API

Routes match the web app structure (parity is enforced):

- `/sign-in`, `/sign-up` (Phase 2)
- `/` (auth-gated home, Phase 2+)

## Dependencies

- `expo` SDK 54
- `expo-router` ^4 — file-based routing
- `expo-secure-store` — session storage
- `expo-apple-authentication` (Phase 2)
- `@react-native-google-signin/google-signin` (Phase 2)
- `@reknowable/app` — every screen

## What's banned in this app

- Business logic in `app/` — components live in `@reknowable/app`
- Importing from `apps/web/`
- `@expo/vector-icons` style ad-hoc dependencies — discuss before adding

## Tests (MANDATORY)

- Detox smoke tests in `tests/` (Phase 7 onwards)
- For pure-logic native modules, Vitest unit tests colocate

### How Claude verifies this app

1. `pnpm -F @reknowable/native typecheck` — green
2. `pnpm verify:scaffold` (Phase 0) — typecheck succeeds against shared package
3. `pnpm verify:native-smoke` (Phase 7) — Detox iOS simulator boot

## Non-goals

- No business logic
- No publishing automation here — that's an operational step

## Recent design decisions

- 2026-05-15: scaffold created. Boots via `expo start` against a dev build; `app/index.tsx` imports from `@reknowable/app` to prove monorepo wiring.
