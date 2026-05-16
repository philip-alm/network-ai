# Reknowable — motion language

This file defines the motion vocabulary the app speaks. The system is small on purpose: two curves and five durations cover ~90% of the surface. Anything outside this needs a written justification in the relevant module's `CLAUDE.md`.

Tokens live in `apps/web/app/globals.css` under the `MOTION DESIGN TOKENS` block. Reference them by name. Magic numbers in components are an anti-pattern — they make the language drift.

---

## The two curves

| Token           | Bezier                           | Use                                                                                                                                                                               |
| --------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ease-snappy` | `cubic-bezier(0.23, 1, 0.32, 1)` | The signature. Entries, hovers, button presses, list cascades, dropdowns, all per-item interactions. Strong ease-out — items arrive fast and settle.                              |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | iOS sheet curve. Reserved for **modals, sheets, and drawer slides only**. Slightly more dramatic than `--ease-snappy`; appropriate when an entire surface is arriving or leaving. |

`--ease-out` is a legacy alias of `--ease-snappy` so older call sites keep working. New code references `--ease-snappy` directly.

---

## The five durations

| Token           | Time       | Use                                                                                                                                   |
| --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `--dur-instant` | **120 ms** | Hover color shifts, focus-visible glows, kbd hint reveals. Subliminal — should feel "free."                                           |
| `--dur-snap`    | **180 ms** | Button press feedback, small reveals, popover dropdowns, chevron rotates. Reads as "interactive."                                     |
| `--dur-settle`  | **220 ms** | Per-item cascade fade, height-animated expansions, panel entries. The default for most arrivals.                                      |
| `--dur-arrive`  | **320 ms** | Modal scale-in, drawer slide, large surface arrivals. Felt as composed.                                                               |
| `--dur-moment`  | **400 ms** | The rare theater beat: count-up animations, first-contact delight, signature reveals. Should appear at most a few times in a session. |

Total time for a cascade of 8 items at `--dur-settle` + `--stagger-relaxed` is `7 × 40 + 220 = 500 ms`. That's the upper bound. Past it, the eye starts to feel kept waiting.

---

## Stagger intervals

| Token               | Time      | Use                                                                                                                                                         |
| ------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--stagger-tight`   | **25 ms** | When we DO animate content rows (rare — see "Restraint" below). Stagger is barely perceptible; the cascade reads as one wave.                               |
| `--stagger-relaxed` | **40 ms** | Hero copy and chrome elements (chat empty state title → body → starter prompts, conversation list, etc.). Each item visibly settles before the next begins. |

### Uniform stagger for long lists

`useCascadeIn` uses a **single uniform stagger of 14 ms** between items. Earlier versions used a two-tier (slow head + fast tail) approach to make the first few items feel deliberate — but the pacing change halfway down the list reads as a visible kink. Uniform is what users expect: same speed for the top items as the bottom.

Hard-cap the cumulative delay at **500 ms** so huge lists don't drag — past the cap, items pile. 500/14 ≈ 35 items stagger linearly before the cap bites, and most viewports show fewer than that at once.

| Visible items | Cascade time    | + fade | Total  |
| ------------- | --------------- | ------ | ------ |
| 8             | 98 ms           | 220 ms | 318 ms |
| 20            | 266 ms          | 220 ms | 486 ms |
| 35            | 476 ms          | 220 ms | 696 ms |
| 50            | 500 ms (capped) | 220 ms | 720 ms |

The numbers live in `useCascadeIn.ts` as `STAGGER_MS / STAGGER_HARD_CAP_MS`. Change them there and the entire system follows.

---

## Restraint — animate the chrome, not the content

The single most important principle, drawn from Linear / Stripe / Raycast:

> **Animate the container's arrival. Snap the rows inside it.**

When the contacts pane first paints, the _pane itself_ fades in. The rows inside snap. When the user filters or sorts, the new set of rows snaps; nothing cascades. The cascade is reserved for **first paint** and **theater moments**, not for every state change.

This is what makes calm + competent apps feel different from playful + bouncy apps. Stripe doesn't dance its table rows. Linear doesn't either. We don't either.

Concretely:

- **Cascade fires once per item per session** (`useCascadeIn` is one-shot via a module-level seen-set). Subsequent renders of the same row render with identity styles — zero motion overhead.
- **Filtering / sorting / pinning** never re-cascades. The user's intent is structural; the response should be instant.
- **Realtime updates** never cascade — only a 1.2 s `--ease-snappy` accent tint on the affected row signals "this just changed."

---

## Transform vocabulary

Only three transforms compose into entries. Anything else is bespoke and needs justification.

- **opacity** `0 → 1` — always present.
- **translateY** — `4 px` for surfaces, `6 px` for content items. Never larger. Larger reads as "slide" rather than "settle."
- **scale** — `0.985 → 1` for items, `0.99 → 1` for surfaces. The scale is what gives Reknowable its signature "snap to magnet" feel — combined with `--ease-snappy`, items pop into place without crossing into bouncy.

Never animate layout properties: width, height (except as the inner content of a max-height transition), margin, padding, top/left/right/bottom. They trigger layout per frame and read as janky.

`will-change: opacity, transform` is set during the animation and removed after (see `useCascadeIn` / `useEnterOnce`).

---

## Prefers-reduced-motion

Both `useCascadeIn` and `useEnterOnce` short-circuit to identity styles when `(prefers-reduced-motion: reduce)` is true. No animation, no delay. The page composes itself in a single frame.

This must be honored by every new motion primitive. No exceptions.

---

## The three motion primitives

| Primitive                          | Where                               | Use                                                                                                                      |
| ---------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `useCascadeIn(id, index)`          | `features/contacts/useCascadeIn.ts` | One-shot per-item cascade. Pass an index for the stagger. Survives virtualization remounts via a module-level seen-set.  |
| `useEnterOnce(key)`                | `features/ui/useEnterOnce.ts`       | One-shot per-surface fade. Used at the container level for empty states + panes.                                         |
| Per-call `transition` inline-style | Anywhere                            | Hover / focus / press / size transitions. Always references `var(--ease-snappy)` + a duration token. Never hardcoded ms. |

Future primitives go in this table only if they pass the bar: there's a clear category that the existing three don't cover, and at least three real call sites need it.

---

## Theater moments

These are the deliberate exceptions. They get to be larger, slower, more expressive. Each should appear at most a handful of times in a session.

- **CountUp** on the network total (`--dur-moment`, ease-out-quart) — the "you have 247 contacts" reveal.
- **FirstEntryCaption** on adding the first contact — `bg-accent-soft` flash with brand copy.
- **ProgressRing** in the panel header during refresh — slow rotate + dash-offset sweep, signals "the app is alive."
- **Realtime tint** on row update — 1.2 s accent hairline fade. Subliminal "this is live data."

If you're tempted to add a fourth, the answer is almost certainly no. Theater requires absence to land.

---

## When in doubt

1. Reach for `--ease-snappy` and `--dur-snap` — they're correct ~70% of the time.
2. Animate the container's arrival, snap the rows.
3. If you can't decide between a curve and a spring, choose the curve. The signature comes from consistency, not novelty.
4. If you can't decide whether to animate at all, choose not to. The best motion designs use restraint to make the moments that _do_ move feel intentional.
