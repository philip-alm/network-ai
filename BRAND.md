# Brand Voice

The voice spec for Reknowable. Read this before writing any UI copy,
agent prompts, error messages, or button labels. PRODUCT.md anchors _who
and why_; DESIGN.md anchors _how it looks_; this file anchors _how it
speaks_.

## The voice in one line

The user's working memory, extended. Already aware of what they know.
Calls people and assets by their actual names, in the present tense,
without ceremony. Never markets. Never performs.

## Voice principles

These are citable rules. If you can't trace a copy choice to one of these,
you're guessing.

### 1. Every word earns its place

If a word can be removed without changing meaning, remove it. _"Successfully
added"_ is _"Added."_ _"We're searching for…"_ is _"Searching."_ _"Please
enter your email"_ is _"Email."_ Word count is a tax on the user's
attention; pay it only when it buys clarity.

### 2. Lead with the noun or verb, not the framing

_"Anna Svensson"_ not _"Contact name: Anna Svensson."_ _"Save"_ not _"Click
to save."_ The user already knows the framing from the surface they're
looking at. Restating it is noise.

### 3. Present tense, second person, active voice

The interface talks _now_, to _you_, doing things. _"Updating notes."_ not
_"Notes will be updated."_ _"You haven't added anyone yet."_ not _"No
contacts have been added by the user."_ The agent and the system both use
this voice; it never shifts.

### 4. Specific over generic

_"Contact"_ not _"item."_ _"Anna's notes"_ not _"this field."_ _"warmth 2"_
not _"warmth level."_ If a domain word exists, use it. Generic words
("data," "entity," "record," "object") leak engineering into the surface.

### 5. The agent is calm, never breathless

The agent never says _"Great!"_, _"Sure!"_, _"Absolutely!"_, _"I'd be
happy to."_ These are SaaS chatbot tells. It also never asks _"Is there
anything else I can help you with?"_ — the composer is right there. It
acknowledges what was done and stops.

### 6. Errors lead with what to do, not what failed

_"Couldn't reach the server. Try again in a moment."_ not _"Error:
network request failed (ETIMEDOUT)."_ The user wants to know what to do
next, not what broke. If recovery requires no action, say so: _"Saved
offline. Will sync when you're back online."_

### 7. Mono only on technical strings

Geist Mono is for IDs, timings, counts, durations, kbd content, file
paths. If a piece of copy could be read aloud as words, it is not Mono.
_"saved · 220ms ago"_ — the timing is Mono, the word "saved" is not.

### 8. No em dashes. No exclamation marks. No emoji.

Commas, colons, semicolons, periods, parentheses. _Period._ Exclamation
marks scream; the brand doesn't scream. Emoji are decoration; the brand
doesn't decorate.

## Vocabulary

### Use

- **Contact** (the person)
- **Asset** (something the person, or you, can offer)
- **Warmth** (the 1–5 closeness rating)
- **Note** / **Notes** (the free-form text)
- **Add**, **Update**, **Delete**, **Restore** (CRUD verbs)
- **Find** (the search/lookup tool)
- **Reknowable** (the product itself, when named in prose; the proper noun is title-case)
- **The notebook** (an in-product metaphor for the durable record on the right pane)
- **Recall**, **recall on demand** (the active retrieval framing)

### Avoid

- _Data, record, entity, object, item, resource_ — too generic
- _Contact card, profile, entry, listing_ — pick one (we use _contact_)
- _Hello!_, _Hi there!_, _Welcome!_ — chatbot tells
- _Sorry_, _Unfortunately_, _Oops_ — performative apology
- _Please_, _Kindly_ — false politeness for required actions
- _Click here_, _Tap here_ — never name the gesture
- _Loading…_, _Please wait…_ — the dots already say loading
- _Successfully_ / _Successful_ — every "success" is implicit
- _Are you sure?_ — if undoable, no confirmation; if destructive, single Undo banner

## Copy patterns

### Confirmation cards (after the agent does something)

Pattern: `<verb-past> <noun>[, <salient-detail>]`

- _Added Anna Svensson · warmth 1, Göteborg._
- _Updated Anna's notes._
- _Deleted Bo Larsson._
- _Added 2 assets to Anna._

Avoid: _"Successfully added a new contact named Anna Svensson"_ (every
word over the noun is tax). Avoid attributing agency: _"I added Anna"_ —
the system did it because the user asked. The verb stands alone.

### Tool-result phrases (the small pills in the chat)

Pattern: `<verb-past> · <count> <noun>[ · <timing>]`

- _Searched · 3 contacts · 84ms_
- _Queried · 12 rows_
- _Found · 1 contact, 2 assets · 'podcast', 'audio'_

Running state: same verb, present participle:

- _Searching 'Stockholm'…_
- _Reading…_
- _Writing new contact…_

### Error messages

Pattern: `<short consequence>. <what to do>.`

- _Couldn't save. Try again in a moment._ (network)
- _That email is already in use. Sign in instead?_ (auth)
- _Password needs at least 8 characters._ (validation, no action verb because the user is already in the field)
- _Lost connection. Will retry automatically._ (offline)

Avoid: error codes (move them to dev-only debug), stack-trace fragments,
the word "error" itself ("Couldn't" is clearer than "An error occurred").

### Loading / progress copy

The agent's phase pill uses bare gerunds, lowercase, no punctuation:

- _thinking_
- _running tools_
- _composing_
- _retrying_

The pill is paired with the pulse animation; the word is enough.

Never _"Loading…"_, _"Please wait…"_, _"Working on it…"_. The interface
shows it's working.

### Empty states

Pattern: a small subject heading + one sentence of what-to-do, never a tutorial.

- _A blank page. Drop a note about someone in the chat. They'll appear here, with their warmth and what they can offer._
- _No notes yet. Click to add._

Notice: the heading sets the tone (notebook metaphor), the sentence
points to the action, and there is no third line. Empty states are not
sales copy; they are quiet doorways.

### Success states (post-action confirmations)

When the system has done something and the moment deserves acknowledgment
(rare), use a single short line, no exclamation, no emoji:

- _Saved._
- _Check your email for the link._
- _Deleted Anna · Undo_

The Undo affordance is part of the line, not a separate sentence.

### Button labels

Verb-first, sentence-case, no period.

- _Sign in_, _Create account_, _Save_, _Delete_, _Cancel_, _Undo_, _Edit notes_
- Never _Submit_ (use the specific verb), never _OK_ (use the specific
  outcome), never _Click here_.

For two-action rows (Confirm / Cancel), the destructive action carries
its own verb (_Delete_, not _Confirm_). Cancel is always _Cancel_.

### Form labels

Mono, uppercase, narrow (`text-[10px] font-mono uppercase tracking-wider
text-faint`). The label is a _tag_, not a sentence. _EMAIL_, _PASSWORD_,
_CONFIRM PASSWORD_, _WARMTH_, _NOTES_.

This treatment is a deliberate departure from sentence-case so labels
read as system structure, not as prose.

### Time + duration

- _saved · 220ms ago_ (Mono for the time component)
- _added · just now_ / _added · 2m ago_ / _added · yesterday_ / _added · Mar 5_
- Never _"a few seconds ago"_ (be exact) or _"in the past"_ (be exact)

### Placeholders

A placeholder hints what to type; it never duplicates the label. _EMAIL_
label + `you@example.com` placeholder. Never _EMAIL_ label + "Enter email"
placeholder.

For free-form fields (notes, composer), use a soft prompt:

- _Free-form notes about this contact._
- _Tell me about someone, or ask anything._

### Keyboard hints

Mono, lowercase verbs:

- `/` _to focus_
- `⌘ ↵` _to send_
- `Esc` _to close_

Always the key in a `<kbd>` element with `font-mono` + `bg-surface-soft`,
followed by the lowercase verb.

## The agent's system prompt

The agent is the loudest voice in the product. It reads its system
prompt every turn. Spec for the persona:

> You are Reknowable's agent: the user's extended working memory for
> their network and what each person can offer. Contacts, warmth, city,
> tags, notes, assets. You help them recall on demand, exactly when
> they ask.
>
> Voice: present tense, second person, calm, operator-grade. Never say
> "Great!", "Sure!", "I'd be happy to." Never apologize for the system.
> Never ask "Is there anything else?". The user has the composer.
>
> When you finish a task, name what you did in past tense, one short line:
> _"Added Anna Svensson, warmth 1, Göteborg."_ Don't restate the user's
> request. Don't summarize what you're about to do; just do it.
>
> When you query and find nothing, say so without apology:
> _"No matches for 'Stockholm'."_
>
> When you need clarification, ask in one sentence with no preamble:
> _"Which Anna? You have two: Svensson and Lindqvist."_
>
> You are not a chatbot. You are recall.

(Wire this into the actual system prompt file — see sweep task. Adapt
phrasing to match the existing tool/format scaffolding.)

## Where the voice carries the brand hardest

In rough order of impact on perception:

1. The agent's running prose (most words the user sees)
2. The confirmation cards (the moment the user trusts the system)
3. The empty states (the first sentence on a blank pane)
4. The error messages (the moment of trouble)
5. The button labels (the verb that ships the action)
6. The auth flow (the first impression)

If you only have time to fix one layer, fix the agent's prose. It is more
of the brand than any visual choice.
