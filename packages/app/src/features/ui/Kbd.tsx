'use client';

import React from 'react';
import {
  Command,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react';

/**
 * Kbd — one keycap. The canonical kbd primitive across the whole app.
 *
 * Use cases:
 *   <Kbd>K</Kbd>                       — single key
 *   <Kbd keys={['cmd', 'K']} />        — multi-key combo (renders 2 caps + gap)
 *   <Kbd keys={['esc']} size="sm" />   — explicit size
 *   <Kbd tone="inverted">⌫</Kbd>       — when used on a dark background (e.g. the
 *                                        delete-undo toast which has a dark bg)
 *
 * Visual rules (the "polished kbd" spec):
 *   • Each cap is its own square-ish capsule with the SAME outer shape, so
 *     symbols (⌘) and letters (K) read at the same visual weight.
 *   • Combos have a small but visible gap between caps — the gap is what
 *     turns a string of glyphs into a recognizable shortcut.
 *   • Multi-char labels (Esc, Tab) get extra horizontal padding so they
 *     never look cramped; single chars settle into a 20-px square.
 *   • Font sizes by tier: 11 px (md) and 10 px (sm). The mono font does
 *     the rest — leading-none keeps the cap from looking tall.
 *   • Tone follows the surface: default tones for app surfaces, inverted
 *     tones (on-dark) for chips embedded in dark toasts / banners.
 *
 * Key name normalization (so callers can write what they think):
 *   cmd / meta            → ⌘
 *   ctrl / control        → ⌃
 *   alt / opt / option    → ⌥
 *   shift                 → ⇧
 *   enter / return        → ↵
 *   esc / escape          → Esc
 *   tab                   → ⇥
 *   backspace             → ⌫
 *   delete                → ⌦
 *   space                 → ␣
 *   up / down / left / right → ↑ ↓ ← →
 *   single char           → uppercased
 *   anything else (Esc, glyph already) → passed through
 */

/**
 * Visual glyph for a key — either a lucide icon (preferred when one
 * exists, because SVG icons render at a consistent visual weight that
 * matches a typographic letter) or a unicode character. Returns whichever
 * mode the caller should render: `{ icon: LucideIcon }` for icons,
 * `{ char: string }` for typographic characters.
 */
type Glyph = { icon: LucideIcon } | { char: string };

const ICON_GLYPH: Record<string, LucideIcon> = {
  cmd: Command,
  meta: Command,
  command: Command,
  enter: CornerDownLeft,
  return: CornerDownLeft,
  '↵': CornerDownLeft,
  '⌘': Command,
  up: ArrowUp,
  '↑': ArrowUp,
  down: ArrowDown,
  '↓': ArrowDown,
  left: ArrowLeft,
  '←': ArrowLeft,
  right: ArrowRight,
  '→': ArrowRight,
};

const CHAR_GLYPH: Record<string, string> = {
  ctrl: '⌃',
  control: '⌃',
  alt: '⌥',
  opt: '⌥',
  option: '⌥',
  shift: '⇧',
  esc: 'Esc',
  escape: 'Esc',
  tab: '⇥',
  backspace: '⌫',
  delete: '⌦',
  space: '␣',
};

function glyphFor(key: string): Glyph {
  const lower = key.toLowerCase().trim();
  if (lower in ICON_GLYPH) return { icon: ICON_GLYPH[lower] };
  if (key in ICON_GLYPH) return { icon: ICON_GLYPH[key] };
  if (lower in CHAR_GLYPH) return { char: CHAR_GLYPH[lower] };
  if (key.length === 1) return { char: key.toUpperCase() };
  return { char: key };
}

/**
 * Parse a shortcut written as a single string into individual key names.
 * Tolerates several common authorings:
 *   "⌘K"      → ["⌘", "K"]
 *   "⌘\\"     → ["⌘", "\\"]
 *   "Cmd+K"   → ["Cmd", "K"]
 *   "ctrl+/"  → ["ctrl", "/"]
 *   "↵"       → ["↵"]
 *   "?"       → ["?"]
 */
export function parseShortcut(s: string): string[] {
  if (s.includes('+'))
    return s
      .split('+')
      .map((p) => p.trim())
      .filter(Boolean);
  const MODS = new Set(['⌘', '⌃', '⌥', '⇧']);
  const out: string[] = [];
  let rest = s;
  while (rest.length && MODS.has(rest[0])) {
    out.push(rest[0]);
    rest = rest.slice(1);
  }
  if (rest) out.push(rest);
  return out;
}

export type KbdSize = 'sm' | 'md';
export type KbdTone = 'default' | 'inverted';

/**
 * Per-size visual spec:
 *   - cap: outer capsule classes (height, min-width for a single glyph,
 *     horizontal padding, font size)
 *   - icon: pixel size for lucide icon glyphs (matches the optical
 *     weight of a typographic letter at the same font size)
 *   - innerGap: space between glyphs inside a single 3+ key capsule
 *   - outerGap: space between separate caps in a 2-key combo
 */
type SizeSpec = {
  cap: string;
  icon: number;
  innerGap: string;
  outerGap: string;
};

const SIZE_SPEC: Record<KbdSize, SizeSpec> = {
  sm: {
    cap: 'h-[22px] min-w-[24px] px-[7px] text-[11px]',
    icon: 10,
    innerGap: 'gap-1',
    outerGap: 'gap-1.5',
  },
  md: {
    cap: 'h-6 min-w-[26px] px-2 text-[12px]',
    icon: 12,
    innerGap: 'gap-1',
    outerGap: 'gap-1.5',
  },
};

const TONE_CLASS: Record<KbdTone, string> = {
  default: 'bg-bg text-muted shadow-hairline-soft',
  inverted:
    'bg-[rgba(var(--color-bg-rgb)/0.15)] text-bg shadow-[inset_0_0_0_1px_rgba(var(--color-bg-rgb)/0.18)]',
};

export type KbdProps =
  | {
      children: React.ReactNode;
      keys?: never;
      size?: KbdSize;
      tone?: KbdTone;
      className?: string;
    }
  | {
      children?: never;
      keys: string[];
      size?: KbdSize;
      tone?: KbdTone;
      className?: string;
    };

/**
 * Render the cap contents based on whether the key resolved to an icon
 * or a typographic character. Used internally by Kbd when `keys` is
 * supplied; callers passing `children` get the raw children verbatim.
 */
function GlyphSpan({ glyph, iconSize }: { glyph: Glyph; iconSize: number }): React.ReactElement {
  if ('icon' in glyph) {
    const Icon = glyph.icon;
    return <Icon size={iconSize} aria-hidden strokeWidth={2.25} />;
  }
  return <span>{glyph.char}</span>;
}

/**
 * Render rules by key count (intentional):
 *   • 1 key  → single cap (e.g. Esc, n)
 *   • 2 keys → TWO separate caps with a small gap (e.g. ⌘ K, ⌘ ,) —
 *              modifier + symbol read as two distinct presses, and
 *              thin glyphs like "," stay clearly visible.
 *   • 3+ keys → ONE capsule with glyphs spaced inside (e.g. ⌘⇧O) —
 *              keeps the visual footprint compact when the combo
 *              chains multiple modifiers.
 *
 * The 2-key case used to collapse into one capsule too, but that made
 * thin punctuation glyphs (",", ".", "/") sit invisibly next to the ⌘
 * icon and read as a single-key shortcut. Two-cap layout for 2-key
 * combos restores legibility without paying the horizontal cost that
 * matters for 3-key combos.
 */
export function Kbd({
  children,
  keys,
  size = 'md',
  tone = 'default',
  className = '',
}: KbdProps): React.ReactElement {
  const spec = SIZE_SPEC[size];
  const capClasses = `inline-flex items-center justify-center rounded-[5px] font-mono font-semibold leading-none tracking-tight ${spec.cap} ${TONE_CLASS[tone]}`;

  if (keys && keys.length > 0) {
    // 2 keys → two separate caps. 3+ keys → one combined capsule.
    if (keys.length === 2) {
      return (
        <span className={`inline-flex items-center ${spec.outerGap} ${className}`}>
          {keys.map((k, i) => (
            <kbd key={`${i}-${k}`} className={capClasses}>
              <GlyphSpan glyph={glyphFor(k)} iconSize={spec.icon} />
            </kbd>
          ))}
        </span>
      );
    }
    return (
      <kbd className={`${capClasses} ${spec.innerGap} ${className}`}>
        {keys.map((k, i) => (
          <GlyphSpan key={`${i}-${k}`} glyph={glyphFor(k)} iconSize={spec.icon} />
        ))}
      </kbd>
    );
  }
  return <kbd className={`${capClasses} ${className}`}>{children}</kbd>;
}
