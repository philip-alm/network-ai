'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, User, Briefcase, CornerDownLeft, X, Filter } from 'lucide-react';
import { useNetworkStore } from '../../lib/store';
import { applyContactFilter, applyAssetFilter } from '../contacts/panelLogic';
import { useNavigateToRow } from '../contacts/useNavigateToRow';
import { Kbd, WithTooltip } from '../ui';
import { usePaletteSearch, type PaletteResult } from './usePaletteSearch';

export type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

const MAX_RESULTS = 8;

/**
 * CommandPalette — Reknowable's recall surface, invoked with ⌘K.
 *
 * Two layers feed it:
 *
 *   1. usePaletteSearch returns hybrid local + server results. Local
 *      fires on frame 1 (substring + token over the loaded store);
 *      server (`find_anything` RPC, debounced 80ms) augments with rows
 *      from the user's WHOLE corpus — not just the right-pane's
 *      currently-loaded slice. This closes the long-standing "Cmd+K
 *      only shows what the panel happens to be displaying" gap.
 *
 *   2. useNavigateToRow handles the click. It toggles the right-pane
 *      view if the result's kind doesn't match, fetches the row via
 *      lookup_*_by_ids if it isn't already in the store, upserts it,
 *      and fires scrollIntent — which the VirtualPanelList consumes
 *      with virtualizer.scrollToIndex so off-screen rows scroll into
 *      the render window before the row component's own open + pulse
 *      effect runs. Together they guarantee click → land is reliable
 *      regardless of pagination, virtualization, view, or filter.
 *
 * Outside-filter affordance: any result that wouldn't survive the
 * active panel filter renders a subtle "filter" chip so the user
 * understands "this isn't in the list you're looking at — clicking
 * will surface it anyway." The row is still clickable. The chip's
 * tooltip names the conflicting facet for clarity.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigateToRow();
  const panel = useNetworkStore((s) => s.panel);
  const localAssets = useNetworkStore((s) => s.assets);

  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { results, serverInflight, serverError } = usePaletteSearch(query, {
    limit: MAX_RESULTS,
  });

  // Per-result "matches current filter" computation. Done here (not in
  // the search hook) because matching is a presentation concern — the
  // hook stays focused on "find candidate rows," and the palette
  // decides how to surface filter conflicts. The check excludes
  // `panel.search` deliberately: that's a separate search lane (the
  // right-pane header search) and including it would mark almost
  // everything "outside filter" whenever the user has typed there.
  const matchesFilter = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of results) {
      const key = resultKey(r);
      if (r.kind === 'contact') {
        const passes =
          applyContactFilter([r.contact], panel.contactFilter, {
            assets: localAssets,
            search: '',
          }).length > 0;
        map.set(key, passes);
      } else {
        const passes = applyAssetFilter([r.asset], panel.assetFilter, { search: '' }).length > 0;
        map.set(key, passes);
      }
    }
    return map;
  }, [results, panel.contactFilter, panel.assetFilter, localAssets]);

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

  // Keep the active row scrolled into the visible list area. The
  // palette's own listbox scrolls independently of the page; without
  // this, arrowing past the visible window leaves the highlight off-
  // screen.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`#palette-result-${highlight}`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const choose = (r: PaletteResult): void => {
    // Close FIRST so the panel's view-toggle + scroll animations are
    // not visually masked by the palette overlay. useNavigateToRow's
    // promise continues in the background — the user sees the row
    // scroll in immediately after the overlay fades.
    onClose();
    if (r.kind === 'contact') {
      void navigate('contact', r.contact.id);
    } else {
      // Assets: if attached, the visually useful target is usually the
      // owning contact (matches the tool-card "Jump to" semantics). But
      // unlike tool cards, the palette also surfaces unattached assets
      // — for those there IS no contact to jump to, so we navigate to
      // the asset row. Either way the AssetRow's scrollIntent listener
      // does its open + pulse.
      void navigate('asset', r.asset.id);
    }
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

  const totalLoaded = useNetworkStore.getState().contacts.length + localAssets.length;

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
                <EmptyResults
                  query={query}
                  hasAny={totalLoaded > 0}
                  serverInflight={serverInflight}
                />
              ) : (
                results.map((r, i) => (
                  <ResultRow
                    key={resultKey(r)}
                    id={`palette-result-${i}`}
                    result={r}
                    highlighted={i === highlight}
                    outsideFilter={matchesFilter.get(resultKey(r)) === false}
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
              <FooterStatus
                resultCount={results.length}
                serverInflight={serverInflight}
                serverError={serverError}
                query={query}
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function FooterStatus({
  resultCount,
  serverInflight,
  serverError,
  query,
}: {
  resultCount: number;
  serverInflight: boolean;
  serverError: string | null;
  query: string;
}) {
  // Priority: error > inflight > count. The error line is one tap-
  // friendly sentence; no stack traces. Inflight gets a soft animated
  // pulse so the user knows the result list may expand.
  if (serverError && query) {
    return (
      <WithTooltip label={`find_anything: ${serverError}`}>
        <span className="font-mono text-faint" data-testid="palette-server-error">
          local only
        </span>
      </WithTooltip>
    );
  }
  if (serverInflight && query) {
    return (
      <motion.span
        className="font-mono text-faint"
        animate={{ opacity: [0.45, 0.85, 0.45] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        data-testid="palette-server-inflight"
      >
        searching…
      </motion.span>
    );
  }
  return (
    <span className="font-mono">
      {resultCount} {resultCount === 1 ? 'result' : 'results'}
    </span>
  );
}

function ResultRow({
  id,
  result,
  highlighted,
  outsideFilter,
  onMouseEnter,
  onClick,
}: {
  id: string;
  result: PaletteResult;
  highlighted: boolean;
  outsideFilter: boolean;
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
        data-testid={`palette-result-contact-${c.id}`}
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
        {outsideFilter ? <OutsideFilterChip /> : null}
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
      data-testid={`palette-result-asset-${a.id}`}
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
      {outsideFilter ? <OutsideFilterChip /> : null}
      {highlighted ? (
        <CornerDownLeft size={11} className="shrink-0 text-accent" aria-hidden />
      ) : null}
    </button>
  );
}

/** Subtle chip on results that don't match the active panel filter.
 *  Click still navigates — the row will appear in the panel via the
 *  upsert path even if it wouldn't have survived a fresh page-1 fetch.
 *  Tooltip explains the situation so the user doesn't think clicking
 *  is broken. */
function OutsideFilterChip() {
  return (
    <WithTooltip label="Outside your current filter. Click to surface it anyway.">
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-surface-soft px-1.5 py-0.5 text-[10px] text-muted"
        data-testid="palette-outside-filter"
      >
        <Filter size={9} aria-hidden />
        filter
      </span>
    </WithTooltip>
  );
}

function EmptyResults({
  query,
  hasAny,
  serverInflight,
}: {
  query: string;
  hasAny: boolean;
  serverInflight: boolean;
}) {
  if (!hasAny && !query) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-fg">Nothing to recall yet.</p>
        <p className="mt-1 text-xs text-muted">
          Add a contact or asset in the chat. It will show up here.
        </p>
      </div>
    );
  }
  // Server is still in flight — don't show "no matches" prematurely;
  // the user typed a fraction of a second ago, the RPC hasn't returned.
  if (serverInflight && query) {
    return (
      <div className="px-4 py-12 text-center">
        <motion.p
          className="text-sm text-muted"
          animate={{ opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          Searching everywhere…
        </motion.p>
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

function resultKey(r: PaletteResult): string {
  return r.kind === 'contact' ? `c-${r.contact.id}` : `a-${r.asset.id}`;
}
