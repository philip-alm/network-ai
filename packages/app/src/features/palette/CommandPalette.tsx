'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, User, Briefcase, CornerDownLeft, X } from 'lucide-react';
import { useNetworkStore, type Contact, type Asset } from '../../lib/store';
import { Kbd } from '../ui';

export type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

type Result =
  | { kind: 'contact'; contact: Contact; score: number }
  | { kind: 'asset'; asset: Asset; score: number };

const MAX_RESULTS = 8;

/**
 * CommandPalette — Reknowable's recall surface, invoked with ⌘K.
 *
 * Operator-grade: fuzzy search across contacts + assets, arrow-key
 * navigation, Enter to jump-to, Esc to close. The single most-frequent
 * recall affordance in the product after the chat composer.
 *
 * v1 scope (this file): client-side substring + token match against the
 * already-loaded store. Sub-100ms even on hundreds of contacts.
 * Future: swap to the agent's `find` tool for vector + FTS recall on
 * larger sets.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const contacts = useNetworkStore((s) => s.contacts);
  const assets = useNetworkStore((s) => s.assets);
  const jumpTo = useNetworkStore((s) => s.actions.jumpTo);

  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo<Result[]>(
    () => rankResults(query, contacts, assets, MAX_RESULTS),
    [query, contacts, assets],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlight(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(0, results.length - 1)));
  }, [results.length]);

  const choose = (r: Result): void => {
    const id = r.kind === 'contact' ? r.contact.id : (r.asset.contact_id ?? r.asset.id);
    jumpTo(id);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[highlight];
      if (r) choose(r);
      return;
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="palette-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] bg-bg/60 backdrop-blur-sm"
          onClick={onClose}
          data-testid="command-palette-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <motion.div
            key="palette-panel"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-xl overflow-hidden rounded-xl bg-surface shadow-lift"
            style={{
              boxShadow: '0 0 0 1px var(--color-border), 0 24px 60px -20px oklch(0% 0 0 / 0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border-soft px-4 py-3">
              <Search
                size={16}
                aria-hidden
                className={`shrink-0 transition-colors duration-[140ms] ${
                  query ? 'text-accent' : 'text-faint'
                }`}
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Find a contact, an asset, anything you've remembered."
                data-testid="command-palette-input"
                className="flex-1 bg-transparent text-[15px] tracking-tight text-fg outline-none placeholder:text-faint"
                aria-controls="palette-results"
                aria-activedescendant={
                  results[highlight] ? `palette-result-${highlight}` : undefined
                }
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  data-testid="command-palette-clear"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-faint transition-all duration-[140ms] hover:bg-surface-soft hover:text-fg active:scale-[0.92]"
                  style={{
                    transitionTimingFunction: 'var(--ease-out)',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <X size={12} aria-hidden />
                </button>
              ) : (
                <Kbd size="sm">Esc</Kbd>
              )}
            </div>

            <div
              id="palette-results"
              ref={listRef}
              role="listbox"
              aria-label="Results"
              className="max-h-[min(60vh,420px)] overflow-y-auto py-1"
            >
              {results.length === 0 ? (
                <EmptyResults query={query} hasAny={contacts.length + assets.length > 0} />
              ) : (
                results.map((r, i) => (
                  <ResultRow
                    key={resultKey(r)}
                    id={`palette-result-${i}`}
                    result={r}
                    highlighted={i === highlight}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(r)}
                  />
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border-soft bg-surface-soft/50 px-3 py-2 text-[11px] text-faint">
              <span className="inline-flex items-center gap-2">
                <Kbd keys={['up', 'down']} size="sm" />
                <span>navigate</span>
                <span className="text-border">·</span>
                <Kbd size="sm">↵</Kbd>
                <span>jump</span>
                <span className="text-border">·</span>
                <Kbd size="sm">Esc</Kbd>
                <span>close</span>
              </span>
              <span className="font-mono">
                {results.length} {results.length === 1 ? 'result' : 'results'}
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ResultRow({
  id,
  result,
  highlighted,
  onMouseEnter,
  onClick,
}: {
  id: string;
  result: Result;
  highlighted: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  if (result.kind === 'contact') {
    const c = result.contact;
    return (
      <button
        id={id}
        role="option"
        aria-selected={highlighted}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast ${
          highlighted ? 'bg-accent-soft/40' : ''
        }`}
      >
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
            highlighted ? 'bg-accent text-bg' : 'bg-surface-soft text-muted'
          } transition-colors duration-fast`}
        >
          <User size={12} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm tracking-tight text-fg">{c.name}</span>
        {c.city ? <span className="shrink-0 text-xs text-muted">{c.city}</span> : null}
        {c.warmth != null ? (
          <span className="font-mono text-[10px] text-faint">w{c.warmth}</span>
        ) : null}
        {highlighted ? (
          <CornerDownLeft size={11} className="shrink-0 text-accent" aria-hidden />
        ) : null}
      </button>
    );
  }
  const a = result.asset;
  return (
    <button
      id={id}
      role="option"
      aria-selected={highlighted}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast ${
        highlighted ? 'bg-accent-soft/40' : ''
      }`}
    >
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
          highlighted ? 'bg-accent text-bg' : 'bg-surface-soft text-muted'
        } transition-colors duration-fast`}
      >
        <Briefcase size={12} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm tracking-tight text-fg">{a.name}</span>
      {a.availability ? (
        <span className="shrink-0 text-xs text-muted">{a.availability}</span>
      ) : null}
      {highlighted ? (
        <CornerDownLeft size={11} className="shrink-0 text-accent" aria-hidden />
      ) : null}
    </button>
  );
}

function EmptyResults({ query, hasAny }: { query: string; hasAny: boolean }) {
  if (!hasAny) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-fg">Nothing to recall yet.</p>
        <p className="mt-1 text-xs text-muted">
          Add a contact or asset in the chat. It will show up here.
        </p>
      </div>
    );
  }
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm text-fg">{query ? `No matches for "${query}".` : 'Type to recall.'}</p>
      {query ? (
        <p className="mt-1 text-xs text-muted">Try a different word, a tag, or a city.</p>
      ) : (
        <p className="mt-1 text-xs text-muted">Search by name, city, tag, or asset.</p>
      )}
    </div>
  );
}

function resultKey(r: Result): string {
  return r.kind === 'contact' ? `c-${r.contact.id}` : `a-${r.asset.id}`;
}

function rankResults(query: string, contacts: Contact[], assets: Asset[], limit: number): Result[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    const recent: Result[] = [];
    for (const c of contacts.slice(0, Math.ceil(limit * 0.7))) {
      recent.push({ kind: 'contact', contact: c, score: 1 });
    }
    for (const a of assets.slice(0, limit - recent.length)) {
      recent.push({ kind: 'asset', asset: a, score: 1 });
    }
    return recent.slice(0, limit);
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: Result[] = [];
  for (const c of contacts) {
    const score = scoreContact(c, q, tokens);
    if (score > 0) scored.push({ kind: 'contact', contact: c, score });
  }
  for (const a of assets) {
    const score = scoreAsset(a, q, tokens);
    if (score > 0) scored.push({ kind: 'asset', asset: a, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function scoreContact(c: Contact, q: string, tokens: string[]): number {
  const haystack = `${c.name}\n${c.city ?? ''}\n${c.tags.join(' ')}\n${c.notes}`.toLowerCase();
  let score = 0;
  if (c.name.toLowerCase().startsWith(q)) score += 100;
  else if (c.name.toLowerCase().includes(q)) score += 60;
  for (const t of tokens) {
    if (haystack.includes(t)) score += 10;
  }
  if (score > 0 && c.warmth != null) score += 6 - c.warmth;
  return score;
}

function scoreAsset(a: Asset, q: string, tokens: string[]): number {
  const haystack =
    `${a.name}\n${a.description ?? ''}\n${a.tags.join(' ')}\n${a.availability ?? ''}`.toLowerCase();
  let score = 0;
  if (a.name.toLowerCase().startsWith(q)) score += 90;
  else if (a.name.toLowerCase().includes(q)) score += 55;
  for (const t of tokens) {
    if (haystack.includes(t)) score += 9;
  }
  return score;
}
