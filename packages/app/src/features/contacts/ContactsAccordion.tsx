'use client';

import { AnimatePresence, motion } from 'motion/react';
import { ContactRow } from './ContactRow';
import type { Contact, Asset } from '../../lib/store';

export type ContactsAccordionProps = {
  contacts: Contact[];
  assets: Asset[];
  onChange?: () => void;
};

export function ContactsAccordion({ contacts, assets }: ContactsAccordionProps) {
  const unattachedAssets = assets.filter((a) => a.contact_id == null);

  return (
    <section
      data-testid="contacts-accordion"
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-bg"
    >
      <header className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-border-soft bg-bg/90 px-5 py-4 backdrop-blur">
        <h2 className="text-base font-semibold tracking-tight text-fg">Contacts</h2>
        <span className="text-sm font-mono text-muted">{contacts.length}</span>
      </header>

      {contacts.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm text-muted">No contacts yet.</p>
          <p className="mt-1 text-sm text-faint">
            Tell the assistant about someone — they'll appear here.
          </p>
        </div>
      ) : (
        <div>
          <AnimatePresence initial={false}>
            {contacts.map((c) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6, height: 0 }}
                transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
              >
                <ContactRow contact={c} assets={assets} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {unattachedAssets.length > 0 ? (
        <div className="mt-6">
          <header className="sticky top-0 z-10 flex items-baseline gap-2 border-y border-border-soft bg-bg/90 px-5 py-4 backdrop-blur">
            <h2 className="text-base font-semibold tracking-tight text-fg">Our assets</h2>
            <span className="text-sm font-mono text-muted">{unattachedAssets.length}</span>
          </header>
          <ul className="divide-y divide-border-soft">
            {unattachedAssets.map((a) => (
              <li key={a.id} className="px-5 py-4 text-sm">
                <div className="font-medium text-fg">{a.name}</div>
                {a.availability ? <div className="text-muted">{a.availability}</div> : null}
                {a.description ? <div className="mt-1 text-fg/80">{a.description}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
