# @reknowable/ui

Leaf UI components: `Button`, `Input`, `Accordion`, `Card`, `Dot`, `WarmthIndicator`. Renders identically on web and native via NativeWind. No state, no business logic, no data fetching — just presentation.

If a component needs state or a data hook, it belongs in `@reknowable/app/features/`, not here.

## Public API

Exported from `src/index.ts`. Components will be added in Phase 6.

(Phase 0: empty — just a placeholder)

## Dependencies

- `react`, `react-native` — primitives
- (later) NativeWind classes via Tailwind config inherited from each shell

## What's banned in this package

- State that outlives a render (use `@reknowable/app`)
- Data fetching (use `@reknowable/app/lib/supabase`)
- Platform-specific imports (use NativeWind classes only)
- `useState` for anything outside ephemeral UI state (focus, hover) — controlled components only

## Tests (MANDATORY)

Every component has a render test + an interaction test (where applicable). Snapshot tests for visual regressions on key components.

### How Claude verifies this module

1. `pnpm -F @reknowable/ui test` — green
2. `pnpm -F @reknowable/ui check` — green

## Non-goals

- No business logic — this is presentational only
- No animation library — that's a Phase 7 concern

## Recent design decisions

- 2026-05-15: package created.
