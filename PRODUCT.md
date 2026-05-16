# Product

## Register

product

## Users

A CEO, founder, or operating leader at a small-to-mid company who runs on
relationships and capacity. They use Reknowable in two distinct moments:

- **The strike.** In a meeting or right after a conversation, they need to
  surface the right person or asset for an opportunity that just came up.
  Fast, present-tense, no patience for ceremony. _"Oh, I know who you
  should talk to. We have a podcast studio in Göteborg. There's an
  investor in this space."_
- **The deposit.** In a quiet moment, they capture a new contact or asset
  they've just acquired or learned about. Considered, occasional.

Single-user today. Designed for shared organizational memory tomorrow
(team-of-N future where a company's collective network is queryable by
anyone with access).

## Product Purpose

Reknowable is a **second brain for everyone in a network and everything
they can offer.** It solves a memory problem: as a leader's network grows
past what fits in working memory, the moments where _"I know exactly who
you should talk to"_ stop happening on their own. Reknowable makes those
moments reliable, on demand, on any task or opportunity.

The product is not:

- a CRM (CRMs serve sales pipelines)
- a journal (journals serve reflection)
- a contacts app (contacts apps serve dialing)

It is **operator-grade recall infrastructure** for the people and
capabilities the user already has.

**What success looks like.** A founder signs in late evening, types
_"who can help us record a podcast in Stockholm next week?"_ and:

- The chat scrolls; the composer never grows the page.
- The agent narrates briefly, calls the search tool once with a rich
  query bundle, and confirms with a structured card: _"Found [Anna
  Svensson], warmth 1, Göteborg. She has [Podcast Studio] available."_
- A Brand Amber tint pulses on the contact row as it appears on the
  right; the mention pill in chat ([Anna Svensson](contact:…)) jumps and
  highlights it for ~1.2s on click.
- The founder dashes off a quick _"Thanks, message Anna"_ to themselves
  via notes; the field autosaves on blur with no spinner.
- Deleting a stale contact replaces the row with an Undo banner that
  auto-dismisses after 5s; the row gracefully animates out.

When that flow happens at the moment a thought arrives, in under five
seconds, Reknowable is doing its job.

## Brand Personality

**Three words**: _considered, present, precise._

- **Considered**: every line of typography earns its place; nothing
  decorative; the wordmark is sacred; Brand Amber is reserved.
- **Present**: when the user needs the answer, the answer is there.
  Optimistic updates, sub-100ms perceived latency, no spinners where a
  skeleton or instant-state will do.
- **Precise**: the agent quotes names back; the warmth is shown; the
  asset's availability is the asset's availability. Never paraphrased,
  never embellished.

The emotional goal is the feeling of having an extension of your
working memory that is already aware of what you know, ready before you
ask, never showing off.

## Anti-references

Never ship any of these:

- **AI slop in any form**: purple-to-blue gradients, glassmorphism, neon
  on dark, sparkle decorations, "AI-generated" patina, "What can I help
  you with today?" chatbot energy.
- **The SaaS-AI dashboard reflex.** Reknowable's surface is deep navy,
  but it is rescued from cliché by warm cream ink, brand amber accent
  (the logo color), and a refusal of glassmorphism, neon edges, or
  the dashboard-metrics template. If it could be mistaken for any
  observability tool, it has failed.
- **Card grids of equal-sized rounded rectangles.** Hierarchy through
  weight, color, and rhythm.
- **Cards nested in cards.** Always wrong.
- **Modal as first thought.** Anything that fits inline goes inline.
- **Bouncy / elastic / spring-overshoot easings.** Ease-out only.
- **Generic icon-above-heading templated layouts.** Reads as SaaS
  template.
- **Drop-shadow + gradient-background hero cards.**
- **Animated layout properties** (height, width, padding). Transform +
  opacity only.
- **Bright primary buttons for every action.** Hierarchy comes from type
  weight and color contrast, not button color.
- **Chatbot tells**: "Sure!", "Absolutely!", "I'd be happy to.", "Is
  there anything else I can help you with?". The agent doesn't perform.

Reference points the design _is_ aiming at: Linear's app shell
(operator-grade calm without screaming), Cron / Notion Calendar (warm
undertones inside the dark, never cold blue), Field Notes (cream-and-ink
contrast carried into the warmth of the working surface).

## Design Principles

1. **Type carries the design.** Hierarchy, mood, and personality come
   from the type scale and weight contrast. Reach for a different weight
   before reaching for decoration.
2. **One pane never pushes the other.** Above `lg`, the viewport is a
   55/45 split; both panes own their own scroll; the page is
   fixed-height. Below `lg`, the panes stack with a tab toggle.
3. **Optimistic by default.** When the agent does something, the right
   pane reflects it before the server confirms. Rollback on failure.
4. **Every AI action is reviewable and revertable.** Tool calls render
   as structured cards in the chat that describe what the agent did to
   the right pane in plain language (`Filtered the pane to X — 323 matches`,
   `Pinned Naomi + August`, `Switched to Assets view`), with mention
   pills (`[Anna Svensson](contact:…)`) that scroll + highlight the row
   on click, and for destructive calls an Undo affordance. The pane is
   the answer; chat is the receipt.
5. **The recall moment is earned.** Brand Amber lights up specifically
   when the system says "this is what you were looking for" — focus,
   cursor, AI confirmation, the wordmark mark, signature first-entry.
   Decorative use breaks the rule.

## Related strategic documents

- **[PRINCIPLES.md](./PRINCIPLES.md)** is the shape of the system: schema
  philosophy (two entity types only, tags as taxonomy), the
  `answer + the move` framing for the agent, what the product
  deliberately won't build. Read before adding any table, column, or
  agent tool parameter.
- **[DESIGN.md](./DESIGN.md)** is the visual system: Operator's Study
  palette, type scale, elevation, motion vocabulary, component recipes.
- **[BRAND.md](./BRAND.md)** is the voice: how the agent talks, how
  confirmations are phrased, error message patterns, copy do's and don'ts.
- **[MOTION.md](./MOTION.md)** is the motion language: tokens, easings,
  cascade timing, transform-and-opacity-only rule.

## Accessibility & Inclusion

- **WCAG 2.2 AA** contrast on text and interactive surfaces. The Operator's
  Study dark palette is calibrated for warm-cream-on-navy to meet AA at
  body size; verify any time tokens shift.
- Every interactive element has a visible focus ring (2px Brand Amber).
- `prefers-reduced-motion: reduce` disables every non-essential
  animation; state changes become instant.
- **Keyboard**: `/` focuses the composer; `Esc` closes any open inline
  editor; Tab order follows reading order.
- Composer textarea is labelled. Tool-call cards have ARIA live regions
  so screen readers announce _"added Anna Svensson"_, _"deleted Bo
  Larsson"_, etc.
- The wordmark `<Wordmark/>` component carries `aria-label="Reknowable"`
  so the lowercase mark is read as the proper noun.
