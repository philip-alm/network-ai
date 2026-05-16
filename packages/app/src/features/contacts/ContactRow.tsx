'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Pencil,
  Trash2,
  ChevronRight,
  Briefcase,
  Flame,
  Tag as TagIcon,
  NotebookPen,
} from 'lucide-react';
import type { Contact, Asset } from '../../lib/store';
import { useNetworkStore } from '../../lib/store';
import { getBrowserSupabase } from '../../lib/supabase';
import { WarmthBar, Tag, WithTooltip, SoftDivider, type TagKind } from '../ui';
import { iconForAsset } from './assetIcons';
import { useIsRecentlyUpdated } from './realtimeTint';
import { useOwnedAssets } from './useOwnedAssets';

/**
 * Map free-form tag strings to a TagKind so the same tag word always
 * gets the same color across the app. Falls through to `neutral` for
 * anything unrecognized. Extend as new categories emerge.
 */
function tagKindFor(tag: string): TagKind {
  const t = tag.toLowerCase();
  if (/invest|vc|angel|fund/.test(t)) return 'blue';
  if (/engineer|founder|designer|cto|cpo|ceo|operator/.test(t)) return 'green';
  if (/studio|podcast|hotel|venue|equip|asset/.test(t)) return 'amber';
  if (/event|launch|partner/.test(t)) return 'brand';
  return 'neutral';
}

const WARMTH_LABELS: Record<number, string> = {
  1: 'Met once, vague memory',
  2: 'Would answer an email',
  3: 'Catches up once in a while',
  4: 'Always quick to reply',
  5: 'Would drop everything',
};

const AUTOSAVE_DEBOUNCE_MS = 600;
const SAVED_HINT_FADE_MS = 2400;

export type ContactRowProps = {
  contact: Contact;
  /** Only THIS contact's assets, not the full assets list. Pre-computed
   *  by the parent so the row's prop ref is stable when unrelated
   *  assets change — letting React.memo short-circuit re-renders. */
  ownAssets: Asset[];
  /** Stable handler from the parent (wrap in useCallback). Receives
   *  the contact so the parent doesn't have to create a fresh closure
   *  per row on every render. */
  onDelete?: (contact: Contact) => void;
};

const EASE_OUT = 'var(--ease-out)';

function ContactRowInner({ contact, ownAssets, onDelete }: ContactRowProps) {
  const [open, setOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState(contact.notes);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const lastSavedRef = useRef<string>(contact.notes);

  const highlighted = useNetworkStore((s) => s.highlightedId === contact.id);
  const scrollIntent = useNetworkStore((s) => s.scrollIntent);
  const { upsertContacts, clearHighlight } = useNetworkStore((s) => s.actions);

  // ownAssets is now provided by the parent so this row doesn't
  // re-filter the full assets list on every render.

  useEffect(() => {
    if (!scrollIntent || scrollIntent.kind !== 'contact' || scrollIntent.id !== contact.id) {
      return;
    }
    rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setOpen(true);
    const t = setTimeout(() => clearHighlight(), 1200);
    return () => clearTimeout(t);
  }, [scrollIntent, contact.id, clearHighlight]);

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), SAVED_HINT_FADE_MS);
    return () => clearTimeout(t);
  }, [savedAt]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const persistNotes = useCallback(
    async (value: string): Promise<void> => {
      if (value === lastSavedRef.current) return;
      if (inFlightRef.current === value) return;
      inFlightRef.current = value;
      const prev = lastSavedRef.current;
      lastSavedRef.current = value;
      upsertContacts([{ ...contact, notes: value, updated_at: new Date().toISOString() }]);
      const { error } = await getBrowserSupabase()
        .from('contacts')
        .update({ notes: value })
        .eq('id', contact.id);
      inFlightRef.current = null;
      if (error) {
        lastSavedRef.current = prev;
        upsertContacts([{ ...contact, notes: prev }]);
        return;
      }
      setSavedAt(Date.now());
    },
    [contact, upsertContacts],
  );

  const onChangeNotes = (value: string): void => {
    setDraftNotes(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void persistNotes(value), AUTOSAVE_DEBOUNCE_MS);
  };

  const onBlurNotes = (): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void persistNotes(draftNotes);
    setEditingNotes(false);
  };

  const onKeyDownNotes = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setDraftNotes(lastSavedRef.current);
      setEditingNotes(false);
      textareaRef.current?.blur();
    }
  };

  const enterEditing = (): void => {
    setDraftNotes(contact.notes);
    setEditingNotes(true);
    queueMicrotask(() => textareaRef.current?.focus());
  };

  const recentlyUpdated = useIsRecentlyUpdated(contact.id);

  // Lazy-fetch the COMPLETE owned-asset set the first time the row is
  // opened. The `ownAssets` prop is only the currently-loaded slice
  // (could be empty or partial at scale). We fall back to it while
  // the fetch is in flight so the open animation is never blank.
  const { assets: fullOwnedAssets, isLoading: fetchingOwnedAssets } = useOwnedAssets(
    contact.id,
    open,
  );
  const displayedOwnedAssets = fullOwnedAssets ?? ownAssets;
  // True authoritative count: prefer server's asset_count, else the
  // full lazy-loaded set, else the prop fallback.
  const ownedAssetCount =
    contact.asset_count ?? (fullOwnedAssets ? fullOwnedAssets.length : ownAssets.length);

  return (
    <motion.div
      ref={rowRef}
      data-testid={`contact-row-${contact.id}`}
      className={`group relative rounded-md ${highlighted ? 'animate-highlight-pulse' : ''} ${
        // No outer margin when open — it pushed siblings down 8px and
        // produced the 1-2px layout shift the user noticed. The bg +
        // shadow alone are enough visual separation for the panel.
        open ? 'bg-surface-soft shadow-hairline-soft' : ''
      }`}
      style={{
        transition: 'background-color 180ms var(--ease-out), box-shadow 180ms var(--ease-out)',
        // Realtime tint: accent hairline that fades out over 1.2s. The
        // animation runs once per "recently updated" transition.
        ...(recentlyUpdated && !open
          ? {
              animation: 'reknowable-tint 1200ms ease-out forwards',
            }
          : null),
      }}
      // Intentionally NO `layout="position"`. Layout animations make
      // siblings *slide* when this row's height grows, which the user
      // reads as "the list reordered". Snap behavior is more honest:
      // the order doesn't change, only this row's height does.
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`contact-toggle-${contact.id}`}
        className={`flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-2.5 text-left transition-all duration-[160ms] active:scale-[0.998] ${
          open ? '' : 'hover:bg-surface-soft focus-visible:bg-surface-soft'
        }`}
        style={{
          transitionTimingFunction: EASE_OUT,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <ContactAvatar name={contact.name} />
        <span className="min-w-0 truncate text-[14px] font-medium tracking-tight text-fg">
          {contact.name}
        </span>
        {contact.tags.length > 0 ? (
          <span
            aria-hidden={open ? true : undefined}
            className={`hidden shrink-0 items-center gap-1 sm:inline-flex ${
              open ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
            style={{
              transition: 'opacity 180ms var(--ease-out)',
            }}
          >
            {contact.tags.slice(0, 2).map((t) => (
              <Tag key={t} kind={tagKindFor(t)}>
                {t}
              </Tag>
            ))}
          </span>
        ) : null}
        <span className="ml-auto inline-flex shrink-0 items-center gap-3 text-muted">
          {ownedAssetCount > 0 ? (
            <WithTooltip label={`${ownedAssetCount} ${ownedAssetCount === 1 ? 'asset' : 'assets'}`}>
              <span className="inline-flex items-center gap-1 text-[11px] tabular-nums">
                <Briefcase size={11} aria-hidden className="text-faint" />
                {ownedAssetCount}
              </span>
            </WithTooltip>
          ) : null}
          {contact.city ? (
            <WithTooltip label={`Based in ${contact.city}`}>
              <span className="text-xs">{contact.city}</span>
            </WithTooltip>
          ) : null}
          {contact.warmth != null ? (
            <WithTooltip
              label={`Warmth ${contact.warmth} · ${WARMTH_LABELS[contact.warmth] ?? ''}`}
            >
              <WarmthBar warmth={contact.warmth} />
            </WithTooltip>
          ) : null}
          <ChevronRight
            size={14}
            aria-hidden
            className={`shrink-0 text-faint transition-transform duration-[200ms] ${
              open ? 'rotate-90' : ''
            }`}
            style={{ transitionTimingFunction: EASE_OUT }}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 text-sm">
              {contact.warmth != null ? (
                <Field label="Warmth" Icon={Flame} iconClass="text-accent">
                  <div className="flex items-center gap-3 text-sm">
                    <WarmthBar warmth={contact.warmth} />
                    <span className="text-fg tabular-nums">{contact.warmth}</span>
                    <span className="text-muted">{WARMTH_LABELS[contact.warmth] ?? ''}</span>
                  </div>
                </Field>
              ) : null}

              {contact.warmth != null ? <SoftDivider /> : null}

              {contact.tags.length > 0 ? (
                <Field label="Tags" Icon={TagIcon} iconClass="text-muted">
                  <div className="flex flex-wrap gap-1.5">
                    {contact.tags.map((t) => (
                      <Tag key={t} kind={tagKindFor(t)} onPanel>
                        {t}
                      </Tag>
                    ))}
                  </div>
                </Field>
              ) : null}

              {contact.tags.length > 0 ? <SoftDivider /> : null}

              <Field
                label="Notes"
                Icon={NotebookPen}
                iconClass="text-muted"
                trailing={
                  <AnimatePresence>
                    {savedAt ? (
                      <motion.span
                        key={savedAt}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="text-xs text-faint"
                        aria-live="polite"
                      >
                        Saved
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                }
              >
                {editingNotes ? (
                  <textarea
                    ref={textareaRef}
                    value={draftNotes}
                    onChange={(e) => onChangeNotes(e.target.value)}
                    onBlur={onBlurNotes}
                    onKeyDown={onKeyDownNotes}
                    data-testid={`contact-notes-edit-${contact.id}`}
                    rows={5}
                    className="w-full resize-none rounded-md bg-bg px-3 py-2 text-sm text-fg shadow-hairline placeholder:text-faint focus:shadow-focus focus:outline-none"
                    style={{
                      transition: 'box-shadow 180ms var(--ease-out)',
                    }}
                    placeholder="Free-form notes about this contact."
                  />
                ) : (
                  <button
                    type="button"
                    onClick={enterEditing}
                    data-testid={`contact-edit-notes-${contact.id}`}
                    aria-label="Edit notes"
                    className="block w-full rounded-md border border-transparent px-3 py-2 text-left text-sm text-fg transition-all duration-[160ms] hover:border-border-soft hover:bg-surface-soft/60 focus-visible:border-border-soft focus-visible:bg-surface-soft/60"
                    style={{
                      transitionTimingFunction: EASE_OUT,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {contact.notes ? (
                      <p className="whitespace-pre-wrap leading-relaxed text-fg">{contact.notes}</p>
                    ) : (
                      <p className="italic text-faint">
                        No notes yet. <span className="not-italic text-muted">Click to add.</span>
                      </p>
                    )}
                  </button>
                )}
              </Field>

              {ownedAssetCount > 0 ? <SoftDivider /> : null}

              {ownedAssetCount > 0 ? (
                <Field
                  label={
                    fetchingOwnedAssets && displayedOwnedAssets.length < ownedAssetCount
                      ? `Assets · ${displayedOwnedAssets.length} of ${ownedAssetCount}…`
                      : `Assets · ${ownedAssetCount}`
                  }
                  Icon={Briefcase}
                  iconClass="text-[var(--color-tag-amber-fg)]"
                >
                  <ul className="space-y-2.5">
                    {displayedOwnedAssets.map((a) => {
                      const AIcon = iconForAsset(a.name, a.availability);
                      return (
                        <li key={a.id} className="text-fg">
                          <div className="flex items-center gap-2">
                            <AIcon
                              size={12}
                              aria-hidden
                              className="shrink-0 text-[var(--color-tag-amber-fg)]"
                            />
                            <span className="font-medium">{a.name}</span>
                            {a.availability ? (
                              <span className="text-xs text-muted">· {a.availability}</span>
                            ) : null}
                          </div>
                          {a.description ? (
                            <div className="mt-0.5 pl-[20px] text-sm text-muted">
                              {a.description}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </Field>
              ) : null}

              <div className="flex items-center justify-between gap-3 pt-3 text-[11px] text-faint">
                <span title={`Created ${contact.created_at}`}>
                  Added {formatRelative(contact.created_at)}
                </span>
                <span title={`Updated ${contact.updated_at}`}>
                  Updated {formatRelative(contact.updated_at)}
                </span>
              </div>

              <div className="flex items-center gap-1 pt-4">
                <WithTooltip label="Edit notes">
                  <button
                    type="button"
                    onClick={enterEditing}
                    data-testid={`contact-edit-notes-button-${contact.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-all duration-[160ms] hover:bg-surface-soft hover:text-fg focus-visible:bg-surface-soft focus-visible:text-fg active:scale-[0.95]"
                    style={{
                      transitionTimingFunction: EASE_OUT,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <Pencil size={12} aria-hidden /> Edit notes
                  </button>
                </WithTooltip>
                <WithTooltip label="Delete contact">
                  <button
                    type="button"
                    onClick={() => onDelete?.(contact)}
                    data-testid={`contact-delete-${contact.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-all duration-[160ms] hover:bg-surface-soft hover:text-danger focus-visible:bg-surface-soft focus-visible:text-danger active:scale-[0.95]"
                    style={{
                      transitionTimingFunction: EASE_OUT,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <Trash2 size={12} aria-hidden /> Delete
                  </button>
                </WithTooltip>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Hairline separator below each row. Fades out when this row is
          open — the open card's shadow-hairline-soft ring is its own
          visual edge, and a separator beneath it would double-frame
          the bottom. Inset by px-3 to align with the row's content
          gutter. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-3 bottom-0 h-px bg-border-soft transition-opacity duration-[160ms] ${
          open ? 'opacity-0' : 'opacity-70'
        }`}
        style={{ transitionTimingFunction: 'var(--ease-out)' }}
      />
    </motion.div>
  );
}

/**
 * ContactAvatar — small initials chip leading each contact row. Provides
 * a quick visual anchor per person without taking on the cost of real
 * profile photos. Initials derive from the first + last token of the name.
 */
function ContactAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-soft text-[10px] font-medium tracking-tight text-muted"
    >
      {initialsFor(name)}
    </span>
  );
}

/**
 * formatRelative — a tiny "5m ago" / "2d ago" / "Mar 5" formatter.
 * Avoids pulling in a date library for this single display path.
 */
function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return 'just now';
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Field({
  label,
  trailing,
  children,
  Icon,
  iconClass = 'text-muted',
}: {
  label: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  Icon?: typeof Flame;
  iconClass?: string;
}) {
  return (
    <div className="py-3.5">
      <div className="mb-2 flex items-center gap-2">
        {Icon ? <Icon size={13} aria-hidden className={`shrink-0 ${iconClass}`} /> : null}
        <span className="text-[13px] font-semibold tracking-tight text-fg">{label}</span>
        {trailing}
      </div>
      {children}
    </div>
  );
}

/**
 * ContactRow — memoized so that re-rendering the parent (e.g. when a
 * realtime echo touches an unrelated row) doesn't cascade renders into
 * every row in the list. Each row re-renders only when its own props
 * change: when ITS contact gets upserted, when ITS asset list grows or
 * shrinks, or when the parent rebuilds its renderRow handlers.
 */
export const ContactRow = memo(ContactRowInner, (prev, next) => {
  return (
    prev.contact === next.contact &&
    prev.ownAssets === next.ownAssets &&
    prev.onDelete === next.onDelete
  );
});
