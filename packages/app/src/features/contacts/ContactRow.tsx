'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pencil, Trash2, ChevronRight, Check, X } from 'lucide-react';
import type { Contact, Asset } from '../../lib/store';
import { useNetworkStore } from '../../lib/store';
import { WarmthDot } from './WarmthDot';
import { getBrowserSupabase } from '../../lib/supabase';

const WARMTH_LABELS: Record<number, string> = {
  1: 'closest — would do anything',
  2: 'WhatsApp, no problem',
  3: 'solid professional contact',
  4: 'would respond if I asked',
  5: 'might respond',
};

export type ContactRowProps = {
  contact: Contact;
  assets: Asset[];
};

export function ContactRow({ contact, assets }: ContactRowProps) {
  const [open, setOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState(contact.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const highlighted = useNetworkStore((s) => s.highlightedId === contact.id);
  const scrollIntent = useNetworkStore((s) => s.scrollIntent);
  const { upsertContacts, removeContact, clearHighlight } = useNetworkStore((s) => s.actions);

  const ownAssets = assets.filter((a) => a.contact_id === contact.id);

  useEffect(() => {
    if (!scrollIntent || scrollIntent.id !== contact.id) return;
    rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setOpen(true);
    const t = setTimeout(() => clearHighlight(), 1200);
    return () => clearTimeout(t);
  }, [scrollIntent, contact.id, clearHighlight]);

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2400);
    return () => clearTimeout(t);
  }, [savedAt]);

  const saveNotes = async (): Promise<void> => {
    if (draftNotes === contact.notes) {
      setEditingNotes(false);
      return;
    }
    setSaving(true);
    upsertContacts([{ ...contact, notes: draftNotes, updated_at: new Date().toISOString() }]);
    const { error } = await getBrowserSupabase()
      .from('contacts')
      .update({ notes: draftNotes })
      .eq('id', contact.id);
    setSaving(false);
    if (error) {
      upsertContacts([contact]);
      return;
    }
    setEditingNotes(false);
    setSavedAt(Date.now());
  };

  const softDelete = async (): Promise<void> => {
    setSaving(true);
    removeContact(contact.id);
    const { error } = await getBrowserSupabase()
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', contact.id);
    setSaving(false);
    if (error) {
      upsertContacts([contact]);
    }
  };

  return (
    <motion.div
      ref={rowRef}
      data-testid={`contact-row-${contact.id}`}
      className={`group border-b border-border-soft transition-colors ${
        highlighted ? 'animate-highlight-pulse' : ''
      }`}
      layout="position"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`contact-toggle-${contact.id}`}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-soft"
      >
        <WarmthDot warmth={contact.warmth} />
        <span className="truncate font-medium tracking-tight text-fg">{contact.name}</span>
        {contact.city ? (
          <span className="shrink-0 text-sm text-muted">· {contact.city}</span>
        ) : null}
        {ownAssets.length > 0 ? (
          <span className="ml-2 inline-flex shrink-0 items-center rounded-sm bg-surface-soft px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted">
            {ownAssets.length} {ownAssets.length === 1 ? 'asset' : 'assets'}
          </span>
        ) : null}
        <ChevronRight
          size={14}
          aria-hidden
          className={`ml-auto shrink-0 text-faint transition-transform duration-200 ease-out ${
            open ? 'rotate-90' : ''
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-5 pb-5 text-sm">
              {contact.warmth != null ? (
                <div className="text-xs text-muted">
                  <span className="uppercase tracking-wider text-faint">Warmth</span>{' '}
                  <span className="mono text-fg/85">{contact.warmth}</span>{' '}
                  <span className="text-muted">— {WARMTH_LABELS[contact.warmth] ?? ''}</span>
                </div>
              ) : null}

              {contact.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {contact.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-sm bg-surface-soft px-2 py-0.5 text-xs text-muted font-mono"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}

              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-faint">Notes</span>
                  {savedAt && !editingNotes ? (
                    <span className="text-xs text-faint font-mono">saved</span>
                  ) : null}
                </div>
                {editingNotes ? (
                  <div className="space-y-2">
                    <textarea
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      data-testid={`contact-notes-edit-${contact.id}`}
                      rows={5}
                      autoFocus
                      className="w-full resize-none rounded-md bg-bg px-3 py-2 text-sm text-fg shadow-hairline placeholder:text-faint focus:outline-none focus:shadow-focus"
                      placeholder="Free-form notes about this contact…"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveNotes}
                        disabled={saving}
                        data-testid={`contact-notes-save-${contact.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-fg px-2.5 py-1 text-xs font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        <Check size={12} aria-hidden /> Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftNotes(contact.notes);
                          setEditingNotes(false);
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-soft hover:text-fg"
                      >
                        <X size={12} aria-hidden /> Cancel
                      </button>
                    </div>
                  </div>
                ) : contact.notes ? (
                  <p className="whitespace-pre-wrap leading-relaxed text-fg/85">{contact.notes}</p>
                ) : (
                  <p className="italic text-faint">No notes yet.</p>
                )}
              </div>

              {ownAssets.length > 0 ? (
                <div>
                  <div className="mb-1.5 text-xs uppercase tracking-wider text-faint">
                    Assets · {ownAssets.length}
                  </div>
                  <ul className="space-y-1.5">
                    {ownAssets.map((a) => (
                      <li key={a.id} className="text-fg/85">
                        <span className="font-medium">{a.name}</span>
                        {a.availability ? (
                          <span className="text-muted"> · {a.availability}</span>
                        ) : null}
                        {a.description ? <div className="text-muted">{a.description}</div> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex gap-1 pt-1">
                {!editingNotes ? (
                  <button
                    type="button"
                    onClick={() => setEditingNotes(true)}
                    data-testid={`contact-edit-notes-${contact.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-soft hover:text-fg"
                  >
                    <Pencil size={12} aria-hidden /> Edit notes
                  </button>
                ) : null}
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    data-testid={`contact-delete-${contact.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-soft hover:text-danger"
                  >
                    <Trash2 size={12} aria-hidden /> Delete
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-xs text-danger">Delete this contact?</span>
                    <button
                      type="button"
                      onClick={softDelete}
                      disabled={saving}
                      data-testid={`contact-delete-confirm-${contact.id}`}
                      className="inline-flex items-center rounded-md bg-danger px-2 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? '…' : 'Yes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="inline-flex items-center rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-soft hover:text-fg"
                    >
                      Cancel
                    </button>
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
