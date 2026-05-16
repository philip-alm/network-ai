/**
 * scheduleIdle — runIdleCallback with a setTimeout fallback for browsers
 * that don't support requestIdleCallback (Safari) and for SSR. Use for
 * non-critical recomputes (asset-count rebuild, filter-inventory rebuild,
 * cache writes) so they don't compete with user-driven renders.
 *
 * Returns a cancel function.
 */
type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;
type IdleHandle = number;

type IdleApi = {
  requestIdleCallback?: (cb: IdleCallback, opts?: { timeout?: number }) => IdleHandle;
  cancelIdleCallback?: (handle: IdleHandle) => void;
};

export function scheduleIdle(fn: () => void, opts: { timeout?: number } = {}): () => void {
  if (typeof window === 'undefined') {
    // SSR — schedule via setImmediate-style fallback. Caller runs on
    // the client anyway since this module is 'use client'-adjacent.
    const h = setTimeout(fn, 0);
    return () => clearTimeout(h);
  }
  // Cast through unknown so we don't conflict with the lib.dom.d.ts
  // declaration of `cancelIdleCallback` (which is non-optional under
  // some tsconfigs and our optional version triggers TS2430).
  const w = window as unknown as IdleApi;
  if (typeof w.requestIdleCallback === 'function') {
    const handle = w.requestIdleCallback(() => fn(), { timeout: opts.timeout ?? 200 });
    return () => w.cancelIdleCallback?.(handle);
  }
  const h = setTimeout(fn, opts.timeout ?? 16);
  return () => clearTimeout(h);
}
