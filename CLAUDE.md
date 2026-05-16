# Reknowable — Claude Code Ruleset

This file governs all work in this repository. **Every Claude Code session reads this file first.**

Every module (every directory marked with its own `CLAUDE.md`) extends this file with domain-specific rules. When working inside a module, Claude reads both: this file + the module's `CLAUDE.md`.

Reknowable is a second brain for everyone in a user's network and everything they can offer: contacts with warmth ratings + asset ledger, queryable by an AI agent for active recall on demand. Multi-user trajectory (organizational memory), web-first with native scaffolded for later store publishing.

---

## §1. Prime Directives

### Directive 1 — Verifiability without booting the UI

The codebase is provable-correct without launching the app. Every feature, every pipeline, every UI behavior has a test that fails before the change and passes after. Claude must be able to run the test suite and know — with near certainty — whether a change works. The user should never have to launch the app to find out if something is broken.

If a change cannot be tested, the change is not allowed until the testability gap is closed first. This applies especially to "small" changes — they are where undetected regressions hide.

### Directive 2 — The user's time is sacred

Claude does the work; the user does almost nothing. Every time Claude is about to ask the user to verify, set something up, or run a manual step, Claude first asks: _"can I make this one step easier?"_ The answer is almost always yes — write a script, write a test, pre-compute the value, give the exact command.

Never _"try X and let me know if it works."_ Always _"run `pnpm verify:foo` and it'll tell you green/red in 5 seconds."_

### Directive 3 — Claude autonomously debugs

Claude has tools to inspect every layer of the system without user help:

- Run the test suite (`pnpm test`, `pnpm e2e:web`).
- Inspect database state (`pnpm tsx scripts/db-dump.ts`, `pnpm tsx scripts/db-rls-check.ts`).
- Read Edge Function logs (`supabase functions logs <name> --tail`).
- Read agent debug artifacts (`~/Documents/reknowable-debug/<timestamp>-<slug>/`).
- Replay LLM turns against captured artifacts (`pnpm tsx scripts/agent-replay.ts <slug>`).

When a feature breaks, Claude reads these artifacts FIRST before speculating. Reading is necessary but never sufficient — every fix ends with the test suite green.

### Directive 4 — 100% success on first attempt

When Claude tells the user _"this is done, run `pnpm verify:foo`"_, that verify command MUST be green. Claude has already run it. Claude has already run the full workspace suite. Claude has already exercised the user-facing flow via headless E2E. The user runs one command, sees green, moves on.

If `verify:foo` fails on the user's machine, that's a reliability bug — root-cause it and fix it for everyone.

---

## §2. Architecture

### The core/edge split

- **Shared screens & business logic** live in `packages/app/`. Render identically on web (Next.js) and native (Expo) via NativeWind + Solito.
- **Platform shells** are `apps/web/` (Next.js 15 App Router) and `apps/native/` (Expo SDK 54). They are _thin_ — just routing, auth callbacks, deep linking. No business logic.
- **Data layer** is `packages/app/lib/supabase/` (client factory) + Supabase RPCs + Edge Functions. Everything else talks through this.
- **Agent layer** is `packages/app/lib/agent/`. Tools, system prompt, the loop, the debug recorder.
- **Backend** is Supabase (Postgres + RLS + pgvector + pgmq + pg_cron + Edge Functions). No other backend.

### Banned architectural patterns

- Global mutable state. Pass deps explicitly.
- Direct HTTP calls outside `lib/`. Always go through the supabase client wrapper.
- Reading environment variables outside `packages/app/lib/env/`. Read once, pass values.
- Circular imports between modules. Break the cycle.
- Cross-module imports of internal files. Only the module's `index.ts` public API.

---

## §3. Module Rules

### Every `[M]` directory is self-contained

A new owner could understand and maintain it from its `CLAUDE.md` alone, without reading sibling modules. Every module has:

- `CLAUDE.md` (this file's per-module extension — see §11 template)
- `package.json`
- `src/index.ts` (the _only_ import surface)
- `*.test.ts(x)` files for every public function/component
- No imports of other modules' internal files (only their `index.ts`)

### File rules

- **Hard cap: 500 LOC per file.** CI rejects anything over.
- **Soft target: 200 LOC.** If over, you've probably grown a second concept — split.
- **One public concept per file.** Two exports that could be used separately → split.
- **Vague names banned**: `utils.ts`, `helpers.ts`, `manager.ts`, `common.ts`, `misc.ts`, bare `state.ts`, root `types.ts`. Filename must describe exactly what's in the file.

### Naming

- Directories carry the category; filenames carry the specific role. A file under `packages/app/lib/agent/` doesn't need `agent` in its name.

---

## §4. Code Rules

### Banned in non-test code

- `unwrap()`, `expect()`, `panic!()`
- `any` in TypeScript. `unknown` allowed at boundaries, must be narrowed before use.
- `as any` cast escape hatch
- `console.log` — use the debug recorder
- Silent `catch {}` blocks (must log + rethrow or handle explicitly)
- `.skip()` / `it.skip()` / `it.todo()` added to make CI green
- `--no-verify` on commits
- Global mutable state

### Types

- Make invalid states unrepresentable. Tagged unions > bool flags + `Option<_>`.
- Newtype wrappers over raw strings/UUIDs at module boundaries (`type ContactId = string & { __brand: 'ContactId' }`).
- Never `any`. `unknown` + narrow at the boundary.

### Errors

- Tagged-union error types. Stringly-typed errors banned.
- Every error variant documented: when it happens, what it means, how to recover.
- No `Promise.catch` swallowing — explicit `.catch(err => { ... rethrow })`.

### Comments

- Only when the _why_ is non-obvious. Never restate the _what_.
- Module-level doc comment in `index.ts`.
- Every public function: purpose, inputs, outputs, errors, invariants.

---

## §5. Testing Discipline

### What must be tested

- Every public function in a module: happy-path + one failure per documented error
- Every Supabase RPC: contract test (input → expected output, plus error cases)
- Every Edge Function: integration test (with `msw`-mocked upstream)
- Every SQL migration: applied + RLS-still-works after migration
- Every UI component: render test + interaction test
- Every screen: accessibility check (Playwright + axe)
- Every bug fix: regression test that fails on pre-fix code

### Test style

- **TDD default.** Write the failing test first. Watch it fail for the _expected_ reason. Then implement.
- Tests are deterministic. 100 runs same result.
- Property-based tests (`fast-check`) for non-trivial input spaces.
- Snapshot tests for prompt builders + LLM system messages. Snapshot changes require explicit accept + review.
- No test sleeps. No test network outside `msw`. No test filesystem outside a per-test tmpdir.
- Real Supabase via `supabase start` for integration tests (Docker); CI uses the same.

### Layout

- Vitest unit tests colocate: `foo.ts` → `foo.test.ts` next to it
- Integration tests: `<module>/tests/integration_*.test.ts`
- Contract tests: `<module>/tests/contract_*.test.ts`
- Playwright E2E: `apps/web/tests/`
- Detox native smoke: `apps/native/tests/`
- DB-level tests: `supabase/tests/`

### Diff-requires-test rule

Every PR that changes behavior includes a test diff. CI rejects commits that change `*/src/` files without a corresponding test file change. Exception: pure refactors marked `[refactor]` in the commit subject.

---

## §6. Claude's Workflow (Mandatory Checklist)

Before every change, Claude runs this checklist. **No shortcuts.**

### Before editing

1. Read the target module's `CLAUDE.md`.
2. Read the target file end-to-end.
3. Read every call site (`grep` the repo).
4. Read the tests for the target. If none exist, **stop** — write tests for current behavior first, then edit.
5. Identify which public API the change sits behind. If the contract needs to change, update the contract test _first_.

### Writing the change

6. Write a failing test that captures the desired behavior.
7. Run the suite. Confirm it fails _for the expected reason_.
8. Implement the minimal change to make the test pass.
9. Run the module's full suite. All green.

### Before reporting done

10. `pnpm check` — green
11. `pnpm test` — green
12. The relevant `pnpm verify:<phase>` — green (run it; don't assume)
13. Re-read the diff. Delete any line not required.
14. No dead code, unused imports, stray `console.log`.
15. No banned patterns (`any`, `unwrap`, global state).
16. If a snapshot changed, the diff was reviewed.
17. **Prepare the user's verification step**: the one command the user runs. If verification isn't a single command, build the script first.
18. Only now, tell the user.

### If CI fails

- CI failure means the change does not work. Period. Never argue, never override, never `--no-verify`. Fix the root cause.
- If the failing test is wrong, fix the test _in a separate commit first_, then re-try the change.

---

## §7. Verification Commands

```
pnpm check          # eslint + tsc across workspace
pnpm test           # all Vitest unit/integration suites
pnpm e2e:web        # Playwright against apps/web
pnpm db:test        # Supabase test runner against local supabase
pnpm verify:all     # runs everything above + every verify:* script
```

### `verify:*` scripts (one-step verification)

| Script                    | What it does                                                               |
| ------------------------- | -------------------------------------------------------------------------- |
| `verify:scaffold`         | Boots web (:3000) + Metro headlessly; asserts hello-world renders.         |
| `verify:db`               | Runs full `supabase/tests/` + `db-rls-check.ts` against remote.            |
| `verify:auth`             | Programmatic sign-up/sign-in + Playwright E2E.                             |
| `verify:embeddings`       | Inserts a test contact, polls for embedding, asserts dim + model.          |
| `verify:agent-chat`       | curls deployed function, parses SSE, asserts streaming.                    |
| `verify:agent-loop`       | Headless `runAgentTurn` E2E; asserts tool calls + DB writes.               |
| `verify:ui`               | Playwright on apps/web — golden + edge paths.                              |
| `verify:native-smoke`     | Detox iOS simulator smoke.                                                 |
| `verify:account-deletion` | Create user → delete → assert zero rows.                                   |
| `verify:all`              | Every script above in dependency order. **Final check before any "done".** |

---

## §7.5. Local-First Workflow (NON-NEGOTIABLE)

**Every change lives on the local stack until the user explicitly says ship it.**

This means:

- **Migrations** apply to LOCAL Supabase only. New `.sql` in `supabase/migrations/` → `pnpm db:up` (= `supabase migration up --local`). **Never** `supabase db push --linked` without an explicit user trigger.
- **Code** stays on the local branch. `git commit` is fine for snapshotting work. **Never** `git push origin main` without an explicit user trigger — `main` is wired to Vercel auto-deploy, so a push IS a prod deploy.
- **Edge Functions** run via `supabase functions serve` (already up via `supabase start`). **Never** `supabase functions deploy` without a trigger.
- **Verification** defaults to local: `verify:db`, `verify:agent-loop`, etc. hit the local stack. `verify:deployed` is the opt-in remote variant.

### Ship triggers

Treat these as "go live now": `ship`, `ship it`, `push to main`, `push to prod`, `deploy`, `production`, `upload to vercel`. Anything else → stay local. When in doubt, ask.

### Ship commands (only when triggered)

```
pnpm ship:db        # supabase db push --linked      → live Postgres
pnpm ship:code      # git push origin main           → Vercel auto-deploy
```

After shipping migrations to remote: PostgREST schema cache may lag. Migration `0011_notify_pgrst.sql` fires `NOTIFY pgrst, 'reload schema'` as a pattern; future migrations that add RPCs should chain a similar notify or be batched with one.

### Why this rule exists

A migration applied to remote-only (or local-only) silently breaks the OTHER side. On 2026-05-16 a `find_anything()` RPC worked on the deployed site but `PGRST202`'d every local turn for an entire dev session — because `supabase migration list` defaulted to remote, hiding the local-vs-remote drift. Local-first eliminates the split: there's exactly one stack to keep in sync at any moment.

---

## §8. Debug Artifacts

Every agent turn writes a folder Claude can read to diagnose without running the UI.

### Per-turn capture

```
~/Documents/reknowable-debug/<timestamp>-<slug>/
├── metadata.json              # user_id, thread_id, transcript, outcome
├── timeline.jsonl             # every event with wall-clock timestamp
├── llm/turn-NN/
│   ├── request.json           # BYTE-EXACT OpenRouter request body
│   └── response.sse           # BYTE-EXACT raw SSE
├── tool_calls/<id>.json       # tool name, args, result, duration
└── db_state/                  # snapshots before/after critical writes
    ├── before.sql
    └── after.sql
```

**Byte-exactness is non-negotiable.** If `request.json` and the actual HTTP request diverge, that's a bug.

Debug capture is best-effort — writes never fail the live turn.

### Helper scripts

- `scripts/verify-all.ts` — every `verify:*` in sequence
- `scripts/db-dump.ts <table>` — table contents for a user_id
- `scripts/db-rls-check.ts` — asserts RLS is on every table, asserts cross-user denial
- `scripts/agent-replay.ts <slug>` — replays a recorded turn; diffs against the record
- `scripts/tail-edge-logs.ts <function>` — Edge Function logs
- `scripts/embed-trigger.ts <id>` — manual embed for a row

When the user reports a bug:

1. Read the latest trace in `~/Documents/reknowable-debug/`
2. Check `timeline.jsonl` for tool calls
3. Check `llm/turn-NN/request.json` for what the LLM actually saw
4. Check `db_state/before.sql` for state at turn start

Never speculate from symptoms when the byte-exact record is on disk.

---

## §9. Auto-Reject Behaviors

These trigger immediate rejection, regardless of change size:

- Claiming "done" without running `pnpm verify:<phase>`
- Claiming "done" with red tests
- `unwrap`, `expect`, `panic` in non-test code
- `any` / `as any` in TypeScript
- `.skip()` / `it.skip()` added to make CI green
- `--no-verify` on commits
- Copy-pasting code between modules. Extract or share via `packages/`.
- Adding a dependency without updating the relevant module's `CLAUDE.md`
- Using `npm` or `yarn` (pnpm only)
- Global mutable state
- Direct HTTP calls outside `lib/`
- Silently swallowing errors
- Modifying a snapshot without reviewing the diff
- "I verified by looking at the code" without running tests
- Asking the user to verify without a one-step command
- Ending a message with "should work" / "probably works"
- Dumping raw logs/stack traces on the user without a summary

---

## §10. Operator Experience

### The one-step rule

If Claude asks the user to verify anything, verification is ONE step. One command. Never a sequence.

### Every message to the user follows this shape

1. **What changed** (1–2 sentences, concrete)
2. **How to verify in one step** (exact command + expected output)
3. **What's next** (1 sentence, if relevant)

No preamble. No "I think." No walls of logs.

### Setup UX

- No "first install X" — Claude adds X as a dep and installs.
- No "you'll need FOO_API_KEY" without also updating `.env.example`.
- No "restart the dev server" unless Claude has confirmed it's required.
- No "run these 4 commands" — Claude puts them in a script.

---

## §11. Per-Module CLAUDE.md Template

Every `[M]` directory has a `CLAUDE.md` of this shape:

```markdown
# <module name>

**What this module does** (one paragraph)

## Public API

The module's only export surface (re-exported from `src/index.ts`). Anything not listed here is private.

- `<symbol>` — purpose, inputs, outputs

## Dependencies

What this module depends on, and why each one is justified:

- `<package>` — reason
- `@reknowable/<workspace-package>` — reason

## What's banned in this module

Module-specific bans. Examples:

- "No direct HTTP calls — always go through the supabase client wrapper"
- "No `console.log` — use the debug recorder"

## Tests (MANDATORY)

Every change to this module's `src/` requires a corresponding change to this module's tests.

- Unit tests: every public function — happy path + one failure per documented error
- Contract tests: every external boundary
- Component tests: every UI component

### How Claude verifies this module

1. `pnpm -F <module> test` — green
2. `pnpm -F <module> check` — green
3. Relevant `verify:*` script — green

## Non-goals

What this module explicitly will not do. Catches scope creep early.

## Recent design decisions

Append-only log of "why this is shaped this way", dated entries.
```

---

## §12. When In Doubt

- When in doubt, write another test.
- When in doubt, extract another function.
- When in doubt, make the state machine explicit.
- When in doubt, build the user a verification script.
- When in doubt about whether to do the thorough thing or the fast thing: do the thorough thing.
- When in doubt about whether the user will know what to do: assume they won't, and make the next step obvious.

---

## §13. Design Context

Two files at the repo root govern visual + strategic design. Read them before any UI work; they are the source of truth for what gets shipped.

- **[PRODUCT.md](./PRODUCT.md)** — strategic: register, users, product purpose, brand personality, anti-references, design principles, accessibility.
- **[DESIGN.md](./DESIGN.md)** — visual: full token system (Operator's Study, deep navy + warm cream + Brand Amber from the logo), typography (Geist Sans + Mono + Wordmark), elevation (flat + hairline), components, motion vocabulary, icon registry, signature moments, do's and don'ts. Stitch-compatible YAML frontmatter + six-section spec.
- **[BRAND.md](./BRAND.md)** — voice: how the agent talks, how confirmations are phrased, error message patterns, copy do's-and-don'ts. Read before writing any UI string or agent prompt.
- **[.impeccable/design.json](./.impeccable/design.json)** — machine-readable sidecar: tonal ramps, shadows, motion tokens, icon registry, component HTML/CSS snippets, narrative rules.

**Register:** product (app UI; design serves the product).

**The five design principles** (full prose in PRODUCT.md):

1. Type carries the design — reach for a different weight before reaching for decoration.
2. One pane never pushes the other — 50/50 split, panes own their own scroll, page is fixed-height.
3. Optimistic by default — the right pane reflects agent actions before the server confirms.
4. Every AI action is reviewable and revertable — structured tool-call cards with Jump-to + Undo.
5. Motion explains — never decorative; transform + opacity only, ≤ 250ms, ease-out.

**The Operator's Study Palette** (one-liner): deep navy surfaces (`#0D1729`), warm cream ink (`#F4F5F1`), Brand Amber accent (`#CD9B5B`), warm graphite for soft surfaces (`#242324`), warm grey for muted text (`#A5A29D`). All five from the Reknowable logo. Committed across the app. Brand mark is `<Wordmark/>` ([●] reknowable, lowercase, Geist Sans 500). One chromatic accent only (amber, hue ~75); warmth ramp anchors at amber and fades to navy. No drop shadows at rest. No em dashes in UI copy. lucide-react icons only, no custom SVGs.
