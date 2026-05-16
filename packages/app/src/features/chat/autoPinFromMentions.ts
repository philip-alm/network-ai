/**
 * autoPinFromMentions — protocol-level enforcement of system prompt
 * RULE 1: if the agent names a contact in chat, that contact MUST be
 * pinned in the right pane.
 *
 * Soft enforcement (just the prompt rule) has been failing. The agent
 * names candidates like "Naomi Davis is your strongest path" without
 * including those ids in its `set_panel({pinnedContactIds: ...})` call,
 * leaving the user with names in chat that aren't in the pane. The
 * fix is to make the UI do the pinning unconditionally after each turn,
 * so the agent CAN'T violate the invariant: every `[Name](contact:UUID)`
 * mention pill in the final assistant text is in the pinned set.
 *
 * Pure module — takes text + the currently-pinned list, returns the
 * union. The caller wires it to `setPanelState` with `source: 'agent'`
 * so the change carries the AI badge + the Undo snapshot.
 */

// Markdown link with our custom `contact:` protocol. The UUID is the
// canonical 8-4-4-4-12 lowercase form Postgres emits. We accept any
// case for robustness but the protocol prefix is required.
const MENTION_RE =
  /\[[^\]]+\]\(contact:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

/** Pull every contact UUID referenced via mention syntax from a string. */
export function extractMentionedContactIds(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const id = match[1].toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Given the final assistant text + the currently-pinned contact list,
 * return the new pinned list (existing + mentioned-not-yet-pinned) AND
 * the ids that were freshly added. Returns null when no change is
 * needed so the caller can skip the store mutation entirely.
 *
 * Ordering: existing pins keep their position (the user / agent set
 * them deliberately); new pins land at the END in mention-order. The
 * agent's hard-pin list stays the user's primary picks; auto-pins are
 * the "you mentioned them too, here they are."
 */
export function computeAutoPinUpdate(
  finalText: string,
  currentlyPinned: string[],
): { nextPinned: string[]; added: string[] } | null {
  const mentioned = extractMentionedContactIds(finalText);
  if (mentioned.length === 0) return null;
  const have = new Set(currentlyPinned);
  const added: string[] = [];
  for (const id of mentioned) {
    if (have.has(id)) continue;
    have.add(id);
    added.push(id);
  }
  if (added.length === 0) return null;
  return {
    nextPinned: [...currentlyPinned, ...added],
    added,
  };
}
