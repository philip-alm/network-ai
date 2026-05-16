# packages/app/features/ui

The leaf-level UI primitives shared across every other feature. Calm,
typographic, headless-style. No domain knowledge lives here — these
components don't know what a contact or an asset is.

## Public API

- `Kbd` — canonical keycap (single or multi-key). See `Kbd.tsx` JSDoc
  - `docs/SHORTCUTS.md` §4.
- `parseShortcut(s)` — turns `"cmd+K"` / `"⌘K"` / `"?"` into a keys
  array. Used by `WithTooltip` and `SettingsModal` to convert legacy
  string-form `shortcut` props.
- `WithTooltip` — origin-aware tooltip with skip-delay + portal. Auto-
  renders the `shortcut` prop through `Kbd` in inverted tone on the
  dark tooltip bg.
- `WarmthBar` — 5-segment warmth meter. Scale: 5 = warmest, 1 = most
  distant (see `docs/LEARNINGS.md` warmth section for history).
- `Tag` — color-tinted tag pill (`neutral / brand / blue / green / amber`).
- `SoftDivider` — 1px line that fades at the edges via a gradient.
  Used between sections so the eye doesn't read a hard box.
- `Specular` — cursor-tracking specular highlight wrapper (lab + hero).
- `useEnterOnce` — hook that fires its callback once per mount cycle.

## Rules in this module

1. **No domain types.** No `Contact`, no `Asset`, no `PanelState` — if
   a primitive starts pulling from `lib/store`, it doesn't belong here.
2. **No domain logic.** A `Tag` doesn't know which tag-name maps to
   which color; the caller passes `kind`. Mapping lives in the feature.
3. **Tokens, not colors.** Every color refers to `var(--color-*)` or
   a Tailwind token that resolves to one. No literal hex outside the
   warmth ramp colors which intentionally live in `globals.css`.
4. **One primitive per concept.** Don't add a second tooltip, a
   second kbd, a second divider. Extend the existing one.
5. **Render once, style for many.** Components like `Kbd` accept
   `tone` and `size` props that cover every real surface (default vs
   inverted, sm vs md) — don't add `variant="settings-row"` style props
   that hardcode a single consumer.
6. **No tests for trivial wrappers, but every prop branch has a story
   in the lab.** The `/lab` page is the visual smoke test surface.

## What's banned in this module

- Importing from `lib/store`, `lib/agent`, `lib/supabase`, or any
  feature module.
- Reading `process.env`.
- Anything that calls `fetch` or hits Supabase.
- Hand-rolled `<kbd>` outside `Kbd.tsx`. (Every other module is also
  banned from this — see `docs/SHORTCUTS.md`.)

## Tests (MANDATORY)

Visual changes touching a primitive shipped via this folder require:

1. Update the relevant lane(s) in `/lab` so the change is reviewable
   visually without booting the app.
2. If the primitive has prop variants (Kbd's `size`/`tone`, Tag's
   `kind`, Tooltip's `side`), every variant should appear at least
   once in `/lab` so regressions are caught at a glance.

## Non-goals

- This module does not own animation orchestration — that lives where
  it's used.
- This module does not own theme switching — `features/theme` does.
- This module does not own form validation — `zod` schemas live with
  the data layer.

## Recent design decisions

- 2026-05-16: `Kbd` introduced as the canonical keycap. Three local
  implementations deleted (CommandPalette, KeyboardCheatsheet,
  SettingsScreen). Render rule: 1 key = 1 cap; 2 keys = 2 caps with
  gap (so thin glyphs like `,` stay legible); 3+ keys = 1 combined
  capsule (so chords don't spread). lucide icons drive `⌘ ↵ ↑ ↓ ← →`
  for consistent visual weight against typographic letters.
- 2026-05-16: `parseShortcut` added to convert legacy
  `shortcut="⌘K"` strings into key arrays. `WithTooltip` calls it
  internally so existing callers didn't need updating.
- 2026-05-16: `WithTooltip` shortcut prop renders via `Kbd` inverted
  tone — was a plain mono span with no spacing before.
- 2026-05-15: `WarmthBar` semantics flipped (5 = warmest). The fill
  direction, color ramp in `globals.css`, sort labels, system prompt,
  and a data migration all moved together. See LEARNINGS for the
  full pattern.
