---
name: Reknowable
description: A second brain for everyone in your network. Operator's Study, deep navy with brand amber.
colors:
  bg: '#0D1729'
  surface: 'oklch(20% 0.045 260)'
  surface-soft: '#242324'
  fg: '#F4F5F1'
  muted: '#A5A29D'
  faint: 'oklch(50% 0.008 90)'
  border: 'oklch(28% 0.040 260)'
  border-soft: 'oklch(24% 0.040 260)'
  accent: '#CD9B5B'
  accent-soft: 'oklch(30% 0.060 75)'
  danger: 'oklch(68% 0.20 25)'
  warning: 'oklch(78% 0.14 80)'
  warmth-1: '#CD9B5B'
  warmth-2: 'oklch(76% 0.12 50)'
  warmth-3: 'oklch(80% 0.10 30)'
  warmth-4: 'oklch(82% 0.08 350)'
  warmth-5: 'oklch(70% 0.04 260)'
typography:
  display:
    fontFamily: 'Geist Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.75rem'
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: '-0.022em'
  headline:
    fontFamily: 'Geist Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.375rem'
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: '-0.022em'
  title:
    fontFamily: 'Geist Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: '-0.011em'
  body:
    fontFamily: 'Geist Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: '-0.011em'
  label:
    fontFamily: 'Geist Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: '0.04em'
  wordmark:
    fontFamily: 'Geist Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 500
    lineHeight: 1
    letterSpacing: '-0.022em'
  mono:
    fontFamily: 'Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: '-0.01em'
rounded:
  sm: '4px'
  md: '6px'
  lg: '10px'
  xl: '14px'
spacing:
  xs: '0.25rem'
  sm: '0.5rem'
  md: '0.75rem'
  lg: '1rem'
  xl: '1.5rem'
  '2xl': '2rem'
components:
  wordmark:
    backgroundColor: 'transparent'
    textColor: '{colors.fg}'
    typography: '{typography.wordmark}'
  button-recall:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.bg}'
    rounded: '{rounded.md}'
    padding: '0.5rem 0.875rem'
    typography: '{typography.label}'
  button-recall-hover:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.bg}'
  button-ink:
    backgroundColor: '{colors.fg}'
    textColor: '{colors.bg}'
    rounded: '{rounded.md}'
    padding: '0.5rem 0.875rem'
    typography: '{typography.label}'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.muted}'
    rounded: '{rounded.md}'
    padding: '0.25rem 0.5rem'
    typography: '{typography.label}'
  button-ghost-hover:
    backgroundColor: '{colors.surface-soft}'
    textColor: '{colors.fg}'
  input-text:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.fg}'
    rounded: '{rounded.md}'
    padding: '0.5rem 0.75rem'
    typography: '{typography.body}'
  chip-meta:
    backgroundColor: '{colors.surface-soft}'
    textColor: '{colors.muted}'
    rounded: '{rounded.sm}'
    padding: '0.125rem 0.5rem'
    typography: '{typography.mono}'
  card-surface:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.lg}'
    padding: '1.25rem'
  bubble-user:
    backgroundColor: '{colors.fg}'
    textColor: '{colors.bg}'
    rounded: '{rounded.lg}'
    padding: '0.5rem 0.875rem'
    typography: '{typography.body}'
---

# Design System: Reknowable

## 1. Overview

**Creative North Star: "The Operator's Study"**

A CEO's evening office, lit by a single brass lamp. Navy walls. Cream
pages on the desk. Amber-gold spine on the book that just opened. Not a
server room, not an open-plan startup. Considered, late, focused. The
mood of recalling who you know to make the morning's meeting work.

Reknowable is dark by design. The surface is deep navy (the room),
never cool blue-grey (the dashboard). The ink is warm cream (paper),
never pure white. The single accent is **Brand Amber**, taken straight
from the Reknowable logo. It carries every recall moment: focus, the
streaming cursor, AI-action confirmation, the wordmark mark, the
highlight pulse, the once-per-user-lifetime first-entry caption.

The personality is _considered, present, precise._ The product is
operator-grade recall infrastructure for a CEO's network. Sessions are
short and frequent. The interface must reward returning daily without
ever feeling busy.

What this system explicitly rejects: cool-blue "ops dashboard" energy,
purple-to-blue gradients, glassmorphism, neon on dark, sparkle
decoration, identical card grids, cards nested in cards, modal-first
thinking, bouncy easings, animated layout properties, bright primary
buttons used for hierarchy.

**Key Characteristics:**

- Dark by design, navy by surface, cream by ink, amber by accent.
- All five palette values taken from the Reknowable logo.
- Warmth ramp anchors at brand amber for closest and fades to a navy
  slate for most distant.
- Two type families only: Geist Sans for everything, Geist Mono for
  IDs/timings.
- Generous density; the interface breathes.
- Hairline 1px borders; surfaces lift via inset rings on hover, never
  drop shadow.
- All motion ≤ 250ms, ease-out, transform + opacity only.
- 55/45 split panes above `lg`; tab-toggle stack below.
- The wordmark `[●] reknowable` is the sacred identity mark.

## 2. Colors: The Operator's Study Palette

The system uses one chromatic brand accent (Brand Amber) plus a
five-step semantic warmth ramp that anchors at amber and fades to navy.
Everything else is navy surface and warm cream ink, with a warm-graphite
alt step for soft contrast.

### Primary

- **Brand Amber** (`#CD9B5B`, `oklch(72% 0.10 75)`): The recall accent
  and the logo's anchor color. Appears on focus rings, the streaming
  cursor, AI-action confirmation, the wordmark mark, hover-selected
  states, the signature first-entry caption, the highlight pulse, and
  the composer send button. **The rule is rarity per moment** — amber
  marks the moment of recall; it never decorates.
- **Amber Wash** (`oklch(30% 0.060 75)`): The soft variant on navy.
  Used for selection background, the highlight-pulse fade, the auth
  screen halo, the empty-state Notebook icon ring, and any "this is
  brand surface" tint.

### Secondary

_Omitted by design._ Reknowable commits to one accent. Status colors
(danger, warning) carry their own roles and are not "secondary" in the
palette sense.

### Neutral

- **Navy** (`#0D1729`): Page background. The walls of the evening
  office. Slightly cool, deliberately warm enough to escape the
  ops-dashboard reflex.
- **Surface Navy** (`oklch(20% 0.045 260)`): Cards, header, accordion
  sections. One tonal step lighter than the page.
- **Warm Graphite** (`#242324`): Soft surfaces — chips, kbd, code,
  composer well. The warmer alt step that pairs with navy without
  shifting hue. Logo color.
- **Cream** (`#F4F5F1`): Foreground text. Warm-tinted; never pure
  white. The ink the user reads. Logo color.
- **Warm Grey** (`#A5A29D`): Secondary text — labels next to primary
  content, metadata, asset descriptions. Logo color.
- **Faint Cream** (`oklch(50% 0.008 90)`): Tertiary text — empty-state
  hints, kbd captions, placeholder copy. Derived from Warm Grey.
- **Hairline** (`oklch(28% 0.040 260)`): The standard border. Navy-tinted,
  visible against the bg, never harsh.
- **Hairline Soft** (`oklch(24% 0.040 260)`): The lighter divider —
  between contact rows, inside cards.

### Status

- **Danger** (`oklch(68% 0.20 25)`): Destructive only. Delete
  confirmations, destructive button backgrounds. Higher chroma than
  light-mode danger so the warning carries on navy.
- **Warning** (`oklch(78% 0.14 80)`): Warning only. Reserved; the system
  rarely warns. Sits close to brand amber on the hue wheel by design —
  the system uses warning as "almost recall," reserved for genuine
  retry / transitional states.

### Warmth Ramp

The five-step ramp on contact rows. Anchors at Brand Amber (closest
contacts share the recall signal) and fades through warm rose and dusty
pink to a navy slate (most distant).

- **Warmth 1 — Brand Amber** (`#CD9B5B`): _closest, would do anything_
- **Warmth 2 — Ember** (`oklch(76% 0.12 50)`): _WhatsApp, no problem_
- **Warmth 3 — Rose Amber** (`oklch(80% 0.10 30)`): _solid professional
  contact_
- **Warmth 4 — Dusty Pink** (`oklch(82% 0.08 350)`): _would respond if
  I asked_
- **Warmth 5 — Navy Slate** (`oklch(70% 0.04 260)`): _might respond_

### Named Rules

**The Recall Rule.** Brand Amber appears only where the system marks a
moment of recall: focus, the streaming cursor, AI-action confirmation,
the wordmark mark, the highlight pulse, the signature first-entry, the
composer send button. Decorative use breaks the rule.

**The Navy-and-Cream Rule.** Every surface is navy (cool, with hue
~260) or warm graphite (the alt step). Every ink is cream or its
derivatives. Pure black (`#000`) and pure white (`#fff`) are banned.
Cold blue-grey (`oklch(L 0 240)`) is banned — surfaces must carry the
navy chroma. Off-greys without a hue are banned.

**The Logo-First Rule.** The five hex values from the Reknowable logo
(`#0D1729`, `#242324`, `#A5A29D`, `#CD9B5B`, `#F4F5F1`) are sacred. They
are the brand's color identity. Token values may shift slightly for
contrast and tonal layering, but every surface, ink, and accent on screen
traces back to one of these five. New chromatic colors require an explicit
case and update to this rule.

**The Warm-to-Cool Rule.** The warmth ramp's gradient (warm at close,
cool at distant) is semantic and load-bearing. Do not reorder.
Warmth-1 must always be the warmest (= brand amber); warmth-5 always
the coolest (= navy slate).

## 3. Typography

**Body / Display Font:** Geist Sans (with ui-sans-serif, system-ui
fallback).
**Mono Font:** Geist Mono (with ui-monospace, SFMono-Regular, Menlo
fallback).

**Character:** Geist is a precise neo-grotesque with subtle character
(cv02, cv11, ss01, ss03 feature flags active globally). It carries
hierarchy through scale and weight contrast rather than face change.
Mono appears only on inherently technical strings: IDs, timings,
keyboard hints, asset counts. Never as decoration.

### Hierarchy

- **Display** (Geist Sans, 500, 1.75rem / 1.3, `-0.022em`): Reserved for
  top-of-screen surfaces. Rare; Reknowable is not a marketing site.
- **Headline** (Geist Sans, 500, 1.375rem / 1.4, `-0.022em`): Sub-section
  heading; auth screen titles.
- **Title** (Geist Sans, 500, 1.125rem / 1.5, `-0.011em`): Contact name
  in a row, card title, dialog title.
- **Body** (Geist Sans, 400, 0.9375rem / 1.6, `-0.011em`): All running
  text, chat bubbles, notes. Capped at 65–75ch where it wraps. System
  letter-spacing is `-0.011em` globally.
- **Body Small** (Geist Sans, 400, 0.8125rem / 1.55, `-0.011em`): Asset
  descriptions, captions, secondary chat metadata.
- **Label** (Geist Sans, 500, 0.75rem / 1.5, `0.04em`, **uppercase**):
  Section headers inside contact rows ("Warmth", "Notes", "Assets"),
  kbd hints.
- **Wordmark** (Geist Sans, 500, 1rem / 1, `-0.022em`, **lowercase**):
  The brand mark itself. See §5 Wordmark.
- **Mono** (Geist Mono, 400, 0.8125rem / 1.55, `-0.01em`): IDs, timings,
  asset counts, kbd content only.

### Named Rules

**The One-Family Rule.** Geist Sans + Geist Mono are the entire
typography vocabulary. Do not add a third family. Hierarchy comes from
weight (400 ↔ 500), scale (0.75rem → 1.75rem), and case (sentence ↔
uppercase-label). Never from a serif/script accent.

**The Mono-for-Tech Rule.** Geist Mono appears only on inherently
technical strings: timestamps, durations, IDs, key captions, asset
counts, kbd content. If a piece of prose could be read aloud as words,
it is not Mono.

**The Tight-Tracking Rule.** Body and titles run at `-0.011em` tracking;
display, headlines, and the wordmark at `-0.022em`. Labels use positive
`0.04em` (uppercase). Do not introduce new tracking values.

**The Wordmark Singular Rule.** The wordmark lockup (`[●] reknowable`,
all-lowercase, Geist Sans 500, leading Brand Amber dot) is sacred.
Never set the mark uppercase or title-case. Never wrap it in a badge or
rule. The dot is non-decorative; it carries the brand color. Use the
`<Wordmark/>` component. At most twice per surface.

## 4. Elevation

The system is **flat by default and hairline-ringed.** There is no
drop-shadow vocabulary in the resting state. Depth on the navy surface
comes from:

1. **Inset hairline rings** (`box-shadow: inset 0 0 0 1px var(--color-border-soft)`)
   describe surfaces (cards, the composer well) without lifting them off
   the page.
2. **A subtle hover lift** combines a hairline ring with a soft dark
   ambient shadow plus a barely-visible warm highlight ring — used only
   on cards that are genuinely interactive at rest.
3. **The focus shadow** is a doubled ring: a 2px bg-navy halo against a
   2px Brand Amber stroke, giving the focused element a clean offset on
   the navy surface.

There is no "lifted card on the page" pattern. Hero panels do not float.
Modals (which the system avoids) would use the same hairline-and-flat
treatment with no shadow under them.

### Shadow Vocabulary

- **Hairline** (`box-shadow: inset 0 0 0 1px var(--color-border)`):
  Standard surface ring on cards and most containers.
- **Hairline Soft** (`box-shadow: inset 0 0 0 1px var(--color-border-soft)`):
  Lighter ring on the composer well, kbd, and chips.
- **Lift** (`box-shadow: 0 0 0 1px var(--color-border), 0 8px 24px -16px
oklch(0% 0 0 / 0.5), 0 0 0 1px oklch(100% 0 0 / 0.02)`): Only on
  genuinely interactive surfaces, never at rest. Provides a soft
  navy-dark halo plus a barely-visible warm highlight ring.
- **Focus** (`box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 4px
var(--color-accent)`): The doubled focus ring on inputs and the
  composer textarea.

### Named Rules

**The Flat-by-Default Rule.** No element carries a drop shadow at rest.
Lift is a response to state (hover, focus), not a property of identity.
If you find yourself reaching for `shadow-md` or `shadow-lg`, the answer
is wrong; reach for a hairline or a tonal surface step instead.

**The Hairline-First Rule.** Surfaces describe themselves with a 1px
hairline ring, not a fill change. Surface Navy plus a hairline-soft
ring is the entire vocabulary for "this is a contained thing."

## 5. Components

### Wordmark (signature component)

The Reknowable brand lockup. Implemented as `<Wordmark tone="header" |
"hero" />` in `@reknowable/app/features/brand`. Never construct inline.

- **Lockup shape:** a Brand Amber dot (6px header, 10px hero), then the
  lowercase mark `reknowable` set in Geist Sans 500, tracking `-0.022em`.
- **Color:** dot uses `var(--color-accent)`; mark uses `var(--color-fg)`.
  Never custom-color the dot.
- **Where it appears:** top-of-product header, auth screen heroes,
  browser tab title (text-only, no dot).
- **Never:** uppercase, title-case, boxed, badged, ruled, or as a
  decorative repeat.
- **External marketing logo:** the Reknowable wordmark with the "re"
  ligature is the canonical external mark (favicon, app icon, social
  avatars, marketing pages). The in-product `<Wordmark/>` is the
  in-product distillation.

### Buttons

The system has three button kinds, each anchored to a role:

- **Shape:** Medium radius (6px). No fully-rounded pills except the
  warmth dots.
- **Recall (filled Brand Amber):** background `var(--color-accent)`,
  text `var(--color-bg)`, padding `0.5rem 0.875rem`, label typography.
  Used on the composer Send button only — it carries the recall moment.
  Hover: opacity 90%; disabled: surface-walnut background with faint
  text.
- **Filled-Ink:** background `var(--color-fg)`, text `var(--color-bg)`,
  used on the composer Stop button, notes Save, the Undo banner, and
  any place a high-contrast cream-on-navy button is right (auth
  submit).
- **Ghost:** transparent background, muted text. Padding `0.25rem
0.5rem`. Used for Edit notes, Delete, Cancel, and most inline row
  actions. Hover: warm-graphite background, cream text.

### Inputs / Fields

- **Style:** Background `var(--color-surface)`, text `var(--color-fg)`,
  medium radius (6px), padding `0.5rem 0.75rem`.
- **Default surround:** `shadow-hairline` (inset 1px border).
- **Focus:** Switches to `shadow-focus` (doubled ring — 2px bg-navy
  halo + 2px Brand Amber stroke). The focus state never shifts layout.
- **Placeholder:** `var(--color-faint)`; italic where the field
  intentionally wants prose tone ("No notes yet.").
- **Disabled:** opacity 60%, no other change.

### Chips / Meta Tags

- **Style:** Warm Graphite background, Warm Grey text, 4px radius,
  padding `0.125rem 0.5rem`, Mono font. Often uppercase with wide
  tracking when used for counts ("2 ASSETS").
- **States:** No hover; chips are not interactive.

### Cards / Surfaces

- **Corner Style:** Large radius (10px) for cards; medium (6px) inside.
- **Background:** `var(--color-surface)` for the resting card;
  `var(--color-bg)` for inputs nested inside (drops a tonal step).
- **Ring:** `inset 0 0 0 1px var(--color-border-soft)` is the default.
  No drop shadow.
- **Internal Padding:** `1.25rem` standard; contact-row interior uses
  `1.25rem` horizontal + `0.875rem` vertical to give name + warmth-dot
  rows room to breathe.

### Contact Row (signature component)

The unit of the right pane. Each row is:

- Tappable header: warmth dot (9px circle, ramp color) + bold name
  (title weight) + city + optional asset-count chip + chevron (rotates
  90° on open). Padding `0.875rem 1.25rem`. Hover: warm-graphite fill.
- Expanded section (height-animated via Motion, 220ms ease-out-quart):
  warmth label, tag chips, notes prose (always editable on click),
  asset list, edit/delete ghost buttons.
- **Notes:** click to edit. Saves silently with a 600ms debounce while
  typing, immediate save on blur, Esc reverts and exits. The "saved"
  hint fades after 2.4s.
- **Delete:** single button, no confirmation. The row removes
  optimistically; an Undo banner appears at the bottom of the accordion
  for 5s with the contact's name, a timer progress bar, and an Undo
  affordance (also bound to `⌘Z` globally).
- **Highlight pulse:** when the agent "Jump to"s a contact, the row
  gets a 1.2s `accent-soft → transparent` background sweep. Single
  shot. Never loops.

### Chat Bubble

- **User bubble:** filled-cream background (`var(--color-fg)`), navy
  text, 10px radius, max-width 88%, padding `0.5rem 0.875rem`.
  Right-justified. On the navy surface, this reads as "the user's side"
  — the bright page in the room.
- **Assistant bubble:** no background, full-width, max-width 92%,
  left-justified, cream prose on navy. The streaming cursor (3px ×
  14px, Brand Amber, 1.05s blink) attaches to the trailing text
  segment.
- **Tool-call cards** (inside assistant bubbles): Warm Graphite surface,
  hairline ring. AI-action confirmation verbs render in Brand Amber
  ("Added", "Found"). Subject to the flat-by-default rule.

### Command Palette (signature component)

Invoked with `⌘K`. The operator-grade recall surface.

- **Shape:** centered modal at 12vh from top, rounded-xl, 1px border
  ring, 24px ambient drop shadow at 60% opacity.
- **Header:** search icon + input + close button. Input is bare,
  transparent, 15px Geist Sans.
- **Results:** up to 8 rows. Each: icon-in-circle (filled-amber on
  highlight, soft-graphite at rest) + name + meta (city / availability)
  - warmth hint.
- **Footer:** kbd hints (↑ ↓ ↵ Esc) + result count.
- **Motion:** scale-in 180ms ease-out-quint; backdrop blur-sm.

### Keyboard Cheatsheet

Invoked with `?`. A quiet modal listing every shortcut by section.
Same modal shape as the command palette. Sections: Anywhere / Chat /
Contact rows.

### Settings Page

Route `/settings`. Sections: Account / Keyboard / Danger zone. Each
section: icon-in-circle + heading + rounded surface containing rows.
Danger zone has a type-`delete`-to-confirm pattern with Brand
Danger-filled button.

### Offline Banner

Mounted at root, fixed top-center. Quiet pill with cloud-off icon and
copy: _"Offline. Changes will sync when you're back online."_ Appears
when `navigator.onLine === false`; auto-dismisses on reconnect.

### Navigation

Above `lg` (1024px) the shell is a 55/45 split: chat on the left,
contacts accordion on the right, both panes own their own scroll, the
page is fixed-height. Below `lg` the two panes stack and the header
carries a Chat/Contacts tab toggle so only one pane is visible at a
time. The top header carries the `<Wordmark/>` at left, a palette
trigger pill (`Find · ⌘K`), the user email (xl+), and three icon
buttons (Help / Settings / Sign out), with a 1px Brand-Amber underline
(`accent/25`) as a quiet brand band beneath it.

### Warmth Dot

A 9px circle (`rounded-full`) filled with one of the warmth-ramp
colors. No border, no shadow, no inner highlight. The `aria-label`
carries the warmth number + label (`"warmth 1, closest, would do
anything"`) for screen readers.

### Signature moments

The system reserves Brand Amber's most expressive uses for rare,
earned moments. Each one fires at most once per user lifetime
(localStorage-guarded) and carries the Reknowable voice in its copy.

| Moment          | Trigger                                                                     | Expression                                                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **First entry** | Contacts list transitions from 0 → 1 (and the user has not seen it before). | A pulsing Brand Amber dot + caption _"Your first entry. The notebook begins."_ renders on an Amber-Wash band below the new row, auto-dismisses after 3s. The localStorage flag `reknowable:first-contact-celebrated` persists the "already seen." |

**The Earned-Moments Rule.** Signature moments must be rare on purpose.
Today there is one; if there are ten, none of them are signature
anymore. New signature moments require a name, a once-per-lifetime
trigger, and an explicit Brand-Amber expression. They go in this table
or they aren't shipped.

### Motion vocabulary

Motion has meanings, not styles. Use the semantic token, not an ad-hoc
duration. All motion respects `prefers-reduced-motion: reduce` and
falls back to instant.

| Token             | Duration        | Easing           | Properties                        | Used for                                                                                     |
| ----------------- | --------------- | ---------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `motion.entrance` | 160–220ms       | `ease-out-quart` | `opacity`, `y` (4–8px)            | Chat bubbles, banners, retry hints, accordion rows appearing.                                |
| `motion.feedback` | 120–160ms       | `ease-out-quart` | `opacity`, `scale` (0.96–0.99)    | Hover/tap micro-interactions; button press feedback.                                         |
| `motion.expand`   | 220ms           | `ease-out-quart` | `height` (auto), `opacity`        | The single sanctioned layout-property animation: accordion row expand. Disallowed elsewhere. |
| `motion.pulse`    | 1200ms once     | `ease-out`       | `background-color`                | The recall flash after "Jump to" / signature moments. One shot, never loops.                 |
| `motion.cursor`   | 1050ms infinite | `steps(2)`       | `opacity`                         | The streaming cursor. Bound to the trailing text segment.                                    |
| `motion.pending`  | 1200ms infinite | `linear`         | `opacity` (0.3 → 1 → 0.3)         | The three pulsing dots beside the phase pill.                                                |
| `focus-arrive`    | 120ms once      | `ease-out-quart` | `outline-offset`, `outline-color` | Focus ring fade-in when arriving via tab.                                                    |

**The Layout-Properties Rule.** `motion.expand` is the only sanctioned
animation of a layout property (`height`). Everything else animates
`transform` + `opacity` only. New animations must use one of the tokens
above or document a new one in this table.

### Icon registry

Sanctioned set: [lucide-react](https://lucide.dev/) at 1.5px stroke
(the lucide default). **No other icon families. No custom SVGs.** Sizes
are role-based, not pixel-perfect.

| Context                      | Size                  | Examples                                                                                          |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------- |
| Inline button (ghost / pill) | 12px                  | `Pencil`, `Trash2`, `Undo2`, `Check`, `X`                                                         |
| Header / action button       | 14px                  | `LogOut`, `Settings`, `HelpCircle`, `Search`, `ArrowUp` (composer send), `Users`, `MessageSquare` |
| Empty-state hero             | 16px (in a 40px ring) | `Notebook`                                                                                        |
| Tool-card inline             | 12–14px               | `Search`, `Database`, `UserPlus`, `Edit3`, `Briefcase`, `AlertCircle`, `Mail`                     |
| Mention pill                 | 10px                  | `User`, `Briefcase`, `ArrowUpRight`                                                               |
| Chevron                      | 14px                  | `ChevronRight` (accordion), `ChevronDown` (tool-card expand)                                      |
| Offline / connection         | 11px (in a 20px ring) | `CloudOff`                                                                                        |

**Banned icons.** `Sparkles`, `Stars`, `Wand`, `Wand2`, any "magic /
AI" decorative glyph. Replacement options for "ask / discover /
explore": `Compass`, `MessageCircleQuestion`, `HelpCircle`.

**Color.** Icons inherit `currentColor`; the parent's text color rules.
No icon should carry its own non-token color.

**The One-Family Rule (icons).** lucide-react only. Don't mix in
Feather, Heroicons, Tabler, Phosphor, or custom SVGs. The wordmark dot
is a styled `<span>` (not an SVG); it's the one exception, and it lives
inside the `<Wordmark/>` component.

## 6. Do's and Don'ts

### Do:

- **Do** use Brand Amber only for recall moments: focus, the streaming
  cursor, AI-action confirmation, the wordmark mark, hover-selected
  states, signature first-entry, and the composer send button.
- **Do** reach for a different type weight or scale before reaching for
  color or decoration.
- **Do** keep neutrals tinted: navy surfaces carry hue 260 chroma 0.04,
  ink carries hue 110 chroma 0.008. Never pure `#fff` or `#000`. Never
  cold blue-grey without hue.
- **Do** use the inset hairline ring (`shadow-hairline`,
  `shadow-hairline-soft`) to describe surfaces. Cards are flat; they
  ring themselves.
- **Do** keep all motion ≤ 250ms, ease-out (`ease-out-quart` or
  `ease-out-expo` or `ease-out-quint`), on transform + opacity only.
- **Do** use Geist Mono only on inherently technical strings (IDs,
  timings, kbd, asset counts).
- **Do** respect `prefers-reduced-motion: reduce` — non-essential
  animations become instant state changes.
- **Do** keep body line length at 65–75ch where it wraps (notes, chat
  prose).
- **Do** use the `<Wordmark/>` component for any in-product appearance
  of the brand mark.
- **Do** add press feedback (`active:scale-[0.96]` or `0.98`) on every
  interactive button.

### Don't:

- **Don't** add a second chromatic brand color. Reknowable runs on
  Brand Amber + the warmth ramp. Green, teal, magenta, electric blue
  are prohibited.
- **Don't** use `#000` or `#fff`. Every neutral tilts toward
  navy / cream. Cold zero-chroma blue-greys are banned.
- **Don't** use AI slop in any form: purple-to-blue gradients,
  glassmorphism, neon on dark, cyan on black, sparkle decorations,
  "AI-generated" patina.
- **Don't** reach for `box-shadow: 0 4px 12px rgba(0,0,0,0.1)` or any
  drop-shadow card lift. Surfaces are flat; hairlines describe them.
- **Don't** build card grids of equal-sized rounded rectangles with
  icon-above-heading-above-text. SaaS template; reads as
  AI-generated.
- **Don't** nest cards inside cards. Always wrong.
- **Don't** reach for a modal when something fits inline. Command
  palette and cheatsheet are the only sanctioned modals; both have
  earned their case.
- **Don't** use bouncy, elastic, or spring-overshoot easings. Ease-out
  only.
- **Don't** animate layout properties (height, width, padding, margin).
  Transform + opacity only. Exception: `motion.expand` for
  accordion-style reveal.
- **Don't** use bright primary buttons for hierarchy. Hierarchy lives
  in type weight, scale, and contrast.
- **Don't** introduce a third type family. Geist Sans + Geist Mono are
  the entire vocabulary.
- **Don't** mix in icons from other families (Phosphor, Heroicons,
  Tabler, Feather) or write custom SVGs. lucide-react only.
- **Don't** use em dashes in UI copy. Commas, colons, semicolons,
  periods, or parentheses instead.
- **Don't** re-style the wordmark inline. Use `<Wordmark/>`. Don't set
  it uppercase. Don't put a box around it. Don't lose the dot.
- **Don't** drift toward "ops dashboard" navy by adding cyan accents,
  neon glow, or terminal-green data displays. The escape from the
  observability-tool reflex is warm cream ink + brand amber + zero
  data-viz cliché.
