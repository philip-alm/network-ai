'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useStickToBottom — keeps a scroll container pinned to the bottom while
 * content grows, but releases the lock the moment the user scrolls up.
 *
 * Pattern adapted from assistant-ui / Vercel ai-chatbot:
 *  - A ResizeObserver on the inner content node fires every time its
 *    height changes (markdown reflow, new bubble, streaming token).
 *  - If `stickRef.current` is true, scroll to bottom (smoothly via
 *    `scrollTop = scrollHeight`, no `behavior: smooth` because we
 *    want pixel-perfect tracking during streaming).
 *  - User scroll listener flips `stickRef.current` based on distance
 *    from the bottom (16px tolerance).
 *
 * Returns:
 *  - `scrollerRef` → put on the overflow:auto element
 *  - `contentRef`  → put on its inner content wrapper (the one that grows)
 *  - `isAtBottom`  → public flag for showing a "Scroll to bottom" affordance
 *  - `scrollToBottom()` → imperative jump (also re-engages stick)
 */
export function useStickToBottom() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const recompute = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 16;
    stickRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickRef.current = true;
    setIsAtBottom(true);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', recompute, { passive: true });
    return () => el.removeEventListener('scroll', recompute);
  }, [recompute]);

  useEffect(() => {
    const el = scrollerRef.current;
    const inner = contentRef.current;
    if (!el || !inner) return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return { scrollerRef, contentRef, isAtBottom, scrollToBottom };
}
