# @reknowable/types

Shared TypeScript types. Source of truth: generated from Supabase via `pnpm -F @reknowable/types generate`. Hand-written types only for non-DB concepts (agent tool I/O, debug artifact schemas).

## Public API

- `Database` (from `./db.ts` — generated)
- `Tables<T>`, `Enums<T>` — convenience aliases
- (Phase 5) Agent tool input/output schemas

## Dependencies

None for the generated types. `zod` for the hand-written agent types when those land.

## What's banned in this package

- Editing `src/db.ts` by hand — it is regenerated from Supabase
- Adding types that belong to a specific module (those live in that module)

## Tests (MANDATORY)

Type-only tests via `expectTypeOf` + smoke tests asserting `Database` is non-empty after generation.

### How Claude verifies this module

1. `pnpm -F @reknowable/types test` — green
2. `pnpm -F @reknowable/types check` — green
3. After `pnpm -F @reknowable/types generate`: `git diff src/db.ts` is reviewed before commit

## Non-goals

- No runtime code — types only
- No platform-specific types

## Recent design decisions

- 2026-05-15: package created. `src/db.ts` will be populated in Phase 1 after migrations exist.
