'use client';

import { ContactRow } from './ContactRow';
import type { Contact, Asset } from './useContacts';

export type ContactsAccordionProps = {
  contacts: Contact[];
  assets: Asset[];
};

export function ContactsAccordion({ contacts, assets }: ContactsAccordionProps) {
  const unattachedAssets = assets.filter((a) => a.contact_id == null);

  return (
    <section
      data-testid="contacts-accordion"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}
    >
      <header style={{ padding: '12px 14px', borderBottom: '1px solid #eee' }}>
        <strong style={{ fontSize: 14 }}>Contacts</strong>
        <span style={{ color: '#888', fontSize: 13, marginLeft: 6 }}>({contacts.length})</span>
      </header>
      {contacts.length === 0 ? (
        <div style={{ padding: 24, color: '#999', fontSize: 13 }}>
          No contacts yet. Tell the assistant about someone.
        </div>
      ) : (
        contacts.map((c) => <ContactRow key={c.id} contact={c} assets={assets} />)
      )}

      {unattachedAssets.length > 0 ? (
        <>
          <header
            style={{
              padding: '12px 14px',
              borderTop: '1px solid #eee',
              borderBottom: '1px solid #eee',
            }}
          >
            <strong style={{ fontSize: 14 }}>Our assets</strong>
            <span style={{ color: '#888', fontSize: 13, marginLeft: 6 }}>
              ({unattachedAssets.length})
            </span>
          </header>
          <ul style={{ margin: 0, padding: '8px 14px 14px 28px', fontSize: 13 }}>
            {unattachedAssets.map((a) => (
              <li key={a.id} style={{ marginBottom: 6 }}>
                <strong>{a.name}</strong>
                {a.availability ? <span style={{ color: '#888' }}> · {a.availability}</span> : null}
                {a.description ? <div style={{ color: '#666' }}>{a.description}</div> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
