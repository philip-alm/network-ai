'use client';

import { useState } from 'react';
import type { Contact, Asset } from './useContacts';
import { WarmthDot } from './WarmthDot';

export type ContactRowProps = {
  contact: Contact;
  assets: Asset[];
};

export function ContactRow({ contact, assets }: ContactRowProps) {
  const [open, setOpen] = useState(false);
  const ownAssets = assets.filter((a) => a.contact_id === contact.id);

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
          {contact.notes ? (
            <p style={{ margin: '4px 0 8px 0', whiteSpace: 'pre-wrap' }}>{contact.notes}</p>
          ) : null}
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
            <div>
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
        </div>
      ) : null}
    </div>
  );
}
