'use client';

import { useState } from 'react';
import type { Contact, Asset } from './useContacts';
import { WarmthDot } from './WarmthDot';
import { getBrowserSupabase } from '../../lib/supabase';

export type ContactRowProps = {
  contact: Contact;
  assets: Asset[];
  onChange?: () => void;
};

export function ContactRow({ contact, assets, onChange }: ContactRowProps) {
  const [open, setOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState(contact.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ownAssets = assets.filter((a) => a.contact_id === contact.id);

  const saveNotes = async (): Promise<void> => {
    if (draftNotes === contact.notes) {
      setEditingNotes(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const { error } = await getBrowserSupabase()
      .from('contacts')
      .update({ notes: draftNotes })
      .eq('id', contact.id);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setEditingNotes(false);
    onChange?.();
  };

  const softDelete = async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    const { error } = await getBrowserSupabase()
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', contact.id);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setConfirmDelete(false);
    onChange?.();
  };

  return (
    <div data-testid={`contact-row-${contact.id}`} style={{ borderBottom: '1px solid #eee' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`contact-toggle-${contact.id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '10px 14px',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        <WarmthDot warmth={contact.warmth} />
        <span style={{ fontWeight: 500 }}>{contact.name}</span>
        {contact.city ? (
          <span style={{ color: '#888', marginLeft: 8 }}>· {contact.city}</span>
        ) : null}
        <span style={{ marginLeft: 'auto', color: '#bbb', fontSize: 12 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div style={{ padding: '0 14px 14px', fontSize: 13, color: '#444' }}>
          {editingNotes ? (
            <div>
              <textarea
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                data-testid={`contact-notes-edit-${contact.id}`}
                rows={4}
                style={{
                  width: '100%',
                  padding: 8,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={saveNotes}
                  disabled={saving}
                  data-testid={`contact-notes-save-${contact.id}`}
                  style={pillButtonStyle('#111', '#fff')}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftNotes(contact.notes);
                    setEditingNotes(false);
                  }}
                  style={pillButtonStyle('transparent', '#333')}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {contact.notes ? (
                <p style={{ margin: '4px 0 8px 0', whiteSpace: 'pre-wrap' }}>{contact.notes}</p>
              ) : (
                <p style={{ margin: '4px 0 8px 0', color: '#999' }}>(no notes yet)</p>
              )}
            </>
          )}
          {contact.tags.length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              {contact.tags.map((t) => (
                <span
                  key={t}
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    background: '#f1f1f1',
                    borderRadius: 999,
                    fontSize: 11,
                    marginRight: 4,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          {ownAssets.length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: 12, color: '#666' }}>Assets ({ownAssets.length})</strong>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: 18 }}>
                {ownAssets.map((a) => (
                  <li key={a.id}>
                    <strong>{a.name}</strong>
                    {a.availability ? (
                      <span style={{ color: '#888' }}> · {a.availability}</span>
                    ) : null}
                    {a.description ? <div style={{ color: '#666' }}>{a.description}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {saveError ? <p style={{ color: '#b00', fontSize: 12 }}>{saveError}</p> : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {!editingNotes ? (
              <button
                type="button"
                onClick={() => setEditingNotes(true)}
                data-testid={`contact-edit-notes-${contact.id}`}
                style={pillButtonStyle('transparent', '#333')}
              >
                Edit notes
              </button>
            ) : null}
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                data-testid={`contact-delete-${contact.id}`}
                style={pillButtonStyle('transparent', '#b00')}
              >
                Delete
              </button>
            ) : (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#b00' }}>Sure?</span>
                <button
                  type="button"
                  onClick={softDelete}
                  disabled={saving}
                  data-testid={`contact-delete-confirm-${contact.id}`}
                  style={pillButtonStyle('#b00', '#fff')}
                >
                  {saving ? '…' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  style={pillButtonStyle('transparent', '#333')}
                >
                  Cancel
                </button>
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pillButtonStyle(bg: string, fg: string): React.CSSProperties {
  return {
    padding: '4px 10px',
    background: bg,
    color: fg,
    border: bg === 'transparent' ? '1px solid #ddd' : 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
  };
}
