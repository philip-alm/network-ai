# Reknowable — Learnings

Non-obvious patterns discovered while building. Each entry follows a
fixed shape:

**What it is** · **Why it matters** · **How to apply** · **Sources**

This file is append-only. When a learning is overturned by a later one,
add the new entry referencing the old, don't delete the old.

---

## L1 — Examples in prompts must not look like real output

**What it is.** The agent was emitting literal quotation marks around
every narration line ("Finding Viktor.", "Adding podcast..."). Root
cause: the system prompt's example transcript used `YOU: "Finding
Viktor."` — the model read the quotes as part of the output, not as
English delimiters around the example.

**Why it matters.** Any character that wraps an example in the system
prompt is liable to bleed into the model's actual output. Markdown
code fences, asterisks, quotes, brackets — all risky.

**How to apply.**

- Show examples in a _clearly distinct_ visual frame (rule lines,
  section headers, ASCII boxes) and leave the assistant's lines
  unquoted, exactly as you want them produced.
- After changing prompt formatting, run a real turn and inspect the
  byte-exact `llm/turn-NN/response.sse` in `~/Documents/reknowable-debug/`.
- Add an explicit anti-rule (e.g. "DO NOT WRAP NARRATION IN QUOTES")
  near the example — defense in depth.

**Sources.** `lib/agent/systemPrompt.ts` (the fix). Reported by the
user from a screenshot 2026-05-16.

---

## L2 — Every tool needs a parser case AND a card

**What it is.** `set_panel` calls were rendering as a generic
"name + timing" pill because `parseToolResult` had no case for them and
`ToolCallCard` fell through to its fallback shape.

**Why it matters.** Adding a tool in `tools.ts` without also adding a
`ToolCardKind` variant + render branch silently degrades the chat — the
user sees a tool ran but learns nothing about what it did. Trust in the
chat erodes when actions are opaque.

**How to apply.** When you add or rename a tool:

1. Add or update a variant in `ToolCardKind` (`lib/agent/toolResultParser.ts`).
2. Add the parser case under `switch (toolName)`.
3. Add a rendering branch in `ToolCallCard.tsx`'s `CardContent`.
4. If the tool reveals affected rows, add a section to `ToolDetails`
   for the expanded view.
5. Update `features/chat/ToolGroup.tsx` if the tool should group with
   other read tools.

**Sources.** `lib/agent/toolResultParser.ts`, `features/chat/ToolCallCard.tsx`.
The `panel_set` and `panel_cleared` kinds added 2026-05-16.

---

## L3 — AI actions should manifest through the same UI affordances as the user

**What it is.** The old "Filters set by Reknowable" banner was a
generic accent-tinted pill that hid _what_ the agent did. Users had to
open the filter dropdown to discover that the AI had applied "city:
Stockholm + tag: investor + pinned: Anna, Viktor". Replaced with a
concrete `ActiveFiltersBar` that renders one removable chip per active
facet — exactly what the user would see if they'd applied the filters
themselves.

**Why it matters.** Two principles:

1. **Reviewable + revertable** — the user must be able to see what
   the AI did and undo it.
2. **One source of truth** — if AI-driven state lives in a different
   surface than user-driven state, the two paths can drift.

The AI's only AI-specific affordance is the `Undo Reknowable` button
(restores the pre-AI snapshot). Everything else — chips, remove-X,
"Clear all" — works identically regardless of who set it.

**How to apply.** When the agent gains a new way to mutate UI state:

- Surface the new state through the user-facing controls. If the
  user can't see it via the same controls they'd use, you've created
  a hidden state.
- Capture an undo snapshot on AI-source changes only
  (`setPanelState(patch, { source: 'agent' })` does this in the store).
- Add a chip / row / badge that reads the state and lets the user
  remove it individually.

**Sources.** `features/contacts/ContactsAccordion.tsx` (ActiveFiltersBar),
`lib/store/index.ts` (panelUndoSnapshot), `lib/agent/browserAgent.ts`
(source tagging).

---

## L4 — Semantic value flips need a coordinated migration

**What it is.** Inverting the warmth scale (was 1 = warmest, now 5 =
warmest) required moving the UI, color tokens, sort labels, system
prompt, AND existing row values together so a user's data preserved
its semantic meaning. Just changing labels would have made every "1
= best friend" row read as "1 = stranger".

**Why it matters.** When the meaning of a stored value changes, the
stored data needs to flip with it. Skipping the migration leaves
existing rows silently misclassified.

**How to apply.** For any semantic flip of a stored value:

1. Write the migration first (value-symmetric helps: `6 - x` flips a
   1-5 scale without per-row branching).
2. Update visualization (fill direction, color tokens) in the same
   diff.
3. Update sort labels (numeric direction doesn't change; labels do).
4. Update the system prompt scale block AND every example using the
   old direction.
5. Apply locally only (`pnpm db:up`) per §7.5 — the user triggers
   `ship:db` when ready.
6. Run a real turn against the migrated local DB to verify the agent
   reads the new scale.

**Sources.** `supabase/migrations/0012_invert_warmth_scale.sql`,
`features/ui/WarmthBar.tsx`, `apps/web/app/globals.css` (color ramp
swap), `lib/agent/systemPrompt.ts`.

---

## L5 — Ghost shortcuts: never advertise a key that isn't wired

**What it is.** The sidebar toggle button had `WithTooltip
shortcut="⌘\\"` for months, but no global keydown handler ever bound
that combo. Tooltip lied; pressing the keys did nothing.

**Why it matters.** Every user who tried the advertised shortcut
silently lost trust in the rest of the keyboard surface.

**How to apply.**

- `docs/SHORTCUTS.md` is the single source of truth. A new shortcut
  must appear there with both its handler location AND its hint
  surface filled in.
- A tooltip's `shortcut` prop is a _contract_: there must be a
  matching `addEventListener('keydown', …)` somewhere.
- During audit, grep for `shortcut=` and cross-reference against
  `metaKey || ctrlKey` handlers to catch divergence.

**Sources.** `docs/SHORTCUTS.md` (the rule set + registry),
`features/home/HomeScreen.tsx` (the actual wirings).

---

## L6 — Animate the grid, don't mount/unmount

**What it is.** The sidebar opened/closed by conditionally rendering
its `<Pane>` — appeared/disappeared in one frame, no transition. Fix:
always render the Pane, animate the grid template column width from
220px to 0 via CSS transition.

**Why it matters.** Mount/unmount transitions need `AnimatePresence`

- explicit width animations, which can fight your grid layout.
  Animating `grid-template-columns` directly is supported in modern
  browsers and avoids the conditional-rendering complexity entirely.

**How to apply.** For collapsible panels in a grid:

- Keep the pane mounted; vary the column width via the grid template.
- Apply `transition: grid-template-columns 260ms var(--ease-out)` to
  the grid container.
- Fade the pane's interior content separately so it doesn't pop in
  before the column has any width.
- `overflow: hidden` on the pane so its content doesn't bleed during
  the width animation.
- `aria-hidden` + `pointer-events: none` on the content when
  collapsed.

**Sources.** `features/home/HomeScreen.tsx` (the sidebar wiring).

---

## L7 — Closure timing: read fresh state synchronously before async work

**What it is.** `useAgentLoop.send` was passing empty history to the
LLM every turn. Reason: it built history inside a `setMessages`
updater callback, which fires _after_ `runBrowserAgentTurn` has already
started (React batches state updates).

**Why it matters.** React 18's setState batching means closures read
in updater callbacks observe state at a later tick than your async
caller expects. For data that must be synchronously stable across an
async call boundary, snapshot it _before_ the call.

**How to apply.**

- Snapshot derived state into a local const at the top of your async
  handler — before any `setState`, before any `await`.
- For values that change mid-turn (e.g. the steering queue), use a
  ref kept in sync via `useEffect` so the async caller can read it
  fresh.
- When you find a "the AI got empty X" or "Y was stale" bug, suspect
  closure-over-React-state first.

**Sources.** `features/chat/useAgentLoop.ts` (the fix — see comment
on the `buildHistoryForLlm(messages)` line that runs synchronously
before `setMessages`).

---

## L8 — Lab page is the visual smoke test

**What it is.** `/lab` (`features/lab/LabScreen.tsx`) renders every
design lane + every primitive variant inline, in one file with scoped
CSS variables per lane. No production component imports — mockup HTML
lives in-file.

**Why it matters.** UI changes can be inspected at a glance without
booting the full app, without test users, without a screen reader on a
real screen. Faster than Playwright, faster than Storybook.

**How to apply.**

- When you change a primitive, add or update its appearance in `/lab`
  in the same diff. The lab is where the "before" and "after" comparison
  lives.
- New primitives go in lab BEFORE going into a feature.
- Keep lab self-contained — don't import production components into
  it; copy the markup if needed. Lab drift is a feature, not a bug.

**Sources.** `apps/web/app/lab/page.tsx` (auth-gated entry),
`features/lab/LabScreen.tsx` (the canvas).

---

## L9 — Visual rules for Kbd: collapse only when it actually saves room

**What it is.** Tried "always combine multi-key into one capsule" to
save horizontal room. But thin punctuation glyphs (`,`, `.`, `/`)
disappeared visually when sitting next to the ⌘ icon inside one cap —
`⌘,` for settings rendered as just "Command". Reverted: 2-key combos
get two separate caps; 3+ keys collapse into one.

**Why it matters.** "Make it consistent" can hide a legibility bug.
The right rule isn't always uniform; it's the one that keeps each
glyph legible.

**How to apply.**

- When you're tempted to apply a uniform rule, check the failure modes
  for each input shape (single letter, thin punctuation, multi-char
  label, chord).
- If a rule fails for a real shape, split the rule rather than
  watering down the failing case.

**Sources.** `features/ui/Kbd.tsx`, `docs/SHORTCUTS.md` §4.

---

## L10 — Use lucide icons for symbol keys, characters for word labels

**What it is.** `⌘`, `↵`, `↑↓←→` rendered as Unicode glyphs read
visually smaller than letters at the same font size — the keycap with
`⌘ K` looked like a small mark next to a tall letter. Switching to
lucide's `Command`, `CornerDownLeft`, `ArrowUp/Down/Left/Right` icons
at controlled SVG size + strokeWidth fixed the optical-weight mismatch.

**Why it matters.** Mixing typography and symbols at the same nominal
font size produces unequal optical sizes. SVG icons give you direct
control over visual weight.

**How to apply.**

- For mixed icon/letter UI (keycaps, breadcrumb separators, inline
  badges), prefer SVG icons for the non-letter elements with explicit
  `size` and `strokeWidth`.
- Keep word-style labels (`Esc`, `Tab`, `Shift`) as typography — they
  have enough character-width to balance.

**Sources.** `features/ui/Kbd.tsx` (`ICON_GLYPH` vs `CHAR_GLYPH`).

---

## L11 — Centered toast/banner wrappers must be pointer-events:none

**What it is.** A user reported that icons in the header were
un-clickable on parts of their surface — clicks only registered on the
button padding, not on the icon or text inside. Two rounds of CSS
guesses (global `svg { pointer-events: none }`, `cursor: pointer` on
all buttons) didn't fix it. The actual cause: `OfflineBanner` was a
`fixed inset-x-0 top-0 z-[60]` full-width flex container with
`pointer-events: auto`. Its visible pill is a small centered child,
but the outer wrapper stretched edge-to-edge and intercepted every
click in the top ~48px of the viewport. The button underneath never
received the event. `document.elementsFromPoint` showed the banner div
as the topmost element at every broken click coordinate.

**Why it matters.** This is a stealth bug: the wrapper has no visible
background, no click handler, no apparent reason to exist visually —
its only job is to center a child. But its hit region is the full
viewport width. The user described it as "a recurring theme in many
apps we've built" — it's a pattern bug, not a one-off.

**How to apply.**

- Any `<div className="fixed inset-x-0 …">` or `<div className="absolute inset-0 …">`
  whose only job is to center a smaller child gets `pointer-events: none`.
- The inner visible pill gets `pointer-events: auto` so its own
  controls still work.
- Modals are the exception — their backdrop is intentionally clickable
  to close.
- When debugging "buttons feel un-clickable on some pixels," reach
  for the click inspector (L14) BEFORE assuming an SVG pointer-events
  issue. SVG-in-button is the wrong default suspect.

**Sources.** `features/connection/OfflineBanner.tsx` (the fix).
Diagnosed 2026-05-16 via `/lab/buttons` + `<ClickInspector />`.

---

## L12 — Bulk mutate_sql needs row-by-row optimistic updates

**What it is.** The agent ran `INSERT INTO contacts … VALUES (20 rows) RETURNING *`
to add 20 contacts at once. Only one appeared in the right pane until
the user refreshed. Cause: `useAgentLoop.applyOptimistic` routed the
tool result through `parseToolResult`, which is designed to produce a
single card kind for the chat — its `mutate_sql` branch returns on the
first matching row. Card display is one-row-per-call, but the
optimistic-update path needs every row.

**Why it matters.** `parseToolResult` and the optimistic-update path
look adjacent and shareable, but they answer different questions:

- _Parser_: "What single card should I render in chat?"
- _Optimistic_: "Which rows changed, so I can mirror them into the store?"

Conflating them silently swallows N-1 rows on every bulk mutation.

**How to apply.**

- Card rendering and store-mirroring are different lenses; give them
  different functions.
- `extractMutationRows(args, result)` in
  `packages/app/src/lib/agent/toolResultParser.ts` is the
  store-mirroring lens — walks every row, classifies as contact /
  asset, returns four buckets (`upsertContacts`, `upsertAssets`,
  `removeContactIds`, `removeAssetIds`).
- Soft-delete detection: an `UPDATE … SET deleted_at = …` is a delete,
  but `SET deleted_at = NULL` is a restore (upsert). Distinguish the
  two with a regex, not by string contains.

**Sources.** `packages/app/src/lib/agent/toolResultParser.ts`
(`extractMutationRows`), `packages/app/src/features/chat/useAgentLoop.ts`
(`applyOptimistic`). Diagnosed 2026-05-16.

---

## L13 — Supabase Realtime publication is opt-in per table

**What it is.** `useContacts` subscribes to `public:contacts` and
`public:assets` postgres_changes channels. The subscription succeeds
silently but never fires events for those tables. No migration ever
ran `alter publication supabase_realtime add table public.contacts, public.assets`.
On Supabase, tables are only included in the `supabase_realtime`
publication if explicitly added (or toggled in the Realtime UI). The
default publication is empty.

**Why it matters.** The optimistic-update path (L12) and the Realtime
echo were meant to be belt-and-suspenders: optimistic for in-tab
writes, realtime for cross-tab / cross-device. Today only the
optimistic path works. Single-tab UX is fine; the moment a second tab
or a second device joins, they don't see each other's writes until
refresh. This will bite during multi-device testing in Phase 7+.

**How to apply.**

- When you wire a Realtime subscription, also add the publication
  migration in the same diff: `alter publication supabase_realtime add
table public.<name>;`. Otherwise the subscription is a no-op.
- Reads remain RLS-scoped — publication membership doesn't change
  visibility, only whether the WAL stream surfaces the row.
- Test the subscription by inserting a row in a second tab / SQL
  editor and watching for the event in browser devtools' Network
  panel (WebSocket frames) before declaring the channel healthy.

**Sources.** `packages/app/src/features/contacts/useContacts.ts`
(subscriber, currently a no-op). Migration not yet shipped. Pending
addition as a new `supabase/migrations/NNNN_realtime_pub.sql`.

---

## L14 — Click inspector + lab page for "buttons feel un-clickable"

**What it is.** A two-piece diagnostic for the "I have to click in
exactly the right spot" class of bug:

1. `apps/web/app/lab/buttons/page.tsx` — 10-variant lab page. Each
   card renders the same icon button with a different fix technique
   (baseline, `[&_*]:pointer-events-none`, inline pointer-events,
   overlay click target, native `addEventListener`, capture-phase
   listener, CSS-mask icon, `!important` reset, WithTooltip wrap, live
   inspector). Each shows live counters: React clicks, native DOM
   clicks, mouseenter count, and the `tagName` of the actual event
   target. The user A/Bs them.
2. `packages/app/src/features/ui/ClickInspector.tsx` — fixed-position
   overlay armed via `setClickInspectorArmed(true)`. Captures
   `document.elementsFromPoint(e.clientX, e.clientY)` for every click
   and displays the top 10 elements at that pixel with their
   `pointerEvents` + `zIndex`. Mirrored to localStorage so navigation
   doesn't lose the capture. Renders nothing when not armed (zero cost
   when disabled).

**Why it matters.** Clickability bugs are one of the few UI bugs where
guessing a fix is actively counterproductive — there are ~6 plausible
causes (icon eating events, overlay catching events, stacking context,
synthetic event delegation, stopPropagation, cursor-only confusion),
and CSS rules can mask the symptom without fixing the cause. The lab

- inspector identifies the cause in one click instead of two days of
  CSS guesses (see L11 — this is exactly how the OfflineBanner bug was
  found after CSS attempts failed).

**How to apply.**

- When a button feels un-clickable on parts of its surface, do not
  start with CSS. Open `/lab/buttons`, arm card J's inspector, click
  the broken element on the real page, read the topmost element.
- If the topmost element is not the intended button, that's your
  overlay — fix it (L11 is the most common case).
- If the topmost element IS the button but React's `onClick` doesn't
  fire, compare the `react` vs `native` counters on the lab variants
  — that tells you whether the issue is React event delegation or DOM
  hit-testing.
- Keep the inspector and lab in place after fixing. Both pay for
  themselves the next time something similar happens.

**Sources.** `apps/web/app/lab/buttons/page.tsx`,
`packages/app/src/features/ui/ClickInspector.tsx`. Shipped 2026-05-16
to diagnose the OfflineBanner bug (L11).

---

## L16 — Don't hand-roll positioning; use Floating UI

**What it is.** Tried twice to build viewport-aware tooltip positioning
from scratch (measure trigger center, clamp left, compensate transform
origin). Both attempts shipped, both attempts failed in the screenshot:
tooltips on the rightmost header icons (Theme, Settings) kept
overflowing the viewport. Even after switching from
`getBoundingClientRect` to `offsetWidth` (L15), the visual bug persisted
because there are more failure modes (autoUpdate on scroll, flip when
no room, scrollable ancestors, popover anchored to a transformed
ancestor).

Replaced the whole thing with `@floating-ui/react` (`useFloating` +
`offset` + `flip` + `shift` + `autoUpdate` middleware). 90 lines of
custom math became 30 lines of declarative middleware. It just works.

**Why it matters.** Floating-element positioning is a solved problem
that takes years of edge-case work to get right (iframes, virtual
keyboards, scrollable parents, ResizeObserver coordination, RTL,
mobile viewport units). Radix, HeadlessUI, Mantine, shadcn, Chakra,
React Aria — all of them use Floating UI under the hood. The smart
move is to use the same primitive.

The custom approach kept "almost working" which is the dangerous
state: it looks done, ships, then breaks in screenshots at specific
viewport widths or after specific interactions.

**How to apply.**

- For ANY floating UI (tooltip, popover, menu, dropdown, combobox,
  context menu, hover card), reach for `@floating-ui/react` first.
  The bundle cost is tiny (~10 kB gzipped); the bug avoidance is huge.
- The middleware ordering matters: `offset` first, then `flip`, then
  `shift`. For aligned placements (`top-start`, `bottom-end`), the
  order can change — read the Floating UI flip docs before tweaking.
- For React 18 codebases: prefer a wrapper span pattern (let the
  span catch the floating-reference ref) over `cloneElement(child, {
ref })`. Custom function components without `forwardRef` silently
  drop the cloned ref, breaking the trigger. Span wrappers work
  uniformly across host elements, forwardRef components, and plain
  function components — same model the old hand-rolled tooltip used.
- Use `whileElementsMounted: autoUpdate` so the tooltip stays glued
  to its trigger during scroll / resize / layout changes — this is
  the thing custom code most often forgets.

**Sources.** `features/ui/WithTooltip.tsx` (the new
implementation), `package.json` (`@floating-ui/react@^0.27`). Replaced
2026-05-16 after the screenshot proof that the L15 fix wasn't enough.

---

## L15 — Measuring a mid-animation element: use offsetWidth, not getBoundingClientRect

**What it is.** Tooltip viewport-collision logic was clamping the
`left` position based on `tooltipRef.current.getBoundingClientRect().width`.
The clamp ran but undershot — tooltips on right-edge triggers (Settings,
Theme toggle) still overflowed the viewport by a few pixels. Root cause:
the tooltip animates `scale` from 0.94 → 1 on enter, so a rect width
measured during the layout effect (which fires immediately after the
first render, while scale is still 0.94) returns ~6% less than the
final visible width.

**Why it matters.** Any DOM measurement taken while a CSS-transform
animation is running reflects the transformed size, not the layout
size. For clamping, snapping, or collision logic, you want the layout
size — i.e. what the element will be once the animation completes.

**How to apply.**

- Prefer `offsetWidth` / `offsetHeight` for collision math. These
  return layout dimensions and ignore `transform: scale()` /
  `translate()`.
- Use `getBoundingClientRect()` when you actually want the rendered
  geometry (hit-testing, where it currently appears on screen).
- For animated popovers/tooltips/menus, structure the measurement to
  use offset-\* on the inner element OR measure once before the
  animation starts.

**Sources.** `features/ui/WithTooltip.tsx`. Fix applied after the
clamping refactor on the previous turn appeared to "work" but the
visual bug persisted in screenshots.

---

## L17 — LLM provider keys belong only in the Edge Function, never in the bundle

**What it is.** Reknowable's chat LLM goes through a fallback chain
of four providers (Cerebras GLM 4.7 → Groq gpt-oss-120b → Fireworks
Kimi K2.5 → OpenRouter Gemini 3 Flash). The chain lives in the
`agent-chat` Edge Function. The browser knows nothing about
providers — it sends an OpenAI-compatible body to one URL
(`${supabase}/functions/v1/agent-chat`) with the user's Supabase JWT
as the only auth, and the Edge Function picks a provider, attaches
the provider's Bearer key from `Deno.env`, and pipes the upstream
SSE response back.

**Why it matters.** Any provider key that lands in the browser
bundle is one `view-source` away from being exfiltrated. Tier-1
inference providers don't have OpenRouter-style spend caps; a leaked
Cerebras / Groq / Fireworks key can run a 5-digit bill before the
key gets rotated. The Edge Function pattern keeps the keys
server-side AND lets us implement provider fallback without ever
exposing which provider is being used to the network boundary.

**How to apply.**

- Browser code MUST go through `${supabase}/functions/v1/agent-chat`.
  Never call provider URLs directly, never read provider keys from
  client env. The `env.openrouterApiKey` field in `lib/env` always
  resolves to `null` in the browser bundle by design (Next.js strips
  non-`NEXT_PUBLIC_` vars), and no production code path consumes it.
- Edge Function reads keys via `Deno.env.get(NAME)` only. Each
  attempted provider call is `fetch(provider.endpoint, { headers: {
Authorization: 'Bearer ' + apiKey } })` — the key never travels
  back to the browser, never lands in logs (we log labels and error
  bodies, not keys).
- Keys go in Edge Function secrets (`supabase secrets set NAME=…`)
  for production, and in `supabase/.env` for local dev.
- When you add a 5th provider, add it to `llm/provider.ts`, slot it
  into the chain in `llm/chain.ts` at the right tier, document the
  `extraBody` knobs, and add a key to both `.env.example` files.
  Update this learning if the security model changes.
- Test the security model by `grep`-ing for the literal provider URL
  in `apps/web/.next/static` after a build. The string should NOT
  appear. If it does, you accidentally inlined the URL into client
  code — extract it into the Edge Function.

**Sources.** `supabase/functions/agent-chat/llm/{provider,client,chain}.ts`,
`supabase/functions/agent-chat/index.ts`. Pattern ported from
Incredible's `crates/llm-client/src/stream.rs::LlmClient::with_fallback`
on 2026-05-16.

---

## L18 — Fallback fires only on pre-stream failures

**What it is.** The chain (L17) only walks down to the next provider
when the primary fails **before** any SSE bytes arrive — pre-stream
network errors, pre-stream HTTP 429, pre-stream HTTP 5xx. Mid-stream
errors (provider drops the connection halfway through, sends a
malformed delta, etc.) are **not** retried. The client also does NOT
retry on 4xx-other-than-429 (auth, bad schema — our bug, not the
provider's) and does NOT retry on user abort.

**Why it matters.** Once SSE bytes have started flowing, the AI SDK
on the client is already mid-assembly of a tool call or mid-render
of an assistant message. Switching providers at that point would
produce a corrupted tool call (no second-half arguments) or a
visible seam in the rendered text. The Rust source comment puts it
bluntly: "by then the user may already be hearing audio from the
partial response, and swapping models mid-utterance would produce
audible seams." Reknowable has no audio but the tool-call corruption
risk is identical.

Retrying 4xx-other-than-429 is also wrong: a bad-schema body will
fail at every provider, so we'd just burn the fallback's quota.
Auth failures need a key rotation, not a different provider.

**How to apply.**

- Classify errors before retrying. `isRetriable` in
  `agent-chat/llm/errors.ts` is the only place this decision lives —
  if you find yourself doing ad-hoc retry logic elsewhere, fold it
  in there or you'll drift.
- For new error categories, default to NOT retriable. Opt in
  explicitly only when you've thought through the cost: "is this
  failure mode infra-level, will a different provider succeed, and
  is there zero risk of mid-stream state being already established?"
- Aborts (`signal.aborted` after the fetch promise rejects) are
  ALWAYS non-retriable: the user opted out; serving them a result
  from a different provider would be a UX violation.

**Sources.** `supabase/functions/agent-chat/llm/client.ts`
(`attemptWithFallback` + the abort check), `errors.ts` (`isRetriable`).
Mirrors Incredible's `crates/llm-client/src/stream.rs::is_retriable`.

---

## When to write a new learning

- A bug took more than 20 minutes to diagnose AND the root cause
  isn't obvious from the current code state.
- A pattern was applied in 3+ places this session — it's a real
  pattern, write it down.
- The user gave guidance that overrides an obvious default (e.g.
  "the AI should use the same affordances as the user").
- A migration / data-shape change has a non-trivial coordinating
  rule (e.g. semantic value flips).

Skip if: the fix is fully self-explanatory from a `git log -p`, or if
the pattern is already in a module's CLAUDE.md.
