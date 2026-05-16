'use client';

/**
 * SkeletonRows — placeholder rows shown while the FIRST cold load
 * is in flight (no cache, no server response yet). Replaces the
 * EmptyContactsState during that brief window so the user never sees
 * a misleading "you have no contacts" + sudden flood when 10k rows
 * arrive.
 *
 * Each skeleton row mirrors the real ContactRow EXACTLY:
 *  - same outer `p-3` container, no inter-row gap (real rows sit flush)
 *  - same per-row `rounded-md` wrapper
 *  - same inner button padding `px-3 py-2.5` and `gap-3`
 *  - same h-5 w-5 avatar circle
 *  - name placeholder block sized to the real text's optical height
 *  - right cluster placeholder shaped like a WarmthBar + ChevronRight,
 *    so when the real rows hydrate nothing visibly shifts.
 *
 * Shimmer is opacity-only (no transform) — cheap, accessible, doesn't
 * pull focus. Reduced-motion users get a static placeholder.
 */
const ROW_COUNT = 18;

export function SkeletonRows() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading your network"
      role="list"
      data-testid="skeleton-rows"
      className="p-3"
    >
      {Array.from({ length: ROW_COUNT }, (_, i) => (
        <SkeletonRow key={i} index={i} />
      ))}
    </div>
  );
}

function SkeletonRow({ index }: { index: number }) {
  // Stagger the shimmer so the placeholder reads as a list, not a wall.
  const delay = index * 90;
  // Vary widths so the skeleton hints at real text rather than blocks.
  const widthClass = index % 3 === 0 ? 'w-[60%]' : index % 3 === 1 ? 'w-[42%]' : 'w-[52%]';
  return (
    <div role="listitem" className="relative rounded-md">
      <div
        className="flex w-full items-center gap-3 rounded-md px-3 py-2.5"
        style={{
          animation: 'reknowable-skeleton 1400ms ease-in-out infinite',
          animationDelay: `${delay}ms`,
        }}
      >
        <span aria-hidden className="inline-flex h-5 w-5 shrink-0 rounded-full bg-surface-soft" />
        <span aria-hidden className={`h-3.5 rounded-sm bg-surface-soft ${widthClass}`} />
        <span aria-hidden className="ml-auto inline-flex shrink-0 items-center gap-2">
          {/* WarmthBar placeholder — same 23×8 footprint as the real one. */}
          <span className="h-2 w-[23px] rounded-[2px] bg-surface-soft" />
          {/* ChevronRight placeholder — same 14×14 footprint. */}
          <span className="h-3.5 w-3.5 rounded-sm bg-surface-soft" />
        </span>
      </div>

      {/* Hairline separator — must match ContactRow's separator so the
          real rows can swap in without a visual delta. Not shimmered. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-border-soft opacity-70"
      />
    </div>
  );
}
