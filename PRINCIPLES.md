# Reknowable — operating principles

This file is the source of truth for how Reknowable's data model, agent, and UI relate. Read it before adding any schema, table, column, or tool parameter. Every choice below has been argued through; deviations need explicit justification.

These principles are also encoded into the agent's system prompt so the agent itself honors them.

---

## 1. Reknowable is a free-form notebook an LLM can navigate

It is **not** a CRM with extra fields. It is **not** Notion with property databases. The product the user is buying is "throw anything you know about your network and your capabilities at this thing, and it becomes askable in plain language." Every architectural choice supports that promise.

Tools that ask the user to fill out forms or pick a category from a dropdown are anti-Reknowable. The default capture mode is loose prose; structure emerges from the agent reading + writing on top.

## 2. Two entity types is the floor — never add a third

The schema has exactly two row types: **contacts** (people) and **assets** (everything else). This is deliberate.

The temptation to add `organizations`, `documents`, `programs`, `credits`, `licenses`, `venues`, `agreements`, `events`, `opportunities` is constant. Resist it. Every one of those is an **asset with the right tags** in the existing model:

| Real-world thing         | Lives as                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Nordea Startup & Growth  | asset · tags: `org, banking, partner` · contact_id → my contact there                                            |
| NVIDIA Inception credits | asset · tags: `credits, ai, program` · availability: "expires Jan 2026 — $100k compute"                          |
| Adway podcast studio     | asset · tags: `venue, podcast, stockholm` · availability: "free with 48h notice" · contact_id → contact at Adway |
| Signed agreement PDF     | asset · tags: `document, agreement` · description: "https://docs.google.com/… — signed 2024-08"                  |
| Mom's couch in SF        | asset · tags: `stay, sf, family` · contact_id → Mom · availability: "anytime"                                    |
| Notion seat              | asset · tags: `license, saas` · availability: "5 unused seats, renews 2026-04"                                   |
| Video editor on retainer | contact · tags: `editor, freelance` · notes: "$80/hr, 48h turnaround"                                            |

Adding a table for any of these would constrain the "throw anything at it" promise. Tags handle the category; notes handle the detail; FTS + semantic search handles the recall.

## 3. Structure is for the UI; prose is for the AI

The agent works on prose. It reads `notes`, `description`, `availability` and synthesizes structured views from text on demand. It does not need columns to reason.

The UI needs columns to be fast. Pagination needs `COUNT(*) OVER ()`. Sort-by-warmth needs an indexed column. Realtime tints need stable `id` + `updated_at`. Filter chips need an indexed tag array.

The columns we have are the **minimal floor** for the UI to feel instant:

```
id, name, warmth?, city?, tags[], notes, created_at, updated_at, deleted_at?
```

…plus `description`, `availability`, `contact_id?` on assets. That's it. Anything beyond it is over-structure that doesn't help the UI and constrains the AI.

**Specifically banned future additions** (without strong proof of need):

- ❌ `kind` enum on assets — tags do this dynamically
- ❌ `organizations` table — orgs are assets with `tags: ['org']`
- ❌ `documents` table — docs are assets with `tags: ['document']` + URL in description
- ❌ `expires_at` column — prose date in `availability`, parsed by the agent when needed
- ❌ `cost` column — prose in `description` or `notes`
- ❌ `category` / `type` columns of any kind — tags

The principle: **if the AI can read it from prose, the schema doesn't need it.** If the UI needs it (sort/filter/paginate), it earns a column.

## 4. Tags are dynamic categorization. The agent invents them.

There is no fixed tag taxonomy. The agent reads a contact / asset and picks the tags that fit. New "kinds" emerge naturally as the user adds new kinds of things. Filter chips, count badges, and search rank against tags via the GIN array index — fast at any scale.

When unsure whether a piece of information should be a column or a tag: it's a tag.

## 5. Capture > schema

The single biggest leverage point for Reknowable's value is **how much you can dump into it with how little friction**. Schema growth doesn't help if the on-ramp is "create one contact at a time."

The capture priority order:

1. **Paste anything** — text, CSV, vCard, LinkedIn URL, calendar invite, email thread, markdown blob. Agent extracts contacts + assets + relationships, user confirms.
2. **Forwarding email address** — `philip+ingest@reknowable.app`. Any email forwarded becomes capture input.
3. **Screenshot OCR** — drag a LinkedIn DM, agent reads and proposes a contact + the conversation as notes.
4. **Voice memo on mobile** — "I met Jonas at Klarna, hardware, follow up about the podcast" → transcribed + structured.

Capture compounds value 10x per added input channel. Schema additions don't.

## 6. Warmth derives from real signals (when we get there)

The product pitch promises: _"Warmth scores update from real interaction patterns rather than the last time you remembered to log something."_

The defensible long-term moat is connecting Gmail + Calendar (read-only OAuth) and deriving warmth from interaction frequency + recency. Decays without contact. The user never thinks about the number again.

Until that ships, warmth is user-set or agent-set. The schema is already correct for this (a single `warmth smallint` column on contacts).

## 7. One AI, three surfaces, one backend

Search appears in three places the user touches:

- **Top-bar ⌘K palette** — quick keyboard-driven jump
- **Panel-header "Filter the list"** — narrows the right pane in place
- **Chat** — AI reasons over results, pins, filters

All three should return **the same answer for the same query**. Different muscle memory, same engine. The engine is `find_anything` (FTS + semantic + trigram). Consistency means users don't lose trust by getting different counts in different places.

## 8. Reknowable is a portfolio, not an address book

The framing across the product is **portfolio semantics**: every entity has a _position_ (warmth), an _access cost_ (how easy to call on), a _time horizon_ (until expiry / decay), and _yield_ (value when used).

This frame works for people, credits, venues, agreements, favors, licenses, advisors. Most personal CRMs are "address books with notes." Reknowable as "your network and capabilities as a portfolio you can rebalance and call on" is a category, not a feature list.

The agent should speak this language: "warmest connection," "expiring soon," "available now," "needs an intro," "you owe a follow-up." Avoid CRM jargon ("lead," "prospect," "deal stage") — those imply a sales pipeline, which Reknowable is not.

## 9. Recall is table stakes. Opportunity surfacing — strictly inside the asked question — is the product.

The single most important principle for what the agent should _become_.

**Recall mode** (what we do today): user asks → agent searches → agent returns matches. Reactive. Useful. Not defensible — a Notion database with a good search would cover most of this.

**Opportunity-surfacing mode** (what we are growing into): for the _same query_, the agent doesn't stop at "here are the matches" — it reads the matches as a portfolio slice and surfaces the **moves the user could make with the things they just asked about**. The answer becomes "here's what you have AND what you could do with it."

The discipline (read this twice):

- The opportunity must be **directly relevant to the literal query**. If the user asked about Stockholm contacts, the opportunity is about those Stockholm contacts — what to do with them, who pairs with whom, which one fits the implicit goal of the question.
- **No adjacent watching.** Don't flag NVIDIA credit expiry when the question was about Stockholm. Don't mention a stale agreement when the question was about podcast venues. Adjacency is noise.
- **No risk surfacing.** Decay warnings, "you owe Adam a reply," "this agreement renews next month" — these are _future events_ and _risks_, not opportunities. Out of scope for this principle. (They may earn their own surface later as a separate digest mode, but they are NOT what the agent volunteers in a normal query response.)
- **No prophecy.** Don't speculate about what's "going to happen." Stay in what is true _now_ about the rows that matched the query.

What an opportunity-shaped answer looks like:

| Query                            | Recall-only answer                                  | Opportunity-shaped answer                                                                                                                               |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Who do I know in Stockholm?"    | Lists 12 names.                                     | Lists 12, then: "Bo and Jonas both work in fintech and are your warmest in this group — if you wanted a fintech intro, that's the strongest path here." |
| "What podcast assets do I have?" | Lists studio + mic kit + 2 contacts tagged podcast. | Same list, then: "Adway studio is free with 48h notice and Lina hosts a show in your space — pairing those is the fastest way to record this month."    |
| "Find investors I know."         | Lists 8 contacts tagged investor.                   | Same list, then: "Three of them (Per, Anders, Maja) have made hardware bets in the last year — strongest fit if you're raising for a hardware play."    |

The opportunity is **a synthesis on top of the answer**, not a tangent away from it. It uses only the rows the query returned (or one extra `find` to enrich within the same topic). It tells the user what they could _do_ with those rows.

What this implies for behavior:

- **Every recall is also a synthesis.** Answer the question, then add the one line that says "and here's what that means for what you might do." If there's no honest opportunity-shaped read, say nothing extra — silence beats forced insight.
- **Opportunities surface in the same channel as the answer.** Inline in chat, with mention links to the named entities and a `set_panel` call that pins the relevant subset so the user can act in one click.
- **No agent-initiated digests in this principle.** Daily summaries, decay reports, expiry alarms — those may exist eventually as their own opt-in mode, but they are NOT what the agent does in a query response. This principle is about making each answer better, not adding ambient watching.

The pitch evolves from _"throw anything at it and it becomes askable"_ to _"throw anything at it and you'll see what you could do with it, every time you ask."_

The recall-only product is a feature. The "answer + the move" product is a moat.

---

## Decisions this implies

- **No new tables or columns** without a UI need that prose can't serve.
- **No structured forms** in the UI for capture — the chat / paste box IS the form.
- **No category dropdowns** — tags are the taxonomy, agent-invented.
- **No "set this field for this kind" prompts** to the user — the agent infers.
- **Capture surfaces are the next investment**, not schema.
- **Warmth-from-signals is the long-term moat**, when the data + users justify the OAuth investment.
- **Search lives in one engine** (`find_anything`); every surface reads from it.
- **The agent's job is to answer + the move.** For every query, answer it, then say what the answer means for what the user could do — strictly within the scope of what they asked. No adjacent risks, no future-event prophecy, no off-topic surfacing.

When in doubt: tags + prose, not columns + dropdowns. And: every answer ends with the implication for action — when there's an honest one. Silence beats forced insight.

---

## What's NOT in this document

- Visual design — see DESIGN.md
- Motion language — see MOTION.md
- Brand voice — see BRAND.md
- Strategic positioning + user personas — see PRODUCT.md

This file covers the **shape of the system** — schema philosophy, data flow between AI and UI, what we deliberately don't build. It is the document a new engineer (or a new instance of Claude) should read first when tempted to add structure.
