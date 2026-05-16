'use client';

/**
 * /lab/buttons — clickability diagnostic.
 *
 * Each card renders an identical-looking icon button using a DIFFERENT
 * technique. Click each, hover each, drag your cursor across the icon /
 * text / kbd area. The variant whose counters increment EVERY time you
 * click (anywhere inside the button) is the one that solves the bug.
 *
 * Counters explained:
 *   - react   : the button's React onClick fired.
 *   - native  : a native addEventListener('click') saw the event.
 *   - enters  : mouseenter fired on the button.
 *   - target  : the tagName of the inner element the click actually
 *               originated on. Tells you what's intercepting.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { WithTooltip, setClickInspectorArmed, readLastClickCapture } from '@reknowable/app';

type Stats = {
  reactClicks: number;
  nativeClicks: number;
  enters: number;
  lastTargetTag: string;
};
const ZERO: Stats = {
  reactClicks: 0,
  nativeClicks: 0,
  enters: 0,
  lastTargetTag: '—',
};

function useStats<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [stats, setStats] = useState<Stats>(ZERO);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent): void => {
      const t = e.target as Element | null;
      setStats((s) => ({
        ...s,
        nativeClicks: s.nativeClicks + 1,
        lastTargetTag: t?.tagName?.toLowerCase() ?? '?',
      }));
    };
    const onEnter = (): void => setStats((s) => ({ ...s, enters: s.enters + 1 }));
    el.addEventListener('click', onClick);
    el.addEventListener('mouseenter', onEnter);
    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('mouseenter', onEnter);
    };
  }, []);
  const onReactClick = (): void => setStats((s) => ({ ...s, reactClicks: s.reactClicks + 1 }));
  const reset = (): void => setStats(ZERO);
  return { ref, stats, onReactClick, reset };
}

const CARD = 'rounded-lg bg-surface p-4 shadow-hairline-soft flex flex-col min-h-[180px]';
const TITLE = 'text-sm font-medium tracking-tight text-fg';
const DESC = 'mt-1 text-[12px] text-muted leading-snug';
const BTN =
  'inline-flex h-9 min-w-[260px] items-center gap-2.5 rounded-lg bg-surface-soft px-3 text-[13px] text-muted transition-all duration-150 hover:bg-bg hover:text-fg focus-visible:bg-bg focus-visible:text-fg active:scale-[0.98]';
const KBD =
  'ml-auto inline-flex items-center gap-0.5 rounded-sm bg-bg/60 px-1.5 py-0.5 font-mono text-[10px] text-faint';

function Stats({ s, reset }: { s: Stats; reset: () => void }) {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-[11px] text-muted">
      <span>
        react: <span className="font-mono text-fg">{s.reactClicks}</span>
      </span>
      <span>
        native: <span className="font-mono text-fg">{s.nativeClicks}</span>
      </span>
      <span>
        enters: <span className="font-mono text-fg">{s.enters}</span>
      </span>
      <span>
        target: <span className="font-mono text-fg">{s.lastTargetTag}</span>
      </span>
      <button
        type="button"
        onClick={reset}
        className="ml-auto rounded-sm bg-surface-soft px-1.5 py-0.5 text-[10px] hover:bg-bg"
      >
        reset
      </button>
    </div>
  );
}

function Card({
  id,
  title,
  desc,
  children,
}: {
  id: string;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <section className={CARD} data-variant={id}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-faint">{id}</span>
        <span className={TITLE}>{title}</span>
      </div>
      <p className={DESC}>{desc}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
   A — Baseline. Pure markup, relies only on the global CSS rule.
   ───────────────────────────────────────────────────────────────── */
function VariantA() {
  const { ref, stats, onReactClick, reset } = useStats<HTMLButtonElement>();
  return (
    <Card
      id="A"
      title="Baseline"
      desc="Plain <button> with svg + text + kbd. Relies entirely on the global pointer-events rule in globals.css."
    >
      <button ref={ref} type="button" onClick={onReactClick} className={BTN}>
        <Search size={14} aria-hidden />
        <span className="flex-1 text-left">Search anyone or anything…</span>
        <kbd className={KBD}>⌘K</kbd>
      </button>
      <Stats s={stats} reset={reset} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────
   B — Tailwind blast. [&_*]:pointer-events-none forces EVERY
       descendant (svg, spans, kbd) to be event-transparent.
   ───────────────────────────────────────────────────────────────── */
function VariantB() {
  const { ref, stats, onReactClick, reset } = useStats<HTMLButtonElement>();
  return (
    <Card
      id="B"
      title="Tailwind blast — [&_*]:pointer-events-none"
      desc="Every descendant of the button is forced pointer-events:none. Only the button itself catches the click. This is what shadcn/ui does."
    >
      <button
        ref={ref}
        type="button"
        onClick={onReactClick}
        className={`${BTN} [&_*]:pointer-events-none`}
      >
        <Search size={14} aria-hidden />
        <span className="flex-1 text-left">Search anyone or anything…</span>
        <kbd className={KBD}>⌘K</kbd>
      </button>
      <Stats s={stats} reset={reset} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────
   C — Per-child inline style. Same effect as B but each child sets
       pointerEvents: 'none' inline, immune to CSS-layer ordering.
   ───────────────────────────────────────────────────────────────── */
function VariantC() {
  const { ref, stats, onReactClick, reset } = useStats<HTMLButtonElement>();
  const off = { pointerEvents: 'none' as const };
  return (
    <Card
      id="C"
      title="Inline style on every child"
      desc="Each child carries style={pointerEvents: 'none'} directly. Bypasses every CSS cascade question."
    >
      <button ref={ref} type="button" onClick={onReactClick} className={BTN}>
        <Search size={14} aria-hidden style={off} />
        <span className="flex-1 text-left" style={off}>
          Search anyone or anything…
        </span>
        <kbd className={KBD} style={off}>
          ⌘K
        </kbd>
      </button>
      <Stats s={stats} reset={reset} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────
   D — Overlay button. Visual content is rendered with
       pointer-events:none; an empty, transparent <button> sits on
       top and catches all clicks. The visual layer is purely visual.
   ───────────────────────────────────────────────────────────────── */
function VariantD() {
  const { ref, stats, onReactClick, reset } = useStats<HTMLButtonElement>();
  return (
    <Card
      id="D"
      title="Overlay click target"
      desc="A transparent <button> is absolutely positioned over the visual content. The content has pointer-events:none — nothing inside it can intercept clicks."
    >
      <div className="relative inline-flex">
        <div className={`${BTN} pointer-events-none`}>
          <Search size={14} aria-hidden />
          <span className="flex-1 text-left">Search anyone or anything…</span>
          <kbd className={KBD}>⌘K</kbd>
        </div>
        <button
          ref={ref}
          type="button"
          aria-label="Search"
          onClick={onReactClick}
          className="absolute inset-0 cursor-pointer rounded-lg bg-transparent"
        />
      </div>
      <Stats s={stats} reset={reset} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────
   E — Native event listener only. No React onClick. Catches the
       click via addEventListener on the button element. Rules out
       React's synthetic-event delegation as the culprit.
   ───────────────────────────────────────────────────────────────── */
function VariantE() {
  const { ref, stats, reset } = useStats<HTMLButtonElement>();
  // No React onClick at all — native listener inside useStats fires.
  return (
    <Card
      id="E"
      title="Native addEventListener (no React onClick)"
      desc="Skips React's synthetic-event system entirely. If 'native' increments but 'react' doesn't, the bug lives in React event delegation, not CSS."
    >
      <button ref={ref} type="button" className={BTN}>
        <Search size={14} aria-hidden />
        <span className="flex-1 text-left">Search anyone or anything…</span>
        <kbd className={KBD}>⌘K</kbd>
      </button>
      <Stats s={stats} reset={reset} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────
   F — Capture-phase listener on the parent wrapper. Catches the
       click on the way DOWN, before it reaches any inner element.
       Useful when a child stops propagation.
   ───────────────────────────────────────────────────────────────── */
function VariantF() {
  const { ref, stats, onReactClick, reset } = useStats<HTMLDivElement>();
  return (
    <Card
      id="F"
      title="Capture-phase listener on wrapper"
      desc="The native listener is attached to the wrapper div in CAPTURE phase, so it fires before any descendant can stop propagation."
    >
      <div
        ref={ref}
        onClick={onReactClick}
        role="button"
        tabIndex={0}
        className={`${BTN} cursor-pointer`}
      >
        <Search size={14} aria-hidden />
        <span className="flex-1 text-left">Search anyone or anything…</span>
        <kbd className={KBD}>⌘K</kbd>
      </div>
      <Stats s={stats} reset={reset} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────
   G — Icon as CSS mask-image. No <svg> in the DOM at all — the
       icon is a div with the SVG path encoded into a mask.
       Removes the SVG hit-testing question entirely.
   ───────────────────────────────────────────────────────────────── */
function VariantG() {
  const { ref, stats, onReactClick, reset } = useStats<HTMLButtonElement>();
  // Lucide "search" path, encoded inline as a mask. No <svg> element.
  const maskSvg =
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><path d='m21 21-4.3-4.3'/></svg>\")";
  return (
    <Card
      id="G"
      title="Icon as CSS mask (no SVG in DOM)"
      desc="The Search icon is a <span> with a mask-image. There's no <svg> element to intercept events. The hit region is a plain div."
    >
      <button ref={ref} type="button" onClick={onReactClick} className={BTN}>
        <span
          aria-hidden
          className="inline-block h-3.5 w-3.5 shrink-0 bg-current"
          style={{
            maskImage: maskSvg,
            WebkitMaskImage: maskSvg,
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
          }}
        />
        <span className="flex-1 text-left">Search anyone or anything…</span>
        <kbd className={KBD}>⌘K</kbd>
      </button>
      <Stats s={stats} reset={reset} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────
   H — Hard reset. Forces pointer-events:auto on the button and
       :none on everything inside, with !important so no other rule
       can win. Combined with cursor:pointer !important.
   ───────────────────────────────────────────────────────────────── */
function VariantH() {
  const { ref, stats, onReactClick, reset } = useStats<HTMLButtonElement>();
  return (
    <Card
      id="H"
      title="!important hard reset"
      desc="pointer-events:auto !important on the button, pointer-events:none !important on every descendant, cursor:pointer !important. Last-resort sledgehammer."
    >
      <style>{`
        [data-variant='H'] button { pointer-events: auto !important; cursor: pointer !important; }
        [data-variant='H'] button * { pointer-events: none !important; }
      `}</style>
      <button ref={ref} type="button" onClick={onReactClick} className={BTN}>
        <Search size={14} aria-hidden />
        <span className="flex-1 text-left">Search anyone or anything…</span>
        <kbd className={KBD}>⌘K</kbd>
      </button>
      <Stats s={stats} reset={reset} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────
   I — Wrapped in WithTooltip. The HomeScreen header wraps its icon
       buttons in WithTooltip. If baseline works but this fails, the
       tooltip wrapper is the interceptor.
   ───────────────────────────────────────────────────────────────── */
function VariantI() {
  const { ref, stats, onReactClick, reset } = useStats<HTMLButtonElement>();
  return (
    <Card
      id="I"
      title="Wrapped in WithTooltip"
      desc="The same baseline button, but wrapped in the exact <WithTooltip> wrapper used by the HomeScreen header icons. If this breaks, the tooltip span is the culprit."
    >
      <WithTooltip label="Search" shortcut="cmd+K">
        <button ref={ref} type="button" onClick={onReactClick} className={BTN}>
          <Search size={14} aria-hidden />
          <span className="flex-1 text-left">Search anyone or anything…</span>
          <kbd className={KBD}>⌘K</kbd>
        </button>
      </WithTooltip>
      <Stats s={stats} reset={reset} />
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────
   J — Live click-stack inspector. Arms a global listener that runs
       even after you navigate away. Click anything on the broken
       page; the topmost element at the click point will appear in
       a fixed banner — and be saved here so you can come back and
       read it.
   ───────────────────────────────────────────────────────────────── */
function VariantJ() {
  const [armed, setArmed] = useState(false);
  const [last, setLast] = useState<ReturnType<typeof readLastClickCapture>>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem('reknowable:inspect-clicks');
      if (v === '1') setArmed(true);
      setLast(readLastClickCapture());
    } catch {
      // ignore
    }
  }, []);

  // Poll localStorage every second so navigating back from /home
  // surfaces the most-recent capture automatically.
  useEffect(() => {
    const id = setInterval(() => setLast(readLastClickCapture()), 1000);
    return () => clearInterval(id);
  }, []);

  const arm = (): void => {
    setClickInspectorArmed(true);
    setArmed(true);
  };
  const disarm = (): void => {
    setClickInspectorArmed(false);
    setArmed(false);
  };
  const clear = (): void => {
    try {
      window.localStorage.removeItem('reknowable:inspect-last');
    } catch {
      // ignore
    }
    setLast(null);
  };

  return (
    <Card
      id="J"
      title="Live click-stack inspector"
      desc="Arm the listener, then navigate to / (home) and click the broken icon. A fixed banner there will show the topmost element. The capture is also mirrored back here."
    >
      <div className="flex flex-wrap items-center gap-2">
        {armed ? (
          <button
            type="button"
            onClick={disarm}
            className="rounded-md bg-fg px-3 py-1.5 text-[12px] font-medium text-bg"
          >
            Disarm
          </button>
        ) : (
          <button
            type="button"
            onClick={arm}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-bg"
          >
            Arm inspector
          </button>
        )}
        <Link
          href="/"
          className="rounded-md bg-surface-soft px-3 py-1.5 text-[12px] text-fg hover:bg-bg"
        >
          Go to home →
        </Link>
        <button
          type="button"
          onClick={clear}
          className="ml-auto rounded-sm bg-surface-soft px-1.5 py-0.5 text-[10px] hover:bg-bg"
        >
          clear capture
        </button>
      </div>
      <div className="mt-3 rounded-md bg-surface-soft p-3 text-[11px] leading-relaxed">
        {last ? (
          <>
            <div className="mb-1 text-faint">
              ({last.x}, {last.y}) · {new Date(last.ts).toLocaleTimeString()}
            </div>
            <ol className="space-y-0.5 pl-5">
              {last.stack.map((e, i) => (
                <li key={i} className={i === 0 ? 'font-medium text-fg' : 'text-muted'}>
                  <span className="font-mono">{e.tag}</span>
                  {e.classes ? (
                    <span className="text-faint">
                      {' '}
                      .{e.classes.split(/\s+/).slice(0, 3).join('.')}
                    </span>
                  ) : null}
                  <span className="text-faint"> · pe={e.pointerEvents}</span>
                  {e.zIndex !== 'auto' ? <span className="text-faint"> · z={e.zIndex}</span> : null}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <span className="text-muted">
            No capture yet.{' '}
            {armed ? 'Arm is active — go click the broken button.' : 'Click "Arm inspector" first.'}
          </span>
        )}
      </div>
    </Card>
  );
}

export default function ButtonsLabPage() {
  return (
    <main className="min-h-screen bg-bg px-6 py-10 text-fg">
      <header className="mx-auto max-w-5xl">
        <h1 className="text-xl font-medium tracking-tight">Button clickability lab</h1>
        <p className="mt-2 max-w-[60ch] text-sm text-muted">
          Eight variants of the same icon button, each using a different technique. Click each
          button — once on the padding, once on the icon, once on the text, once on the{' '}
          <kbd className="font-mono">⌘K</kbd> kbd. The variant whose{' '}
          <span className="font-mono">react</span> + <span className="font-mono">native</span>{' '}
          counters increment on EVERY click is the fix. Tell me which letter wins.
        </p>
        <p className="mt-2 max-w-[60ch] text-[12px] text-faint">
          Tip: if <span className="font-mono">native</span> ticks but{' '}
          <span className="font-mono">react</span> doesn&apos;t, the bug is in React&apos;s event
          system. If neither ticks but <span className="font-mono">enters</span> does, something is
          eating the click between hover and click. If <span className="font-mono">target</span>{' '}
          shows <span className="font-mono">svg</span> or <span className="font-mono">path</span>,
          an icon is the interceptor.
        </p>
      </header>

      <div className="mx-auto mt-8 grid max-w-5xl gap-4 md:grid-cols-2">
        <VariantA />
        <VariantB />
        <VariantC />
        <VariantD />
        <VariantE />
        <VariantF />
        <VariantG />
        <VariantH />
        <VariantI />
        <VariantJ />
      </div>
    </main>
  );
}
