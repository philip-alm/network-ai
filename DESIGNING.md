# Designing for Reknowable

This is the design-thinking manual for everyone (including future agents)
working on Reknowable's interface. It does not specify pixel values; for
those, see `DESIGN.md`. It does not specify voice; for that, see `BRAND.md`.

This file specifies **how to think** when designing a component, a surface,
or a flow. If you've never worked on this product before, read this first.

---

## The four anchors

Every UI decision answers to four anchors, in this order.

### 1. Hierarchy

Before pixels, decide what the user must see first, second, third. Most
surfaces fail not because they're ugly but because they don't have a clear
visual hierarchy. Three reads happen on every screen:

- **At a glance** — what is this surface, and what is the one most important
  thing on it? Title weight + size carries this. The second-most-important
  thing is supporting context (subtitle, byline). The third is everything else.
- **In a scan** — how do the rows/sections/cards group? Adjacent items
  should feel related; separations should mean "different idea." Rhythm
  (consistent spacing within a group, larger spacing between groups) and
  panel boundaries carry this.
- **In the work** — once the user is using the surface, where do their eyes
  land for the action they're about to take? The primary action should be
  the most prominent interactive element. Secondary actions step down in
  weight. Never have three "primary" buttons next to each other.

When you write a component, ask in order:

1. What is the one thing on this screen?
2. What groups support it?
3. Where will the user act?

If you can't answer in 5 seconds, the hierarchy isn't clear yet. Don't
write CSS — rework the structure.

### 2. Architecture

Architecture is the layout language. Reknowable uses **panel-based**
architecture: surfaces are rectangles with their own background, sitting on
a page background with gaps between them. Panels can contain other panels
(but rarely). Inside a panel, items use **rhythm-based separation**, not
hairline rules between every row.

Rules of thumb:

- **The page background is the gallery wall.** Panels sit on it with breathing
  room.
- **A panel groups one concept.** "Contacts" is a panel. "Settings →
  Account" is a panel. "The chat" is a panel.
- **Headers belong to their panel.** A panel header lives inside the panel,
  not outside it. Use a `<SoftDivider />` to separate the header from
  contents when the panel has enough content to warrant it.
- **No hairline between every row.** Rows in a list group by rhythm and
  hover state. The eye separates them by spacing, not by walls. Add a hard
  divider only when groups change meaning (a new section, not a new item).
- **Cards inside panels are usually wrong.** If your panel needs nested cards,
  it's two panels, not one.

The shell pattern: header at top (no border-bottom needed; it's separated
by being a different surface), main split into 1–2 panes (lg+), each pane
holds 1–2 panels.

### 3. Spacing & negative space

Spacing is the design. Tightening or loosening padding changes the read of
the whole product. Reknowable defaults to **generous** — Linear's tighter
side, not Notion's spacious side, but never cramped.

How to think about spacing:

- **A surface with breathing room reads as considered.** A surface packed to
  the margins reads as a prototype.
- **The space between groups should be 2–3× the space within a group.**
  This is what makes the eye perceive grouping without a divider.
- **Negative space around a hero element is the hero element.** The page
  margin around an empty state matters as much as the empty state itself.
- **When in doubt, add more.** I have never seen a Reknowable surface that
  felt better after we tightened it. I have seen many that felt better
  after we loosened it.

Per-surface guidance:

- **Top-level page**: 56-80px top, 80-160px bottom, max-width 1100px at center.
- **Panel padding**: a comfortable internal padding (24–32px) that's larger
  than the gap between rows.
- **List rows**: vertical padding ≈ 50% of the body line-height. Generous
  horizontal padding for touch targets.
- **Headings to content**: more space than you think. 4–6× the body line-height
  is not too much for a top-level heading.

When tempted to add a divider line, try adding more space first.

### 4. Interactivity

**No interactive component is allowed to be static or dead.** Every button
responds to press. Every link hovers. Every focusable element has a visible
focus state. Every icon-only button has a tooltip. Every dropdown option
hovers, every modal dismisses on Escape and click-outside.

This is not a suggestion. It is the bar. A static button is a broken button.

The full set of states for any interactive component:

- **default** — at rest
- **hover** — pointer is over it (gated by `@media (hover: hover)` on touch
  devices)
- **focus-visible** — keyboard focus has arrived
- **active** — pressed (always `transform: scale(0.95)` on UI scale)
- **disabled** — visible but inert (opacity 0.5–0.6, no press feedback)
- **loading** — async work in flight (spinner replaces icon; label changes
  to present-participle, e.g. "Adding")
- **error** — failed (color shifts to danger; recovery action visible)

For any new component, audit the seven states before considering it done.

---

## The five rules of motion

Every animation answers to these. Adapted from Emil Kowalski's design
engineering philosophy.

### 1. Should it animate at all?

Frequency matters. Animation on a button pressed 100 times a day feels
sluggish. Animation on a modal opened occasionally feels good.

| Frequency  | Decision             |
| ---------- | -------------------- |
| 100+ / day | No animation.        |
| Tens / day | Drastically reduced. |
| Occasional | Standard.            |
| Rare       | Can add delight.     |

**Never animate keyboard-initiated actions.** A command palette opens
instantly; it doesn't fade in.

### 2. What purpose?

Every animation needs a one-sentence answer to "why does this animate?"

- **Spatial consistency**: it enters from where it'll exit.
- **State indication**: the state change is visible.
- **Feedback**: the press is heard.
- **Preventing a jarring change**: a thing that would otherwise pop.

If the only answer is "it looks cool," and the user sees it often, don't
animate.

### 3. What easing?

Use the custom CSS variables from `globals.css`:

- `var(--ease-out)` — for entering, exiting, and 95% of UI motion
- `var(--ease-in-out)` — for on-screen movement that has to settle
- `var(--ease-drawer)` — iOS-feel for drawer pulls

**Never `ease-in` for UI.** It starts slow, which is the exact moment the
user is watching most closely. It will feel sluggish.

**Never built-in `ease`, `ease-out`, `ease-in-out`** (without the var).
They're too weak; they lack the snap that makes animations feel intentional.

### 4. How fast?

UI animations should stay under 300ms.

| Element                 | Duration      |
| ----------------------- | ------------- |
| Button press            | 100–160ms     |
| Tooltip / small popover | 125–200ms     |
| Dropdown / select       | 150–250ms     |
| Modal / drawer          | 200–500ms     |
| Marketing / explanatory | Can be longer |

A 180ms dropdown feels more responsive than a 400ms one.

### 5. What property?

Only animate `transform` and `opacity`. They skip layout and paint, run on
the GPU, stay smooth at 60fps under load.

`height: auto` for accordion-style reveal is the one sanctioned exception
(via Motion's `<AnimatePresence>` height animation).

---

## Color, used wisely

Every chromatic moment should answer "why this color, here?" If the answer
is "decoration," remove it.

### The palette is a system, not a paint set

- **Surfaces** carry no chroma (warm-tinted neutrals). Pure black/white are
  banned.
- **Ink** carries no chroma. Three weights: `fg` (full strength), `muted`
  (secondary), `faint` (tertiary). Reach for one of these first.
- **Accent** carries meaning. Used for: focus rings, the in-flight cursor,
  AI-action confirmation, the wordmark mark, hover-selected, signature
  moments, the composer Send button. Nowhere else. The rarity is the point.
- **Tags** carry categorical meaning via the `<Tag>` component's `kind`
  prop. Five kinds: `neutral`, `brand`, `blue`, `green`, `amber`. Each
  has both a light-mode and dark-mode bg+fg defined as CSS variables.
- **Status colors** (danger, warning) are reserved for their roles.

### Adding a new color

Don't, usually. If you genuinely need one:

1. Justify it in writing. What semantic does it carry?
2. Pick OKLCH values for both light and dark themes.
3. Add it as a CSS variable to both `:root` and `[data-theme='dark']` in
   `globals.css`.
4. Document it in `DESIGN.md`.
5. Use it consistently.

### Decorative dots are banned

Small colored circles used as ornament — leading dots on labels, status
dots beside names, accent pips on headers — are banned. They read as
template / SaaS slop. Use:

- A `<Tag>` for category info
- A `<WarmthBar>` for warmth (or any 1–5 scale)
- Iconography for action/info clarification
- Type weight + color for hierarchy

If you find yourself reaching for a small colored circle, you're choosing
decoration over function.

---

## Typography rules

- **Two families only**: Geist Sans (body, headings, labels) and Geist Mono
  (IDs, timings, kbd, asset counts, anything inherently technical).
- **Mono is for technical strings, not section headers.** "ACCOUNT" in mono
  uppercase reads as terminal/system, not as a section heading. Use
  sentence-case sans for section heads.
- **Hierarchy from weight + scale + case**, not from face change. A heading
  is just larger and slightly bolder body text.
- **Body 13–15px** in product surfaces. 11–13px on labels and captions.
- **Body line length** caps at 65–75ch for prose. Data can run wider.
- **Tracking**: tighter on display (`-0.022em` to `-0.028em`), neutral on
  body (`-0.005em` to `-0.011em`), positive on uppercase labels (`+0.04em`).

When in doubt, drop one weight step and add one size step — the same
effect with less visual weight.

---

## Icons

- **lucide-react only.** No other icon families, no custom SVGs (the brand
  Wordmark dot is the one sanctioned exception, and it's a styled span,
  not an SVG).
- **Use icons to clarify**: actions (Edit, Delete, Filter, More), info
  (Calendar, Mail, MapPin), state (CheckCircle2, AlertCircle, CloudOff).
- **Don't use icons as decoration**: empty-state hero icons, section-head
  marks — these are visual fluff if they don't carry meaning.
- **Sizes**: 10–12px for inline (pills, mentions), 14px for header actions,
  16–22px for empty-state hero icons.
- **Color**: `currentColor`. Don't set a non-token color on an icon.
- **Banned**: `Sparkles`, `Stars`, `Wand` — they read as "AI patina."

---

## Component build checklist

When you build a new component (or audit an existing one), walk this list
before shipping:

### Structure

- [ ] One clear concept per component file
- [ ] Public props are the minimum needed; no flag-soup
- [ ] No magic colors — every color goes through a CSS variable
- [ ] No magic spacing — uses the same scale as the rest of the app

### Hierarchy

- [ ] One primary visual element on the surface (a name, a heading, a CTA)
- [ ] Secondary elements step down in weight
- [ ] No two elements competing for the same role

### Interactivity (every interactive element)

- [ ] Hover state (gated by `@media (hover: hover)` if appropriate)
- [ ] `:focus-visible` state — keyboard users see where they are
- [ ] `:active` press feedback (`scale(0.95)` + `transition: transform 160ms var(--ease-out)`)
- [ ] Disabled state if applicable
- [ ] Loading state if async
- [ ] Error state if failable
- [ ] Tooltip via `<WithTooltip>` if icon-only
- [ ] Keyboard shortcut shown in tooltip if one exists
- [ ] Works with keyboard alone (Tab, Enter, Esc)

### Motion

- [ ] Every animation answers "why does this animate?"
- [ ] Uses `var(--ease-out)` (or another lane var); never built-in `ease-*`
- [ ] Duration under 300ms for UI
- [ ] Only animates `transform` / `opacity` (or sanctioned `height: auto`
      for accordions)
- [ ] Respects `prefers-reduced-motion`

### Color

- [ ] No `#fff` or `#000`
- [ ] No new chromatic color introduced — uses the existing system
- [ ] Accent (`--color-accent`) used only for the sanctioned recall moments

### Copy

- [ ] No em dashes (`—`, `--`)
- [ ] No exclamation marks
- [ ] No emoji
- [ ] Errors lead with what to do, not what failed
- [ ] Labels are sentence case unless they're inherently a kbd / system label
- [ ] Voice matches `BRAND.md`

### Space

- [ ] Generous padding (when in doubt, more)
- [ ] Rhythm-based grouping (no hairline between every item)
- [ ] Soft divider (`<SoftDivider />`) under a panel header if used
- [ ] No box-in-box

### Accessibility

- [ ] WCAG AA contrast for text + interactive elements (verify in both
      light and dark themes)
- [ ] Every icon-only button has `aria-label`
- [ ] Tooltips have `role="tooltip"`
- [ ] Focusable elements have a visible focus state (handled globally by
      `*:focus-visible`)
- [ ] `prefers-reduced-motion` respected

---

## When you don't know what to do

Refer to these references, in order:

1. **`/lab`** — the in-app design playground at `apps/web/app/lab/`. Every
   pattern in the production app is reflected there with light and dark
   variants. If you're building a button, look at the lab's buttons. If
   you're building a settings modal, look at the lab's settings modal.
2. **The corresponding feature directory** in `packages/app/src/features/`.
   The contacts module, the chat module, the auth module — each has its
   own patterns. Mirror them.
3. **`DESIGN.md`** — for exact token values, named rules, and the visual
   spec.
4. **`BRAND.md`** — for voice and copy.
5. **`PRODUCT.md`** — for what success looks like.
6. **Linear, Notion, Cron, Raycast, Stripe Dashboard** — when in doubt
   about a pattern, look at how those products do it. Don't copy; absorb.

If your component matches none of those, you're probably solving a problem
the system hasn't seen yet. Pause. Think about whether it's an instance of
a pattern that already exists, or genuinely new. New patterns are rare and
should be deliberate.

---

## The taste test

A component ships when, on cold review the next day:

- A Linear user wouldn't flinch at it.
- A Notion user would recognize the considered restraint.
- An Apple HIG reviewer wouldn't immediately mark a state as missing.
- The component disappears into the task; the user doesn't notice it.

If any of those fails, it ships when they all pass. Beauty is leverage.
Taste compounds. Don't ship the first version when the second is half a
day away.
