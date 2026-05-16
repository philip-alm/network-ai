'use client';

/**
 * SkeletonRows — placeholder rows shown while the FIRST cold load
 * is in flight (no cache, no server response yet). Replaces the
 * EmptyContactsState during that brief window so the user never sees
 * a misleading "you have no contacts" + sudden flood when 10k rows
 * arrive.
 *
 * Shimmer is opacity-only (no transform) — cheap, accessible, doesn't
 * pull focus. Reduced-motion users get a static placeholder.
 *
 * Row count is generous so the placeholder fills a typical pane
 * comfortably (a row is ~44px tall + 6px gap = 50px; 18 rows ≈ 900px
 * of vertical fill, which covers most laptop viewports).
 */
const ROW_COUNT = 18;

export function SkeletonRows() {
  return (
    <ul
      aria-busy="true"
      aria-label="Loading your network"
      data-testid="skeleton-rows"
      className="space-y-1.5 p-3"
    >
      {Array.from({ length: ROW_COUNT }, (_, i) => (
        <SkeletonRow key={i} index={i} />
      ))}
    </ul>
  );
}

function SkeletonRow({ index }: { index: number }) {
  // Stagger the shimmer so the placeholder reads as a list, not a wall.
  const delay = index * 90;
  // Vary widths so the skeleton hints at real text rather than blocks.
  const widthClass = index % 3 === 0 ? 'w-[60%]' : index % 3 === 1 ? 'w-[42%]' : 'w-[52%]';
  return (
    <li
      className="flex items-center gap-3 rounded-md px-3 py-2.5"
      style={{
        animation: 'reknowable-skeleton 1400ms ease-in-out infinite',
        animationDelay: `${delay}ms`,
      }}
    >
      <span aria-hidden className="inline-flex h-5 w-5 shrink-0 rounded-full bg-surface-soft" />
      <span aria-hidden className={`h-3 rounded-sm bg-surface-soft ${widthClass}`} />
      <span aria-hidden className="ml-auto h-2 w-12 rounded-sm bg-surface-soft" />
    </li>
  );
}
