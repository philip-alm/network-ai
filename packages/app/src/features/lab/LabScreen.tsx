'use client';

/**
 * LabScreen — `/lab`. A design-directions playground.
 *
 * Rules:
 *   1. Each lane is self-contained. Tokens live inline as CSS variables
 *      scoped to its container so lanes don't bleed.
 *   2. The lab page wrapper is light, calm, and plain. The lanes are
 *      what you evaluate; the wrapper is the gallery wall.
 *   3. Mockup HTML lives in this file. No extracted production
 *      components yet — this is comparison, not architecture.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Plus,
  Search,
  Check,
  Settings,
  Bell,
  CornerDownLeft,
  X,
  TrendingUp,
  Users,
  Briefcase,
  Activity,
  Notebook,
  KeyRound,
  Trash2,
  MoreHorizontal,
  Filter,
  Mail,
  Edit3,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────
// Lane specs — each lane is a complete brand world.
// ─────────────────────────────────────────────────────────────────────

type LaneTokens = {
  bg: string;
  surface: string;
  'surface-soft': string;
  fg: string;
  muted: string;
  faint: string;
  border: string;
  'border-soft': string;
  accent: string;
  'accent-soft': string;
  'accent-on-bg': string; // text color to use on accent fills
};

type TagKind = 'neutral' | 'brand' | 'blue' | 'green' | 'amber';
type TagColors = Record<TagKind, { bg: string; fg: string }>;

type LaneId = 'operator-dark' | 'operator-light';

type Lane = {
  id: LaneId;
  name: string;
  oneLiner: string;
  influences: string;
  tokens: LaneTokens;
  tagColors: TagColors;
  isLight: boolean;
  type: {
    family: string;
    bodySize: string;
    bodyLeading: number;
    bodyTracking: string;
    titleTracking: string;
    densityLabel: string;
  };
  surface: {
    elevation: 'flat-tonal' | 'flat-hairline' | 'lifted-soft';
    borderRadius: string;
  };
};

const LANES: Lane[] = [
  {
    id: 'operator-dark',
    name: 'The Operator · Dark',
    oneLiner:
      'Linear-precise. Cool slate, near-monochrome, single muted violet that does one job per screen. Keyboard-first, compact, no chrome.',
    influences: 'Linear, Cron, Raycast',
    isLight: false,
    tokens: {
      bg: '#0E0F12',
      surface: '#16171B',
      'surface-soft': '#1B1C22',
      fg: '#E8E9EE',
      muted: '#8B8C95',
      faint: '#5E5F68',
      border: '#23252B',
      'border-soft': '#1D1E24',
      accent: '#8B8EFE',
      'accent-soft': '#22243A',
      'accent-on-bg': '#0E0F12',
    },
    tagColors: {
      neutral: { bg: '#1B1C22', fg: '#A0A1AB' },
      brand: { bg: '#22243A', fg: '#B0B2FF' },
      blue: { bg: '#16273D', fg: '#7FB1F5' },
      green: { bg: '#16271F', fg: '#7DC79A' },
      amber: { bg: '#2A2316', fg: '#D4A857' },
    },
    type: {
      family: "'Geist Sans', ui-sans-serif, system-ui, sans-serif",
      bodySize: '13px',
      bodyLeading: 1.5,
      bodyTracking: '-0.005em',
      titleTracking: '-0.011em',
      densityLabel: 'Compact — 13px body, 11px meta, tight rhythm',
    },
    surface: { elevation: 'flat-tonal', borderRadius: '6px' },
  },
  {
    id: 'operator-light',
    name: 'The Operator · Light',
    oneLiner:
      'Same direction, light surfaces. Off-white slate, deep cool ink, same muted violet anchored as the brand accent. Linear in daylight.',
    influences: 'Linear (light), Raycast (light), Vercel docs',
    isLight: true,
    tokens: {
      bg: '#FAFAFB',
      surface: '#F4F4F6',
      'surface-soft': '#ECECEF',
      fg: '#15171C',
      muted: '#5F616B',
      faint: '#9A9CA5',
      border: '#E5E5E9',
      'border-soft': '#EDEDF0',
      accent: '#5D60D3',
      'accent-soft': '#EBEBFB',
      'accent-on-bg': '#FAFAFB',
    },
    tagColors: {
      neutral: { bg: '#ECECEF', fg: '#5F616B' },
      brand: { bg: '#EBEBFB', fg: '#4F52C7' },
      blue: { bg: '#E5EEFC', fg: '#1F58BD' },
      green: { bg: '#E2EFE6', fg: '#1F6A3D' },
      amber: { bg: '#F4EAD3', fg: '#7B5510' },
    },
    type: {
      family: "'Geist Sans', ui-sans-serif, system-ui, sans-serif",
      bodySize: '13px',
      bodyLeading: 1.5,
      bodyTracking: '-0.005em',
      titleTracking: '-0.011em',
      densityLabel: 'Compact — 13px body, 11px meta, tight rhythm',
    },
    surface: { elevation: 'flat-tonal', borderRadius: '6px' },
  },
];

// ─────────────────────────────────────────────────────────────────────
// LabScreen — light wrapper, scrollable, with lane nav at top.
// ─────────────────────────────────────────────────────────────────────

export type LabScreenProps = {
  onBack: () => void;
};

const LAB_BG = '#F5F4F0';
const LAB_SURFACE = '#FAFAF7';
const LAB_FG = '#1F1D1A';
const LAB_MUTED = '#6B6862';
const LAB_FAINT = '#A19E96';
const LAB_BORDER = '#E5E2DA';

export function LabScreen({ onBack }: LabScreenProps) {
  return (
    <div
      style={{
        background: LAB_BG,
        color: LAB_FG,
        fontFamily: "'Geist Sans', ui-sans-serif, system-ui, sans-serif",
        minHeight: '100dvh',
      }}
    >
      <LabHeader onBack={onBack} />
      <main className="mx-auto w-full max-w-[1100px] px-6 pb-40 pt-20 sm:px-12">
        <Intro />
        <LaneNav />
        <div className="mt-24 space-y-32">
          {LANES.map((lane) => (
            <LanePanel key={lane.id} lane={lane} />
          ))}
        </div>
        <Footer />
      </main>
    </div>
  );
}

function LabHeader({ onBack }: { onBack: () => void }) {
  return (
    <div
      className="sticky top-0 z-30"
      style={{
        background: 'rgba(245, 244, 240, 0.85)',
        backdropFilter: 'saturate(180%) blur(8px)',
        borderBottom: `1px solid ${LAB_BORDER}`,
      }}
    >
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 px-6 py-3 sm:px-10">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors"
          style={{ color: LAB_MUTED }}
        >
          <ArrowLeft size={12} aria-hidden />
          Back to app
        </button>
        <span
          className="text-[10px] uppercase tracking-wider"
          style={{
            color: LAB_FAINT,
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            letterSpacing: '0.08em',
          }}
        >
          Design lab · internal
        </span>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="max-w-2xl">
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{
          color: LAB_FAINT,
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          letterSpacing: '0.08em',
        }}
      >
        Reknowable · design exploration
      </p>
      <h1
        className="mt-4 text-[2.5rem] font-medium leading-[1.05] tracking-[-0.03em]"
        style={{ color: LAB_FG }}
      >
        Three directions. Same product.
      </h1>
      <p
        className="mt-5 text-[16px] leading-relaxed"
        style={{ color: LAB_MUTED, maxWidth: '62ch' }}
      >
        Each lane is a self-contained brand world: palette, typography, density, surface treatment,
        and a set of full mockups end-to-end. A hero, a dashboard, a settings panel, the working app
        shell. Scroll through, see what reads right. The wrapper around the lanes stays plain on
        purpose; the lanes are what you evaluate.
      </p>
    </div>
  );
}

function LaneNav() {
  return (
    <nav className="mt-10 flex flex-wrap items-center gap-2" aria-label="Jump to lane">
      <span
        className="text-[10px] uppercase tracking-wider"
        style={{
          color: LAB_FAINT,
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          letterSpacing: '0.08em',
        }}
      >
        Jump
      </span>
      {LANES.map((lane) => (
        <a
          key={lane.id}
          href={`#lane-${lane.id}`}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors"
          style={{
            background: LAB_SURFACE,
            color: LAB_FG,
            border: `1px solid ${LAB_BORDER}`,
          }}
        >
          {lane.name}
        </a>
      ))}
    </nav>
  );
}

function Footer() {
  return (
    <div
      className="mt-24 border-t pt-8 text-sm"
      style={{ borderColor: LAB_BORDER, color: LAB_MUTED }}
    >
      <p>
        When one feels right, tell me which lane (or which pieces from each) and I&apos;ll rebuild
        the live app surfaces against it. Nothing here ships until you confirm a direction.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LanePanel — one full lane. Scoped CSS vars + many sub-sections.
// ─────────────────────────────────────────────────────────────────────

function LanePanel({ lane }: { lane: Lane }) {
  const style = laneStyle(lane);
  return (
    <section
      id={`lane-${lane.id}`}
      data-lane={lane.id}
      style={style}
      className="overflow-hidden rounded-[16px]"
    >
      <div
        className="px-8 py-14 sm:px-14 sm:py-20"
        style={{ background: 'var(--ln-bg)', color: 'var(--ln-fg)' }}
      >
        <LaneHeader lane={lane} />
        <LaneHero lane={lane} />
        <div className="mt-20 grid grid-cols-1 gap-x-14 gap-y-20 lg:grid-cols-[240px_1fr]">
          <LanePaletteAside lane={lane} />
          <div className="space-y-20">
            <LaneTypography lane={lane} />
            <LaneButtons />
            <LaneInteractions />
            <LaneInputs />
            <LaneDropdown />
            <LaneCards lane={lane} />
            <LaneDashboard lane={lane} />
            <LaneSettingsModal />
            <LaneEmptyState />
            <LaneAppShell lane={lane} />
          </div>
        </div>
      </div>
    </section>
  );
}

function laneStyle(lane: Lane): CSSProperties {
  return {
    '--ln-bg': lane.tokens.bg,
    '--ln-surface': lane.tokens.surface,
    '--ln-surface-soft': lane.tokens['surface-soft'],
    '--ln-fg': lane.tokens.fg,
    '--ln-muted': lane.tokens.muted,
    '--ln-faint': lane.tokens.faint,
    '--ln-border': lane.tokens.border,
    '--ln-border-soft': lane.tokens['border-soft'],
    '--ln-accent': lane.tokens.accent,
    '--ln-accent-soft': lane.tokens['accent-soft'],
    '--ln-accent-on-bg': lane.tokens['accent-on-bg'],
    '--ln-tag-neutral-bg': lane.tagColors.neutral.bg,
    '--ln-tag-neutral-fg': lane.tagColors.neutral.fg,
    '--ln-tag-brand-bg': lane.tagColors.brand.bg,
    '--ln-tag-brand-fg': lane.tagColors.brand.fg,
    '--ln-tag-blue-bg': lane.tagColors.blue.bg,
    '--ln-tag-blue-fg': lane.tagColors.blue.fg,
    '--ln-tag-green-bg': lane.tagColors.green.bg,
    '--ln-tag-green-fg': lane.tagColors.green.fg,
    '--ln-tag-amber-bg': lane.tagColors.amber.bg,
    '--ln-tag-amber-fg': lane.tagColors.amber.fg,
    '--ln-family': lane.type.family,
    '--ln-body-size': lane.type.bodySize,
    '--ln-body-leading': String(lane.type.bodyLeading),
    '--ln-body-tracking': lane.type.bodyTracking,
    '--ln-title-tracking': lane.type.titleTracking,
    // Custom easing curves (per Emil Kowalski's animation philosophy).
    // The built-in CSS easings are too weak; these have the snap that
    // makes interactions feel intentional. Use --ln-ease-out for
    // 95% of UI motion (enter, exit, button press). Use --ln-ease-in-out
    // for on-screen movement that has to settle.
    '--ln-ease-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
    '--ln-ease-in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
    '--ln-ease-drawer': 'cubic-bezier(0.32, 0.72, 0, 1)',
    boxShadow: `0 0 0 1px ${LAB_BORDER}, 0 24px 60px -32px rgba(0,0,0,0.18)`,
  } as CSSProperties;
}

// ─── Color primitives ────────────────────────────────────────────────

function Tag({ kind = 'neutral', children }: { kind?: TagKind; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-[4px] px-1.5 py-px text-[11px] font-medium"
      style={{
        background: `var(--ln-tag-${kind}-bg)`,
        color: `var(--ln-tag-${kind}-fg)`,
        fontFamily: 'var(--ln-family)',
        letterSpacing: '-0.005em',
      }}
    >
      {children}
    </span>
  );
}

/**
 * WarmthBar — 5 segments, fills proportional to warmth.
 * warmth 1 (closest) = 5 segments filled with accent.
 * warmth 5 (most distant) = 1 segment filled.
 * Tiny, dense, deliberate. The only colored visual on a row;
 * carries warmth without dots or pills.
 */
function WarmthBar({ warmth }: { warmth: number }) {
  const filled = Math.max(1, 6 - warmth);
  return (
    <span
      className="inline-flex items-center gap-[2px]"
      aria-label={`warmth ${warmth}`}
      title={`warmth ${warmth}`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="h-2 w-[3px] rounded-[1px]"
          style={{
            background: i <= filled ? 'var(--ln-accent)' : 'var(--ln-surface-soft)',
          }}
        />
      ))}
    </span>
  );
}

/**
 * Specular — cursor-tracking highlight overlay. Wraps any surface and
 * fades in a soft radial gradient at the cursor position on hover.
 * Uses `color-mix(var(--ln-fg))` so the highlight is naturally a
 * light wash on dark lanes and a dark wash on light lanes.
 *
 * Replaces the absolute-positioned blurred accent dots that used to
 * leak past card edges. The highlight stays inside the surface and
 * follows the pointer.
 */
function Specular({
  children,
  className = '',
  intensity = 8,
  size = 260,
  radius = '12px',
  hoverOnly = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** 0-100. How strong the highlight is at its peak (percent alpha). */
  intensity?: number;
  /** Diameter of the highlight in px. */
  size?: number;
  /** Border-radius of the overlay so it matches the parent. */
  radius?: string;
  /** If false, highlight is always visible (good for hero card). */
  hoverOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(!hoverOnly);

  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spec-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--spec-y', `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerEnter={hoverOnly ? () => setActive(true) : undefined}
      onPointerLeave={hoverOnly ? () => setActive(false) : undefined}
      className={`relative ${className}`}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(${size}px circle at var(--spec-x, 50%) var(--spec-y, -20%), color-mix(in oklch, var(--ln-fg) ${intensity}%, transparent), transparent 65%)`,
          opacity: active ? 1 : 0,
          transition: 'opacity 240ms var(--ln-ease-out)',
          borderRadius: radius,
        }}
      />
    </div>
  );
}

/**
 * SoftDivider — a 1px horizontal line that fades at the edges so it
 * doesn't read as a hard box. Used inside panels to separate the
 * header from the content below.
 */
function SoftDivider({ inset = 0 }: { inset?: number }) {
  return (
    <div
      aria-hidden
      style={{
        height: 1,
        marginLeft: inset,
        marginRight: inset,
        background:
          'linear-gradient(to right, transparent 0%, var(--ln-border) 12%, var(--ln-border) 88%, transparent 100%)',
        opacity: 0.7,
      }}
    />
  );
}

function LaneHeader({ lane }: { lane: Lane }) {
  return (
    <header className="flex flex-col gap-3">
      <span
        className="text-[10px] uppercase"
        style={{
          color: 'var(--ln-accent)',
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          letterSpacing: '0.12em',
        }}
      >
        {lane.id}
      </span>
      <h2
        className="text-[2rem] font-medium"
        style={{
          fontFamily: 'var(--ln-family)',
          letterSpacing: 'var(--ln-title-tracking)',
          lineHeight: 1.1,
        }}
      >
        {lane.name}
      </h2>
      <p
        className="max-w-[60ch]"
        style={{
          fontFamily: 'var(--ln-family)',
          fontSize: 'var(--ln-body-size)',
          lineHeight: 'var(--ln-body-leading)',
          letterSpacing: 'var(--ln-body-tracking)',
          color: 'var(--ln-muted)',
        }}
      >
        {lane.oneLiner}
      </p>
      <p
        className="text-[12px]"
        style={{ fontFamily: 'var(--ln-family)', color: 'var(--ln-faint)' }}
      >
        References: <span style={{ color: 'var(--ln-muted)' }}>{lane.influences}</span>
      </p>
    </header>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────

function LaneHero({ lane }: { lane: Lane }) {
  return (
    <div className="mt-14">
      <SectionLabel>Hero · landing moment</SectionLabel>
      <div
        className="overflow-hidden rounded-[14px]"
        style={{
          background: 'var(--ln-surface)',
          boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
        }}
      >
        <div className="grid grid-cols-1 gap-10 px-10 py-14 md:grid-cols-[1.4fr_1fr] md:gap-16 md:px-16 md:py-20">
          <div className="flex flex-col justify-center">
            <h3
              className="font-medium"
              style={{
                fontFamily: 'var(--ln-family)',
                fontSize: '2.75rem',
                lineHeight: 1.05,
                letterSpacing: '-0.022em',
                color: 'var(--ln-fg)',
              }}
            >
              Recall everyone you know.{' '}
              <span style={{ color: 'var(--ln-muted)' }}>The moment you need them.</span>
            </h3>
            <p
              className="mt-5 max-w-[48ch]"
              style={{
                fontFamily: 'var(--ln-family)',
                fontSize: '15px',
                lineHeight: 1.55,
                color: 'var(--ln-muted)',
              }}
            >
              A second brain for your network and everything they can offer. Ask who you know, what
              they have, who&apos;d fit. Operator-grade.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 text-[13px] font-medium transition-opacity"
                style={{
                  background: 'var(--ln-accent)',
                  color: 'var(--ln-accent-on-bg)',
                  fontFamily: 'var(--ln-family)',
                }}
              >
                Get started <ArrowRight size={12} aria-hidden />
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 text-[13px] font-medium transition-colors"
                style={{
                  background: 'transparent',
                  color: 'var(--ln-fg)',
                  border: '1px solid var(--ln-border)',
                  fontFamily: 'var(--ln-family)',
                }}
              >
                See it in action
              </button>
            </div>
            <p
              className="mt-5 text-[11px]"
              style={{ fontFamily: 'var(--ln-family)', color: 'var(--ln-faint)' }}
            >
              Free while in beta. No credit card.
            </p>
          </div>

          {/* Hero visual — clean recall demo with cursor-tracking
              specular highlight (no leaky halo). The demo answer
              mentions both a contact AND an asset to show Reknowable
              isn't just people.
              `self-start` so the Specular wrapper takes its child's
              height instead of stretching to match the taller left
              column — that was bleeding the highlight past the card. */}
          <Specular
            className="self-start"
            radius="12px"
            intensity={lane.isLight ? 5 : 7}
            size={320}
          >
            <div
              className="relative overflow-hidden rounded-[12px] p-6"
              style={{
                background: 'var(--ln-bg)',
                boxShadow: 'inset 0 0 0 1px var(--ln-border)',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--ln-family)',
                  fontSize: '15px',
                  lineHeight: 1.55,
                  color: 'var(--ln-muted)',
                }}
              >
                Who could help host a podcast in Stockholm next month?
              </p>
              <div
                className="my-5 h-px w-12"
                style={{ background: 'var(--ln-border)' }}
                aria-hidden
              />
              <p
                style={{
                  fontFamily: 'var(--ln-family)',
                  fontSize: '15px',
                  lineHeight: 1.6,
                  color: 'var(--ln-fg)',
                }}
              >
                Two paths. <Pill>Anna Svensson</Pill> in Göteborg has a <Pill>Podcast Studio</Pill>{' '}
                free Tuesdays. <Pill>Viktor Nord</Pill> in Stockholm has hosted three before.
              </p>
            </div>
          </Specular>
        </div>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-sm px-1.5 py-0.5 font-medium"
      style={{
        background: 'var(--ln-accent-soft)',
        color: 'var(--ln-accent)',
      }}
    >
      {children}
    </span>
  );
}

// ─── Palette ─────────────────────────────────────────────────────────

function LanePaletteAside({ lane }: { lane: Lane }) {
  const entries: Array<[keyof LaneTokens, string]> = [
    ['bg', 'Background'],
    ['surface', 'Surface'],
    ['surface-soft', 'Surface soft'],
    ['fg', 'Ink'],
    ['muted', 'Muted'],
    ['faint', 'Faint'],
    ['border', 'Border'],
    ['accent', 'Accent'],
    ['accent-soft', 'Accent wash'],
  ];
  return (
    <aside>
      <SectionLabel>Palette</SectionLabel>
      <p
        className="mb-4 text-[12px]"
        style={{ fontFamily: 'var(--ln-family)', color: 'var(--ln-faint)' }}
      >
        {lane.type.densityLabel}
      </p>
      <ul className="space-y-2">
        {entries.map(([key, label]) => (
          <li key={key} className="flex items-center gap-3">
            <span
              className="inline-block h-7 w-7 shrink-0 rounded-[5px]"
              style={{
                background: lane.tokens[key],
                boxShadow: 'inset 0 0 0 1px var(--ln-border)',
              }}
              aria-hidden
            />
            <span
              className="text-[12px] leading-none"
              style={{ fontFamily: 'var(--ln-family)', color: 'var(--ln-fg)' }}
            >
              {label}
            </span>
            <span
              className="ml-auto text-[11px] tabular-nums"
              style={{
                fontFamily: "'Geist Mono', ui-monospace, monospace",
                color: 'var(--ln-faint)',
              }}
            >
              {lane.tokens[key]}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// ─── Typography ──────────────────────────────────────────────────────

function LaneTypography({ lane }: { lane: Lane }) {
  return (
    <div>
      <SectionLabel>Typography</SectionLabel>
      <div
        className="space-y-6 rounded-[10px] p-7"
        style={{
          background: 'var(--ln-surface)',
          fontFamily: 'var(--ln-family)',
          color: 'var(--ln-fg)',
          boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
        }}
      >
        <TypeRow specLabel={`Display · 32 / 1.1 / ${lane.type.titleTracking}`}>
          <p
            className="font-medium"
            style={{
              fontSize: '2rem',
              lineHeight: 1.1,
              letterSpacing: 'var(--ln-title-tracking)',
            }}
          >
            Recall, on demand.
          </p>
        </TypeRow>
        <TypeRow specLabel="Title · 18 / 1.4">
          <p
            className="font-medium"
            style={{
              fontSize: '18px',
              lineHeight: 1.4,
              letterSpacing: 'var(--ln-title-tracking)',
            }}
          >
            Anna Svensson · Göteborg
          </p>
        </TypeRow>
        <TypeRow specLabel={`Body · ${lane.type.bodySize} / ${lane.type.bodyLeading}`}>
          <p
            style={{
              fontSize: 'var(--ln-body-size)',
              lineHeight: 'var(--ln-body-leading)',
              letterSpacing: 'var(--ln-body-tracking)',
              color: 'var(--ln-muted)',
              maxWidth: '60ch',
            }}
          >
            Met at the Stockholm AI dinner, Q1 2026. Hardware background. Owns a podcast studio in
            Göteborg that we can book on short notice. Warm and quick to respond.
          </p>
        </TypeRow>
        <TypeRow specLabel="Label · 11 / 0.06em uppercase">
          <p
            className="font-medium uppercase"
            style={{
              fontSize: '11px',
              letterSpacing: '0.06em',
              color: 'var(--ln-muted)',
            }}
          >
            Contacts · Assets · Notes
          </p>
        </TypeRow>
        <TypeRow specLabel="Mono · 12 / IDs, timings">
          <p
            style={{
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: '12px',
              color: 'var(--ln-muted)',
            }}
          >
            saved · 220ms ago
          </p>
        </TypeRow>
      </div>
    </div>
  );
}

function TypeRow({ specLabel, children }: { specLabel: string; children: React.ReactNode }) {
  return (
    <div>
      <span
        className="block text-[10px] uppercase tracking-wider"
        style={{
          color: 'var(--ln-faint)',
          letterSpacing: '0.08em',
          fontFamily: "'Geist Mono', ui-monospace, monospace",
        }}
      >
        {specLabel}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────

function LaneButtons() {
  return (
    <div>
      <SectionLabel>Buttons</SectionLabel>
      <div
        className="flex flex-wrap items-center gap-3 rounded-[10px] p-7"
        style={{
          background: 'var(--ln-surface)',
          boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
        }}
      >
        <LanePrimary>Add contact</LanePrimary>
        <LaneSecondary>
          <Plus size={12} aria-hidden /> Asset
        </LaneSecondary>
        <LaneGhost>Cancel</LaneGhost>
        <LaneDanger>Delete</LaneDanger>
        <LaneAccent>
          <CornerDownLeft size={11} aria-hidden /> Send
        </LaneAccent>
      </div>
    </div>
  );
}

// All button variants share the same press feedback + transition spec.
// transform 160ms via the custom ease-out curve, scale 0.97 on :active.
// These are inline so each button stays self-contained for the lab.
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium select-none transition-transform duration-[160ms] active:scale-[0.95]';
const BUTTON_STYLE_BASE: CSSProperties = {
  fontFamily: 'var(--ln-family)',
  transitionTimingFunction: 'var(--ln-ease-out)',
  WebkitTapHighlightColor: 'transparent',
};

function LanePrimary({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={BUTTON_BASE}
      style={{
        ...BUTTON_STYLE_BASE,
        background: 'var(--ln-fg)',
        color: 'var(--ln-bg)',
      }}
    >
      {children}
    </button>
  );
}

function LaneSecondary({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={BUTTON_BASE}
      style={{
        ...BUTTON_STYLE_BASE,
        background: 'var(--ln-surface-soft)',
        color: 'var(--ln-fg)',
        boxShadow: 'inset 0 0 0 1px var(--ln-border)',
      }}
    >
      {children}
    </button>
  );
}

function LaneGhost({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={BUTTON_BASE}
      style={{
        ...BUTTON_STYLE_BASE,
        background: 'transparent',
        color: 'var(--ln-muted)',
      }}
    >
      {children}
    </button>
  );
}

function LaneDanger({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={BUTTON_BASE}
      style={{
        ...BUTTON_STYLE_BASE,
        background: 'transparent',
        color: '#E5484D',
        boxShadow: 'inset 0 0 0 1px rgba(229, 72, 77, 0.25)',
      }}
    >
      {children}
    </button>
  );
}

function LaneAccent({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={BUTTON_BASE}
      style={{
        ...BUTTON_STYLE_BASE,
        background: 'var(--ln-accent)',
        color: 'var(--ln-accent-on-bg)',
      }}
    >
      {children}
    </button>
  );
}

// ─── Interactions & Feedback ─────────────────────────────────────────
// Working demos of the principles from emil-design-eng:
//   - Press feedback: scale(0.95) on :active with custom ease-out
//   - Loading button: state transitions with proper perceived speed
//   - Hold-to-delete: slow press (2s linear), fast release (200ms ease-out)
//   - Tooltip: origin-aware scale-in, skip-delay on subsequent hovers
//   - Toast: enter from below with ease-out, auto-dismiss
// All demos are scoped per-lane via the CSS variable context.

function LaneInteractions() {
  return (
    <div>
      <SectionLabel>Interactions & feedback · click to try</SectionLabel>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DemoCard title="Press feedback" caption="scale 0.97 on :active, 160ms ease-out">
          <PressDemo />
        </DemoCard>
        <DemoCard title="Loading button" caption="state transitions feel snappy">
          <LoadingButtonDemo />
        </DemoCard>
        <DemoCard title="Hold to delete" caption="slow press, fast release (asymmetric)">
          <HoldToDeleteDemo />
        </DemoCard>
        <DemoCard title="Tooltip" caption="hover the icons; second pops instantly">
          <TooltipDemo />
        </DemoCard>
        <DemoCard title="Toast" caption="enters from below, auto-dismisses, swipe-feel" full>
          <ToastDemo />
        </DemoCard>
      </div>
    </div>
  );
}

function DemoCard({
  title,
  caption,
  full,
  children,
}: {
  title: string;
  caption: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-[10px] p-7 ${full ? 'md:col-span-2' : ''}`}
      style={{
        background: 'var(--ln-surface)',
        boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
      }}
    >
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h4
          className="font-medium"
          style={{
            color: 'var(--ln-fg)',
            fontFamily: 'var(--ln-family)',
            fontSize: '13px',
            letterSpacing: 'var(--ln-title-tracking)',
          }}
        >
          {title}
        </h4>
        <span
          className="text-[11px]"
          style={{
            color: 'var(--ln-faint)',
            fontFamily: 'var(--ln-family)',
          }}
        >
          {caption}
        </span>
      </div>
      {children}
    </div>
  );
}

// ─── Press demo ──────────────────────────────────────────────────────

function PressDemo() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PressedButton scale={0.99} label="0.99" />
      <PressedButton scale={0.97} label="0.97" />
      <PressedButton scale={0.95} label="0.95" />
      <PressedButton scale={0.9} label="0.90 (too much)" />
    </div>
  );
}

function PressedButton({ scale, label }: { scale: number; label: string }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium select-none"
      style={{
        background: 'var(--ln-bg)',
        color: 'var(--ln-fg)',
        boxShadow: 'inset 0 0 0 1px var(--ln-border)',
        fontFamily: 'var(--ln-family)',
        transform: pressed ? `scale(${scale})` : 'scale(1)',
        transition: 'transform 160ms var(--ln-ease-out)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  );
}

// ─── Loading button ──────────────────────────────────────────────────

type LoadState = 'idle' | 'loading' | 'success';

function LoadingButtonDemo() {
  const [state, setState] = useState<LoadState>('idle');

  const trigger = (): void => {
    if (state !== 'idle') return;
    setState('loading');
    setTimeout(() => setState('success'), 1200);
    setTimeout(() => setState('idle'), 2400);
  };

  const label = state === 'idle' ? 'Add contact' : state === 'loading' ? 'Adding' : 'Added';
  const Icon = state === 'loading' ? null : state === 'success' ? Check : Plus;

  return (
    <button
      type="button"
      onClick={trigger}
      disabled={state !== 'idle'}
      className="inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium select-none"
      style={{
        background: state === 'success' ? 'var(--ln-tag-green-bg)' : 'var(--ln-accent)',
        color: state === 'success' ? 'var(--ln-tag-green-fg)' : 'var(--ln-accent-on-bg)',
        fontFamily: 'var(--ln-family)',
        transition:
          'transform 160ms var(--ln-ease-out), background 220ms var(--ln-ease-out), color 220ms var(--ln-ease-out)',
        WebkitTapHighlightColor: 'transparent',
      }}
      onPointerDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.95)';
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {state === 'loading' ? (
        <span
          className="inline-block h-3 w-3 animate-spin rounded-full"
          style={{
            border: '1.5px solid var(--ln-accent-on-bg)',
            borderTopColor: 'transparent',
            opacity: 0.7,
          }}
          aria-hidden
        />
      ) : Icon ? (
        <Icon size={12} aria-hidden />
      ) : null}
      <span style={{ minWidth: '60px', textAlign: 'left' }}>{label}</span>
    </button>
  );
}

// ─── Hold to delete ──────────────────────────────────────────────────

function HoldToDeleteDemo() {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const holdDuration = 1500; // 1.5s for demo; in prod use 2s

  const tick = (): void => {
    const elapsed = performance.now() - startRef.current;
    const p = Math.min(1, elapsed / holdDuration);
    setProgress(p);
    if (p >= 1) {
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setProgress(0);
      }, 1600);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const start = (): void => {
    if (done) return;
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  };

  const release = (): void => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (!done) {
      // Fast snap-back (200ms ease-out). The press is slow; the release is fast.
      const startProgress = progress;
      const startTime = performance.now();
      const snap = (): void => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / 200);
        // Cubic ease-out approximation
        const eased = 1 - Math.pow(1 - t, 3);
        setProgress(startProgress * (1 - eased));
        if (t < 1) requestAnimationFrame(snap);
      };
      requestAnimationFrame(snap);
    }
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onPointerDown={start}
        onPointerUp={release}
        onPointerLeave={release}
        className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-md px-3.5 py-2 text-[12px] font-medium select-none"
        style={{
          background: 'var(--ln-bg)',
          color: done ? '#FFF' : '#E5484D',
          boxShadow: 'inset 0 0 0 1px rgba(229, 72, 77, 0.3)',
          fontFamily: 'var(--ln-family)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* Clip-path overlay that fills as user holds. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: '#E5484D',
            clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
          }}
        />
        <span className="relative inline-flex items-center gap-1.5">
          <Trash2 size={11} aria-hidden />
          {done ? 'Deleted' : 'Hold to delete'}
        </span>
      </button>
      <span
        className="text-[11px]"
        style={{ color: 'var(--ln-faint)', fontFamily: 'var(--ln-family)' }}
      >
        {done ? 'Released' : progress > 0 ? `${Math.round(progress * 100)}%` : ''}
      </span>
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────
// Shared tooltip primitive. Wrap any element to give it a tooltip.
// Skip-delay on subsequent tooltips (within 500ms of the last) so a
// toolbar feels instant on the second hover.

const TOOLTIP_GAP_MS = 500;
const TOOLTIP_GLOBAL_LAST = { ref: 0 };

function WithTooltip({
  label,
  shortcut,
  side = 'bottom',
  children,
}: {
  label: string;
  shortcut?: string;
  side?: 'top' | 'bottom';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEnter = (): void => {
    const sinceLast = Date.now() - TOOLTIP_GLOBAL_LAST.ref;
    const skip = sinceLast < TOOLTIP_GAP_MS;
    setInstant(skip);
    if (skip) {
      setOpen(true);
      return;
    }
    timerRef.current = setTimeout(() => setOpen(true), 350);
  };
  const onLeave = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setOpen(false);
    TOOLTIP_GLOBAL_LAST.ref = Date.now();
  };

  const sideClass = side === 'top' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]';
  const transformOrigin = side === 'top' ? 'bottom center' : 'top center';
  const enterTranslate = side === 'top' ? '2px' : '-2px';

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {children}
      <span
        aria-hidden
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] ${sideClass}`}
        style={{
          background: 'var(--ln-fg)',
          color: 'var(--ln-bg)',
          fontFamily: 'var(--ln-family)',
          transformOrigin,
          transform: open ? 'scale(1) translateY(0)' : `scale(0.94) translateY(${enterTranslate})`,
          opacity: open ? 1 : 0,
          transition: instant
            ? 'none'
            : 'transform 140ms var(--ln-ease-out), opacity 140ms var(--ln-ease-out)',
        }}
      >
        <span>{label}</span>
        {shortcut ? (
          <span
            style={{
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              opacity: 0.55,
              fontSize: '10px',
              letterSpacing: '0.04em',
            }}
          >
            {shortcut}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function TooltipDemo() {
  const actions: Array<{ Icon: typeof Plus; label: string; shortcut?: string }> = [
    { Icon: Plus, label: 'Add contact', shortcut: 'C' },
    { Icon: Search, label: 'Find', shortcut: '⌘K' },
    { Icon: Settings, label: 'Settings', shortcut: '⌘,' },
    { Icon: Trash2, label: 'Delete', shortcut: '⌫' },
  ];
  return (
    <div className="inline-flex items-center gap-1">
      {actions.map((a) => (
        <WithTooltip key={a.label} label={a.label} shortcut={a.shortcut}>
          <TooltipDemoButton Icon={a.Icon} ariaLabel={a.label} />
        </WithTooltip>
      ))}
    </div>
  );
}

function TooltipDemoButton({ Icon, ariaLabel }: { Icon: typeof Plus; ariaLabel: string }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md select-none"
      style={{
        background: 'var(--ln-bg)',
        color: 'var(--ln-fg)',
        boxShadow: 'inset 0 0 0 1px var(--ln-border)',
        transition: 'transform 160ms var(--ln-ease-out)',
        WebkitTapHighlightColor: 'transparent',
      }}
      onPointerDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.95)';
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <Icon size={13} aria-hidden />
    </button>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────

type ToastKind = 'success' | 'info' | 'danger';
type ToastMsg = { id: number; kind: ToastKind; text: string };

function ToastDemo() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const idRef = useRef(1);

  const push = (kind: ToastKind, text: string): void => {
    const id = idRef.current++;
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <ToastTriggerBtn onClick={() => push('success', 'Added Anna Svensson · warmth 1')}>
          Trigger success
        </ToastTriggerBtn>
        <ToastTriggerBtn onClick={() => push('info', 'Reconnecting. Attempt 1.')}>
          Trigger info
        </ToastTriggerBtn>
        <ToastTriggerBtn onClick={() => push('danger', "Couldn't reach the server. Try again.")}>
          Trigger error
        </ToastTriggerBtn>
      </div>

      <div
        className="relative mt-4 overflow-hidden rounded-[10px]"
        style={{
          background: 'var(--ln-bg)',
          boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
          minHeight: 140,
        }}
      >
        <p
          className="px-4 py-3 text-[11px]"
          style={{
            color: 'var(--ln-faint)',
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            letterSpacing: '0.08em',
          }}
        >
          TOAST AREA · LAB-SCOPED
        </p>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-3 pb-3">
          <AnimatePresence initial={false}>
            {toasts.map((t) => (
              <ToastPill
                key={t.id}
                toast={t}
                onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function ToastTriggerBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium select-none"
      style={{
        background: 'var(--ln-surface-soft)',
        color: 'var(--ln-fg)',
        boxShadow: 'inset 0 0 0 1px var(--ln-border)',
        fontFamily: 'var(--ln-family)',
        transition: 'transform 160ms var(--ln-ease-out)',
        WebkitTapHighlightColor: 'transparent',
      }}
      onPointerDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.95)';
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {children}
    </button>
  );
}

function ToastPill({ toast, onDismiss }: { toast: ToastMsg; onDismiss: () => void }) {
  const kindMap: Record<ToastKind, { Icon: typeof Plus; tag: TagKind }> = {
    success: { Icon: Check, tag: 'green' },
    info: { Icon: TrendingUp, tag: 'brand' },
    danger: { Icon: X, tag: 'amber' },
  };
  const { Icon, tag } = kindMap[toast.kind];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{
        type: 'spring',
        duration: 0.5,
        bounce: 0.2,
      }}
      className="pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-[10px] px-3 py-2"
      style={{
        background: 'var(--ln-surface)',
        boxShadow: '0 0 0 1px var(--ln-border), 0 10px 24px -12px rgba(0,0,0,0.5)',
      }}
      role="status"
    >
      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{
          background: `var(--ln-tag-${tag}-bg)`,
          color: `var(--ln-tag-${tag}-fg)`,
        }}
        aria-hidden
      >
        <Icon size={11} />
      </span>
      <span
        className="flex-1 text-[12px]"
        style={{
          color: 'var(--ln-fg)',
          fontFamily: 'var(--ln-family)',
        }}
      >
        {toast.text}
      </span>
      <WithTooltip label="Dismiss" side="top">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm"
          style={{
            color: 'var(--ln-faint)',
            transition: 'background 160ms var(--ln-ease-out), color 160ms var(--ln-ease-out)',
          }}
        >
          <X size={10} aria-hidden />
        </button>
      </WithTooltip>
    </motion.div>
  );
}

// ─── Inputs ──────────────────────────────────────────────────────────

function LaneInputs() {
  return (
    <div>
      <SectionLabel>Inputs</SectionLabel>
      <div
        className="space-y-5 rounded-[10px] p-7"
        style={{
          background: 'var(--ln-surface)',
          boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
        }}
      >
        <LaneTextField label="Name" placeholder="Anna Svensson" />
        <LaneTextArea
          label="Notes"
          placeholder="Met at the Stockholm AI dinner. Owns a podcast studio."
        />
        <LaneSearchField placeholder="Find a contact, an asset, anything you've remembered." />
      </div>
    </div>
  );
}

function LaneTextField({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block">
      <span
        className="block text-[10px] uppercase tracking-wider"
        style={{
          color: 'var(--ln-faint)',
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </span>
      <input
        type="text"
        placeholder={placeholder}
        className="mt-1.5 block w-full rounded-md outline-none transition-shadow"
        style={{
          background: 'var(--ln-bg)',
          color: 'var(--ln-fg)',
          fontFamily: 'var(--ln-family)',
          fontSize: 'var(--ln-body-size)',
          padding: '0.5rem 0.75rem',
          boxShadow: 'inset 0 0 0 1px var(--ln-border)',
        }}
      />
    </label>
  );
}

function LaneTextArea({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block">
      <span
        className="block text-[10px] uppercase tracking-wider"
        style={{
          color: 'var(--ln-faint)',
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </span>
      <textarea
        rows={3}
        placeholder={placeholder}
        className="mt-1.5 block w-full resize-none rounded-md outline-none"
        style={{
          background: 'var(--ln-bg)',
          color: 'var(--ln-fg)',
          fontFamily: 'var(--ln-family)',
          fontSize: 'var(--ln-body-size)',
          padding: '0.625rem 0.75rem',
          lineHeight: 'var(--ln-body-leading)',
          boxShadow: 'inset 0 0 0 1px var(--ln-border)',
        }}
      />
    </label>
  );
}

function LaneSearchField({ placeholder }: { placeholder: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-md"
      style={{
        background: 'var(--ln-bg)',
        padding: '0.5rem 0.75rem',
        boxShadow: 'inset 0 0 0 1px var(--ln-border)',
      }}
    >
      <Search size={13} aria-hidden style={{ color: 'var(--ln-faint)' }} />
      <input
        type="text"
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none"
        style={{
          color: 'var(--ln-fg)',
          fontFamily: 'var(--ln-family)',
          fontSize: 'var(--ln-body-size)',
        }}
      />
      <span
        className="text-[10px] tabular-nums"
        style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          color: 'var(--ln-faint)',
        }}
      >
        ⌘K
      </span>
    </div>
  );
}

// ─── Dropdown ────────────────────────────────────────────────────────

function LaneDropdown() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('Warmth 2 · WhatsApp');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const options = [
    'Warmth 1 · closest, would do anything',
    'Warmth 2 · WhatsApp',
    'Warmth 3 · solid professional contact',
    'Warmth 4 · would respond if I asked',
    'Warmth 5 · might respond',
  ];

  return (
    <div>
      <SectionLabel>Dropdown · click to open</SectionLabel>
      <div
        className="rounded-[10px] p-7"
        style={{
          background: 'var(--ln-surface)',
          boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
        }}
      >
        <div className="relative inline-block" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="inline-flex min-w-[300px] items-center justify-between gap-3 rounded-md text-left"
            style={{
              background: 'var(--ln-bg)',
              color: 'var(--ln-fg)',
              fontFamily: 'var(--ln-family)',
              fontSize: 'var(--ln-body-size)',
              padding: '0.5rem 0.75rem',
              boxShadow: 'inset 0 0 0 1px var(--ln-border)',
            }}
          >
            <span>{value}</span>
            <ChevronDown
              size={12}
              aria-hidden
              style={{
                color: 'var(--ln-faint)',
                transform: open ? 'rotate(180deg)' : 'none',
                transition: 'transform 120ms cubic-bezier(0.25, 1, 0.5, 1)',
              }}
            />
          </button>
          {open ? (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-md py-1"
              style={{
                background: 'var(--ln-surface)',
                boxShadow: '0 0 0 1px var(--ln-border), 0 12px 32px -8px rgba(0,0,0,0.5)',
              }}
            >
              {options.map((opt) => {
                const selected = opt === value;
                return (
                  <li key={opt}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setValue(opt);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px]"
                      style={{
                        background: selected ? 'var(--ln-accent-soft)' : 'transparent',
                        color: selected ? 'var(--ln-accent)' : 'var(--ln-fg)',
                        fontFamily: 'var(--ln-family)',
                      }}
                    >
                      <Check
                        size={11}
                        aria-hidden
                        style={{
                          opacity: selected ? 1 : 0,
                          color: 'var(--ln-accent)',
                        }}
                      />
                      <span className="flex-1">{opt}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Cards ───────────────────────────────────────────────────────────

function LaneCards({ lane }: { lane: Lane }) {
  return (
    <div>
      <SectionLabel>Cards · three depth treatments</SectionLabel>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <LaneCard
          treatment="Flat · tonal only"
          boxShadow="none"
          name="Viktor Nord"
          body="Hardware founder. Owns a podcast studio in Göteborg."
        />
        <LaneCard
          treatment="Hairline ring"
          boxShadow="inset 0 0 0 1px var(--ln-border-soft)"
          name="Anna Svensson"
          body="Met at Stockholm AI dinner. Investor at a hardware fund."
        />
        <LaneCard
          treatment="Lifted · soft shadow"
          boxShadow={
            lane.isLight
              ? '0 0 0 1px var(--ln-border-soft), 0 6px 16px -8px rgba(0,0,0,0.08)'
              : '0 0 0 1px var(--ln-border-soft), 0 8px 24px -12px rgba(0,0,0,0.6)'
          }
          name="Bo Larsson"
          body="Investor focus on fintech. Quick to respond when introduced warm."
        />
      </div>
    </div>
  );
}

function LaneCard({
  treatment,
  boxShadow,
  name,
  body,
}: {
  treatment: string;
  boxShadow: string;
  name: string;
  body: string;
}) {
  return (
    <Specular radius="10px" intensity={6} size={220}>
      <article
        className="relative overflow-hidden rounded-[10px] p-6"
        style={{ background: 'var(--ln-surface)', boxShadow }}
      >
        <p
          className="text-[10px] uppercase tracking-wider"
          style={{
            color: 'var(--ln-faint)',
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            letterSpacing: '0.08em',
          }}
        >
          {treatment}
        </p>
        <h3
          className="mt-1.5 font-medium"
          style={{
            color: 'var(--ln-fg)',
            fontFamily: 'var(--ln-family)',
            fontSize: '15px',
            letterSpacing: 'var(--ln-title-tracking)',
          }}
        >
          {name}
        </h3>
        <p
          className="mt-1"
          style={{
            color: 'var(--ln-muted)',
            fontFamily: 'var(--ln-family)',
            fontSize: '12px',
            lineHeight: 1.55,
          }}
        >
          {body}
        </p>
      </article>
    </Specular>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────

function LaneDashboard({ lane }: { lane: Lane }) {
  const stats = [
    { label: 'Total contacts', value: '247', delta: '+12 this month', Icon: Users },
    { label: 'Assets in network', value: '38', delta: '6 added recently', Icon: Briefcase },
    {
      label: 'Recall events',
      value: '94',
      delta: '+22% vs last month',
      Icon: Activity,
      accent: true,
    },
  ];

  const activity: Array<{
    kind: 'added' | 'updated' | 'edited' | 'deleted';
    who: string;
    what: string;
    when: string;
  }> = [
    { kind: 'added', who: 'Anna Svensson', what: 'Asset added · Podcast Studio', when: '2h ago' },
    { kind: 'updated', who: 'Viktor Nord', what: 'Warmth updated · 2', when: '5h ago' },
    { kind: 'edited', who: 'Elin Karlsson', what: 'Notes refined', when: 'yesterday' },
    { kind: 'added', who: 'Bo Larsson', what: 'New contact added', when: 'yesterday' },
  ];

  const activityIcon = (kind: (typeof activity)[number]['kind']): typeof Plus => {
    if (kind === 'added') return Plus;
    if (kind === 'updated') return TrendingUp;
    if (kind === 'edited') return Edit3;
    return Trash2;
  };
  const activityKindColor = (kind: (typeof activity)[number]['kind']): TagKind => {
    if (kind === 'added') return 'green';
    if (kind === 'updated') return 'brand';
    if (kind === 'edited') return 'amber';
    return 'neutral';
  };

  return (
    <div>
      <SectionLabel>Dashboard · multi-card layout</SectionLabel>
      <div
        className="rounded-[10px] p-7"
        style={{
          background: 'var(--ln-surface)',
          boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
        }}
      >
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h3
              className="font-medium"
              style={{
                color: 'var(--ln-fg)',
                fontFamily: 'var(--ln-family)',
                fontSize: '20px',
                letterSpacing: 'var(--ln-title-tracking)',
              }}
            >
              Overview
            </h3>
            <p
              className="mt-0.5 text-[12px]"
              style={{ color: 'var(--ln-muted)', fontFamily: 'var(--ln-family)' }}
            >
              Your network at a glance.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px]"
            style={{
              background: 'var(--ln-surface-soft)',
              color: 'var(--ln-fg)',
              fontFamily: 'var(--ln-family)',
            }}
          >
            <Filter size={11} aria-hidden /> Last 30 days
            <ChevronDown size={11} aria-hidden style={{ color: 'var(--ln-faint)' }} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {stats.map((stat) => {
            const lifted = lane.surface.elevation === 'lifted-soft';
            return (
              <Specular key={stat.label} radius="10px" intensity={5} size={180}>
                <div
                  className="relative overflow-hidden rounded-[10px] p-5"
                  style={{
                    background: 'var(--ln-bg)',
                    boxShadow: lifted
                      ? '0 0 0 1px var(--ln-border-soft), 0 4px 12px -6px rgba(0,0,0,0.4)'
                      : 'inset 0 0 0 1px var(--ln-border-soft)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      style={{
                        color: 'var(--ln-muted)',
                        fontFamily: 'var(--ln-family)',
                        fontSize: '12px',
                      }}
                    >
                      {stat.label}
                    </span>
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-md"
                      style={{
                        background: stat.accent
                          ? 'var(--ln-accent-soft)'
                          : 'var(--ln-surface-soft)',
                        color: stat.accent ? 'var(--ln-accent)' : 'var(--ln-muted)',
                      }}
                    >
                      <stat.Icon size={10} aria-hidden />
                    </span>
                  </div>
                  <p
                    className="mt-3 font-medium tabular-nums"
                    style={{
                      color: 'var(--ln-fg)',
                      fontFamily: 'var(--ln-family)',
                      fontSize: '28px',
                      lineHeight: 1.1,
                      letterSpacing: 'var(--ln-title-tracking)',
                    }}
                  >
                    {stat.value}
                  </p>
                  <p
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px]"
                    style={{
                      color: stat.accent ? 'var(--ln-accent)' : 'var(--ln-muted)',
                      fontFamily: 'var(--ln-family)',
                    }}
                  >
                    {stat.accent ? <TrendingUp size={10} aria-hidden /> : null}
                    {stat.delta}
                  </p>
                </div>
              </Specular>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
          <div
            className="rounded-[10px] p-6"
            style={{
              background: 'var(--ln-bg)',
              boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5">
                <Activity size={12} aria-hidden style={{ color: 'var(--ln-muted)' }} />
                <h4
                  className="font-medium"
                  style={{
                    color: 'var(--ln-fg)',
                    fontFamily: 'var(--ln-family)',
                    fontSize: '13px',
                  }}
                >
                  Recent activity
                </h4>
              </div>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="inline-flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--ln-accent)', fontFamily: 'var(--ln-family)' }}
              >
                View all <ArrowUpRight size={10} aria-hidden />
              </a>
            </div>
            <div className="mt-3">
              <SoftDivider />
            </div>
            <ul className="mt-3 space-y-2">
              {activity.map((a, i) => {
                const Icon = activityIcon(a.kind);
                const tagKind = activityKindColor(a.kind);
                return (
                  <li
                    key={i}
                    className="flex items-center gap-2.5 text-[12px]"
                    style={{ fontFamily: 'var(--ln-family)' }}
                  >
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px]"
                      style={{
                        background: `var(--ln-tag-${tagKind}-bg)`,
                        color: `var(--ln-tag-${tagKind}-fg)`,
                      }}
                      aria-hidden
                    >
                      <Icon size={11} />
                    </span>
                    <span style={{ color: 'var(--ln-fg)', fontWeight: 500 }}>{a.who}</span>
                    <span style={{ color: 'var(--ln-muted)' }}>{a.what}</span>
                    <span
                      className="ml-auto"
                      style={{
                        color: 'var(--ln-faint)',
                        fontSize: '11px',
                      }}
                    >
                      {a.when}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div
            className="rounded-[10px] p-6"
            style={{
              background: 'var(--ln-bg)',
              boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
            }}
          >
            <h4
              className="font-medium"
              style={{
                color: 'var(--ln-fg)',
                fontFamily: 'var(--ln-family)',
                fontSize: '13px',
              }}
            >
              Warmth distribution
            </h4>
            <div className="mt-4 space-y-2">
              {[
                { label: 'Warmth 1', pct: 18 },
                { label: 'Warmth 2', pct: 34 },
                { label: 'Warmth 3', pct: 28 },
                { label: 'Warmth 4', pct: 14 },
                { label: 'Warmth 5', pct: 6 },
              ].map((row, i) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span
                    className="w-[60px] text-[11px]"
                    style={{ color: 'var(--ln-muted)', fontFamily: 'var(--ln-family)' }}
                  >
                    {row.label}
                  </span>
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full"
                    style={{ background: 'var(--ln-surface-soft)' }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${row.pct}%`,
                        background: i === 0 ? 'var(--ln-accent)' : 'var(--ln-muted)',
                        opacity: i === 0 ? 1 : 0.4 + (4 - i) * 0.1,
                      }}
                    />
                  </div>
                  <span
                    className="w-[36px] text-right tabular-nums text-[11px]"
                    style={{
                      color: 'var(--ln-fg)',
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                    }}
                  >
                    {row.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Modal ──────────────────────────────────────────────────

function LaneSettingsModal() {
  return (
    <div>
      <SectionLabel>Settings modal · static preview</SectionLabel>
      <div
        className="relative overflow-hidden rounded-[10px] p-8"
        style={{
          background: 'var(--ln-surface)',
          boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
          minHeight: 380,
        }}
      >
        {/* Faked backdrop */}
        <div
          className="absolute inset-0"
          style={{ background: 'var(--ln-bg)', opacity: 0.6 }}
          aria-hidden
        />
        <div
          className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[12px]"
          style={{
            background: 'var(--ln-surface)',
            boxShadow: '0 0 0 1px var(--ln-border), 0 24px 60px -20px rgba(0,0,0,0.5)',
          }}
        >
          {/* Modal header */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--ln-border-soft)' }}
          >
            <div>
              <h4
                className="font-medium"
                style={{
                  color: 'var(--ln-fg)',
                  fontFamily: 'var(--ln-family)',
                  fontSize: '15px',
                  letterSpacing: 'var(--ln-title-tracking)',
                }}
              >
                Settings
              </h4>
              <p
                className="mt-0.5 text-[12px]"
                style={{ color: 'var(--ln-muted)', fontFamily: 'var(--ln-family)' }}
              >
                Account, shortcuts, danger zone.
              </p>
            </div>
            <WithTooltip label="Close" shortcut="Esc">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md"
                style={{ color: 'var(--ln-faint)' }}
                aria-label="Close"
              >
                <X size={12} aria-hidden />
              </button>
            </WithTooltip>
          </div>

          <div className="px-5 py-4">
            <SettingsModalSection title="Account" icon={Mail}>
              <SettingsModalRow label="Email">
                <span
                  className="text-[12px] tabular-nums"
                  style={{
                    color: 'var(--ln-fg)',
                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                  }}
                >
                  philip@reknowable.app
                </span>
              </SettingsModalRow>
              <SettingsModalRow label="Plan">
                <span
                  className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] uppercase"
                  style={{
                    background: 'var(--ln-accent-soft)',
                    color: 'var(--ln-accent)',
                    fontFamily: 'var(--ln-family)',
                    letterSpacing: '0.06em',
                  }}
                >
                  Beta
                </span>
              </SettingsModalRow>
            </SettingsModalSection>

            <SettingsModalSection title="Keyboard" icon={KeyRound}>
              <SettingsModalRow label="Open recall">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </SettingsModalRow>
              <SettingsModalRow label="Show shortcuts">
                <Kbd>?</Kbd>
              </SettingsModalRow>
            </SettingsModalSection>

            <SettingsModalSection title="Danger zone" icon={Trash2} dangerous>
              <div className="rounded-md p-3" style={{ background: 'rgba(229, 72, 77, 0.08)' }}>
                <p
                  style={{
                    color: 'var(--ln-fg)',
                    fontFamily: 'var(--ln-family)',
                    fontSize: '12px',
                  }}
                >
                  Delete your account permanently.
                </p>
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    background: 'transparent',
                    color: '#E5484D',
                    border: '1px solid rgba(229, 72, 77, 0.3)',
                    fontFamily: 'var(--ln-family)',
                  }}
                >
                  <Trash2 size={10} aria-hidden /> Delete account
                </button>
              </div>
            </SettingsModalSection>
          </div>

          <div
            className="flex items-center justify-end gap-2 px-5 py-3"
            style={{
              borderTop: '1px solid var(--ln-border-soft)',
              background: 'var(--ln-surface-soft)',
            }}
          >
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-[12px]"
              style={{ color: 'var(--ln-muted)', fontFamily: 'var(--ln-family)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-[12px] font-medium"
              style={{
                background: 'var(--ln-fg)',
                color: 'var(--ln-bg)',
                fontFamily: 'var(--ln-family)',
              }}
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsModalSection({
  title,
  icon: Icon,
  dangerous,
  children,
}: {
  title: string;
  icon: typeof Mail;
  dangerous?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <header className="mb-2.5 flex items-center gap-2">
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-[5px]"
          style={{
            background: dangerous ? 'rgba(229, 72, 77, 0.1)' : 'var(--ln-surface-soft)',
            color: dangerous ? '#E5484D' : 'var(--ln-muted)',
          }}
          aria-hidden
        >
          <Icon size={11} />
        </span>
        <h5
          style={{
            color: 'var(--ln-fg)',
            fontFamily: 'var(--ln-family)',
            fontSize: '13px',
            fontWeight: 500,
            letterSpacing: 'var(--ln-title-tracking)',
          }}
        >
          {title}
        </h5>
      </header>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function SettingsModalRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
      style={{ background: 'var(--ln-surface-soft)' }}
    >
      <span
        className="text-[12.5px]"
        style={{ color: 'var(--ln-fg)', fontFamily: 'var(--ln-family)' }}
      >
        {label}
      </span>
      <span className="inline-flex items-center gap-1">{children}</span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex min-w-[20px] items-center justify-center rounded-sm px-1 py-0.5"
      style={{
        background: 'var(--ln-bg)',
        color: 'var(--ln-fg)',
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: '10px',
        boxShadow: 'inset 0 0 0 1px var(--ln-border)',
      }}
    >
      {children}
    </span>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────

function LaneEmptyState() {
  return (
    <div>
      <SectionLabel>Empty state · first-run</SectionLabel>
      <div
        className="rounded-[10px] p-12 text-center"
        style={{
          background: 'var(--ln-surface)',
          boxShadow: 'inset 0 0 0 1px var(--ln-border-soft)',
        }}
      >
        <Notebook
          size={22}
          aria-hidden
          strokeWidth={1.5}
          className="mx-auto mb-5"
          style={{ color: 'var(--ln-faint)' }}
        />
        <h3
          className="font-medium"
          style={{
            color: 'var(--ln-fg)',
            fontFamily: 'var(--ln-family)',
            fontSize: '18px',
            letterSpacing: 'var(--ln-title-tracking)',
          }}
        >
          A blank page.
        </h3>
        <p
          className="mx-auto mt-1.5 max-w-[40ch] text-[13px]"
          style={{
            color: 'var(--ln-muted)',
            fontFamily: 'var(--ln-family)',
            lineHeight: 1.55,
          }}
        >
          Drop a note about someone or something in the chat. People and assets appear here, with
          warmth and availability.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {['Add Anna, warmth 2', 'Who do I know in Stockholm?', 'Find a podcast studio'].map(
            (p) => (
              <button
                key={p}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px]"
                style={{
                  background: 'var(--ln-bg)',
                  color: 'var(--ln-muted)',
                  boxShadow: 'inset 0 0 0 1px var(--ln-border)',
                  fontFamily: 'var(--ln-family)',
                }}
              >
                {p} <CornerDownLeft size={9} aria-hidden style={{ color: 'var(--ln-faint)' }} />
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mini App Shell ──────────────────────────────────────────────────

type SampleContact = {
  name: string;
  city: string;
  warmth: number;
  assets: number;
  tags: Array<{ kind: TagKind; label: string }>;
};

const SAMPLE_CONTACTS: SampleContact[] = [
  {
    name: 'Anna Svensson',
    city: 'Göteborg',
    warmth: 1,
    assets: 2,
    tags: [
      { kind: 'blue', label: 'investor' },
      { kind: 'amber', label: 'studio' },
    ],
  },
  {
    name: 'Viktor Nord',
    city: 'Stockholm',
    warmth: 2,
    assets: 1,
    tags: [{ kind: 'green', label: 'engineer' }],
  },
  {
    name: 'Bo Larsson',
    city: 'Malmö',
    warmth: 3,
    assets: 0,
    tags: [{ kind: 'blue', label: 'investor' }],
  },
  {
    name: 'Elin Karlsson',
    city: 'Lund',
    warmth: 2,
    assets: 4,
    tags: [
      { kind: 'blue', label: 'investor' },
      { kind: 'brand', label: 'event' },
    ],
  },
];

// Reknowable is not just contacts. Assets are things in the world the
// user can access through their network: studios, hotels, equipment,
// templates, rights, venues, contracts. Each has an owner (a contact or
// "ours") and availability (when it can be used).
type SampleAsset = {
  name: string;
  owner: string; // contact name or "ours"
  availability: string;
  tag: { kind: TagKind; label: string };
  Icon: typeof Briefcase;
};

const SAMPLE_ASSETS: SampleAsset[] = [
  {
    name: 'Podcast Studio Göteborg',
    owner: 'Anna Svensson',
    availability: 'free Tuesdays',
    tag: { kind: 'amber', label: 'studio' },
    Icon: Briefcase,
  },
  {
    name: 'Hotel St. Petri',
    owner: 'ours',
    availability: 'always',
    tag: { kind: 'blue', label: 'hotel' },
    Icon: Briefcase,
  },
  {
    name: 'Investor deck template',
    owner: 'ours',
    availability: 'always',
    tag: { kind: 'neutral', label: 'doc' },
    Icon: Notebook,
  },
  {
    name: 'Cycling tour rights',
    owner: 'Pierre Dubois',
    availability: 'May–Sept',
    tag: { kind: 'green', label: 'event' },
    Icon: Activity,
  },
];

function LaneAppShell({ lane }: { lane: Lane }) {
  return (
    <div>
      <SectionLabel>Mini app shell · how the home screen would feel</SectionLabel>
      {/* Panel-based layout. No hard separator lines anywhere. The bg
          holds everything; the chat + contacts are each their own
          rounded panel floating on the bg with breathing room. */}
      <div className="rounded-[12px] p-5" style={{ background: 'var(--ln-bg)' }}>
        {/* Top bar — floating, no border-bottom. */}
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <span
            className="font-medium lowercase"
            style={{
              color: 'var(--ln-fg)',
              fontFamily: 'var(--ln-family)',
              fontSize: '13px',
              letterSpacing: 'var(--ln-title-tracking)',
            }}
          >
            reknowable
          </span>
          <div
            className="flex items-center gap-2 rounded-md px-2 py-1"
            style={{ background: 'var(--ln-surface)' }}
          >
            <Search size={11} aria-hidden style={{ color: 'var(--ln-faint)' }} />
            <span
              className="text-[11px]"
              style={{ color: 'var(--ln-muted)', fontFamily: 'var(--ln-family)' }}
            >
              Find
            </span>
            <span
              className="text-[10px] tabular-nums"
              style={{
                color: 'var(--ln-faint)',
                fontFamily: "'Geist Mono', ui-monospace, monospace",
              }}
            >
              ⌘K
            </span>
          </div>
          <div className="flex items-center gap-1">
            <WithTooltip label="Notifications">
              <ShellIcon Icon={Bell} />
            </WithTooltip>
            <WithTooltip label="Settings" shortcut="⌘,">
              <ShellIcon Icon={Settings} />
            </WithTooltip>
          </div>
        </div>

        {/* Two panels side by side with a gap. Each is a rounded
            surface that floats on the bg. No border lines between them
            or inside them. */}
        <div className="mt-4 grid grid-cols-[55fr_45fr] gap-4" style={{ minHeight: 320 }}>
          {/* Chat panel */}
          <div
            className="flex flex-col gap-4 rounded-[10px] p-6"
            style={{ background: 'var(--ln-surface)' }}
          >
            <UserBubble>
              Who do I know in Stockholm that could help with a podcast event?
            </UserBubble>
            <AssistantProse>
              Found <Pill>Anna Svensson</Pill> and <Pill>Viktor Nord</Pill>. Both warmth 2 or
              closer. Anna owns a studio in Göteborg (1.5h train); Viktor&apos;s in Stockholm.
            </AssistantProse>
          </div>

          {/* Network panel — People + Assets together. Reknowable is
              both contacts AND the things they make accessible. */}
          <div
            className="flex flex-col gap-5 rounded-[10px] p-4"
            style={{ background: 'var(--ln-surface)' }}
          >
            <NetworkSection title="People" count={SAMPLE_CONTACTS.length} Icon={Users} actions>
              <ul className="flex flex-col gap-0.5">
                {SAMPLE_CONTACTS.map((c) => (
                  <li key={c.name}>
                    <div className="flex items-center gap-3 rounded-[6px] px-3 py-2.5 transition-colors hover:[background:var(--ln-bg)]">
                      <span
                        className="truncate"
                        style={{
                          color: 'var(--ln-fg)',
                          fontFamily: 'var(--ln-family)',
                          fontSize: '13px',
                          fontWeight: 500,
                        }}
                      >
                        {c.name}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {c.tags.map((t) => (
                          <Tag key={t.label} kind={t.kind}>
                            {t.label}
                          </Tag>
                        ))}
                      </span>
                      <span
                        className="ml-auto inline-flex items-center gap-3"
                        style={{ color: 'var(--ln-muted)', fontFamily: 'var(--ln-family)' }}
                      >
                        {c.assets > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px]">
                            <Briefcase size={10} aria-hidden style={{ color: 'var(--ln-faint)' }} />
                            <span className="tabular-nums">{c.assets}</span>
                          </span>
                        ) : null}
                        <span className="text-[12px]">{c.city}</span>
                        <WarmthBar warmth={c.warmth} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </NetworkSection>

            <NetworkSection title="Assets" count={SAMPLE_ASSETS.length} Icon={Briefcase}>
              <ul className="flex flex-col gap-0.5">
                {SAMPLE_ASSETS.map((a) => (
                  <li key={a.name}>
                    <div className="flex items-center gap-3 rounded-[6px] px-3 py-2.5 transition-colors hover:[background:var(--ln-bg)]">
                      <a.Icon size={11} aria-hidden style={{ color: 'var(--ln-faint)' }} />
                      <span
                        className="truncate"
                        style={{
                          color: 'var(--ln-fg)',
                          fontFamily: 'var(--ln-family)',
                          fontSize: '13px',
                          fontWeight: 500,
                        }}
                      >
                        {a.name}
                      </span>
                      <Tag kind={a.tag.kind}>{a.tag.label}</Tag>
                      <span
                        className="ml-auto inline-flex items-center gap-3 text-[12px]"
                        style={{ color: 'var(--ln-muted)', fontFamily: 'var(--ln-family)' }}
                      >
                        <span>{a.owner}</span>
                        <span style={{ color: 'var(--ln-faint)' }} className="text-[11px]">
                          {a.availability}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </NetworkSection>
          </div>
        </div>
      </div>
      <p
        className="mt-3 text-[11px]"
        style={{ color: 'var(--ln-faint)', fontFamily: 'var(--ln-family)' }}
      >
        {lane.name} · {lane.influences}
      </p>
    </div>
  );
}

function NetworkSection({
  title,
  count,
  Icon,
  actions,
  children,
}: {
  title: string;
  count: number;
  Icon: typeof Users;
  actions?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-2 pt-1 pb-2">
        <Icon size={12} aria-hidden style={{ color: 'var(--ln-muted)' }} />
        <span
          className="font-medium"
          style={{
            color: 'var(--ln-fg)',
            fontFamily: 'var(--ln-family)',
            fontSize: '13px',
            letterSpacing: 'var(--ln-title-tracking)',
          }}
        >
          {title}
        </span>
        <span
          className="text-[11px] tabular-nums"
          style={{ color: 'var(--ln-faint)', fontFamily: 'var(--ln-family)' }}
        >
          {count}
        </span>
        {actions ? (
          <span className="ml-auto inline-flex items-center gap-1">
            <WithTooltip label="Filter" shortcut="F">
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm"
                style={{ color: 'var(--ln-faint)' }}
                aria-label="Filter"
              >
                <Filter size={11} aria-hidden />
              </button>
            </WithTooltip>
            <WithTooltip label="More">
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm"
                style={{ color: 'var(--ln-faint)' }}
                aria-label="More"
              >
                <MoreHorizontal size={11} aria-hidden />
              </button>
            </WithTooltip>
          </span>
        ) : null}
      </div>
      <SoftDivider inset={8} />
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ShellIcon({ Icon }: { Icon: typeof Settings }) {
  return (
    <button
      type="button"
      className="inline-flex h-6 w-6 items-center justify-center rounded-md"
      style={{ color: 'var(--ln-muted)' }}
    >
      <Icon size={12} aria-hidden />
    </button>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[88%] rounded-[10px] px-3 py-2"
        style={{
          background: 'var(--ln-fg)',
          color: 'var(--ln-bg)',
          fontFamily: 'var(--ln-family)',
          fontSize: 'var(--ln-body-size)',
          lineHeight: 'var(--ln-body-leading)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function AssistantProse({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        color: 'var(--ln-fg)',
        fontFamily: 'var(--ln-family)',
        fontSize: 'var(--ln-body-size)',
        lineHeight: 'var(--ln-body-leading)',
        maxWidth: '60ch',
      }}
    >
      {children}
    </p>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mb-5 text-[10px] uppercase tracking-wider"
      style={{
        color: 'var(--ln-faint)',
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        letterSpacing: '0.08em',
      }}
    >
      {children}
    </h3>
  );
}
