# Reknowable — Keyboard Shortcut Registry

**Single source of truth for every keybinding in the app.** Before adding,
moving, or removing a shortcut, update this file in the same diff.

## §1. Rules (NON-NEGOTIABLE)

1. **No advertised lies.** If a tooltip or cheatsheet entry shows a
   shortcut, a real keydown handler must fire for it. The old `⌘\\` for
   sidebar was a tooltip-only ghost — it never worked. Don't ship that
   shape again.
2. **Single source per shortcut.** Each combo lives in exactly one
   handler. Don't bind the same combo in two surfaces.
3. **Document where it's hinted.** Every wired shortcut goes in this
   file's table below AND in `KeyboardCheatsheet.tsx` SECTIONS unless
   the binding is genuinely surface-local (e.g. ↑/↓ inside the command
   palette result list).
4. **Render through the canonical `Kbd` primitive.** Never hand-roll a
   `<kbd>` pill. The visual rules (2-key = two caps with gap, 3+-key =
   one combined capsule, lucide icons for ⌘ ↵ ↑↓←→) only stay
   consistent if every surface flows through `features/ui/Kbd.tsx`.
5. **Always test the in-field case.** Modifier-less shortcuts (`/`,
   `?`, single letters) MUST skip when focus is in an `INPUT`,
   `TEXTAREA`, or `contenteditable`. Modifier shortcuts (⌘X, ⌘⇧X) may
   fire from anywhere unless they shadow a useful in-field keystroke
   (e.g. ⌘B = bold inside text, so skip in fields).
6. **`preventDefault` on every claimed combo.** If we own it, we own it
   — don't let the browser also act on it.

## §2. Picking a new shortcut

Stay away from browser-claimed combos on Mac:

- **⌘C / V / X / A / Z / S / P / F / G / H / Q / W / N / T / R / L / D / B / Y / J / E / O / M / +/- / 0–9**
  — these are all browser-bound on Mac and can't be cleanly intercepted
  in the general case.
- Modifier-less letters MUST skip when in-field (a contact name in a
  notes field includes letters).

Safe patterns:

- **`⌘⇧<letter>`** — almost always safe; matches macOS app convention.
- **`⌘<punct>`** — `⌘,` (settings), `⌘/` (search/comment), `⌘.`
  (cancel) — well-known macOS conventions.
- **`⌘B`** — claimable outside text fields (Bold inside is the browser
  default; we skip there).
- **single letter** — claimable when out-of-field; cheap and Linear-y.

When in doubt: use ⌘⇧<letter>.

## §3. Registry

Every shortcut wired in the app. Update this table when changing
anything keyboard-bound.

| Combo             | Action                       | Wired in (handler)                      | Hint surfaces (where the keycap appears)               | Cheatsheet section |
| ----------------- | ---------------------------- | --------------------------------------- | ------------------------------------------------------ | ------------------ |
| `⌘K`              | Open command palette         | `palette/useGlobalShortcuts.ts`         | top-bar search trigger; tooltip on mobile search icon  | Anywhere           |
| `⌘⇧O`             | New conversation             | `home/HomeScreen.tsx`                   | sidebar "+ New chat" row                               | Anywhere           |
| `⌘B`              | Toggle sidebar               | `home/HomeScreen.tsx`                   | tooltip on sidebar-toggle header button                | Anywhere           |
| `⌘,`              | Open settings                | `home/HomeScreen.tsx`                   | tooltip on Settings gear; SettingsModal ActionRow      | Anywhere           |
| `⌘Z`              | Undo a contact delete (≤5s)  | `contacts/ContactsAccordion.tsx`        | inline kbd on the dark Undo toast                      | Anywhere           |
| `?`               | Open keyboard cheatsheet     | `palette/useGlobalShortcuts.ts`         | tooltip on cheatsheet header button; SettingsModal row | Anywhere           |
| `⌘/`              | Open cheatsheet (backup)     | `palette/useGlobalShortcuts.ts`         | not advertised (power-user backup for `?`)             | —                  |
| `Esc`             | Close any open panel/modal   | per-surface (palette, modal, dropdowns) | trailing slot in command palette input; cheatsheet bar | Anywhere           |
| `/`               | Focus chat composer          | `chat/ChatComposer.tsx`                 | not advertised inline; cheatsheet only                 | Chat               |
| `Enter`           | Send chat message            | `chat/ChatComposer.tsx`                 | tooltip on send button                                 | Chat               |
| `⇧Enter`          | Newline in composer          | browser default (composer textarea)     | cheatsheet only                                        | Chat               |
| `↑` (composer)    | Recall latest queued message | `chat/ChatComposer.tsx`                 | cheatsheet only                                        | Chat               |
| `↓` (composer)    | Re-queue current draft       | `chat/ChatComposer.tsx`                 | cheatsheet only                                        | Chat               |
| `↑ / ↓` (palette) | Navigate results             | `palette/CommandPalette.tsx`            | palette footer                                         | (surface-local)    |
| `Enter` (palette) | Jump to focused result       | `palette/CommandPalette.tsx`            | palette footer + accent arrow on highlighted row       | (surface-local)    |
| `Enter` (row)     | Expand/collapse focused row  | native button behavior                  | cheatsheet only                                        | Contact rows       |
| `Esc` (notes)     | Cancel notes edit            | `contacts/ContactRow.tsx`               | cheatsheet only                                        | Contact rows       |

## §4. The `Kbd` primitive (visual rules)

`packages/app/src/features/ui/Kbd.tsx` is the only allowed way to
render a keycap. JSDoc in the file is the spec; this section is the
quick reference:

- **1 key** → single cap: `<Kbd>K</Kbd>` or `<Kbd keys={['esc']} />`
- **2 keys** → two separate caps with a gap: `<Kbd keys={['cmd', 'K']} />`
  (the gap is what keeps thin glyphs like `,` legible — a single
  combined capsule would hide them next to the ⌘ icon)
- **3+ keys** → one combined capsule with internal gap: `<Kbd keys={['cmd', 'shift', 'O']} />`
  (saves horizontal room when the chain gets long)
- **Tone**: `default` on app surfaces, `inverted` on dark backgrounds
  (Undo toast, tooltip interior)
- **Sizes**: `sm` (h-22 / 11 px font) and `md` (h-24 / 12 px font, default)

For shortcut strings authored as `"⌘K"`, `"cmd+K"`, `"⌘⇧O"`, etc.,
parse via `parseShortcut(s)` before passing to `Kbd keys={…}` — this
is what `WithTooltip` does internally.

## §5. Adding a new shortcut — checklist

1. Pick a combo using §2 rules. Check the registry for conflicts.
2. Wire the keydown handler in the closest reasonable surface:
   - Truly global (every screen) → `palette/useGlobalShortcuts.ts`
   - App-shell-wide (HomeScreen mounted) → `home/HomeScreen.tsx`
   - Surface-local (modal, composer, list) → the surface's own file
3. `preventDefault()` when you claim the keystroke.
4. Add the kbd hint to wherever the action is triggered visually
   (button tooltip, row trailing slot, modal action row).
5. Add a row to the §3 table.
6. If applicable, add a row to `KeyboardCheatsheet.tsx` SECTIONS.
7. Render the hint via `Kbd` (never a hand-rolled `<kbd>`).
