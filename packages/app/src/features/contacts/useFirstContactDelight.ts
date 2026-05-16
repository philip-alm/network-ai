'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * useFirstContactDelight — fires the signature "first entry" moment exactly
 * once per user (per browser, anyway).
 *
 * The moment lands when contacts.length transitions from 0 to 1 AND the
 * user has not already seen it. After 3s the caption auto-dismisses. The
 * localStorage flag persists so refreshing won't replay the moment.
 *
 * Why: DESIGN.md reserves Horizon Rose's most expressive use for rare
 * moments. This is the rarest user-initiated moment in the product: the
 * notebook's first page.
 */

const STORAGE_KEY = 'reknowable:first-contact-celebrated';
const DELIGHT_DURATION_MS = 3000;

export function useFirstContactDelight(contactsLength: number): { active: boolean } {
  const [active, setActive] = useState(false);
  const prevLengthRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevLengthRef.current;
    prevLengthRef.current = contactsLength;
    if (prev !== 0 || contactsLength !== 1) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(STORAGE_KEY) === 'true') return;
    window.localStorage.setItem(STORAGE_KEY, 'true');
    setActive(true);
    const t = setTimeout(() => setActive(false), DELIGHT_DURATION_MS);
    return () => clearTimeout(t);
  }, [contactsLength]);

  return { active };
}
