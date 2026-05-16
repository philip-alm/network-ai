'use client';

/**
 * ClickInspector — temporary diagnostic to find what's intercepting
 * clicks on a given pixel.
 *
 * When armed (via the lab page or by setting localStorage
 * `reknowable:inspect-clicks` to `'1'`), every click anywhere in the
 * document logs the full element stack at the click coordinates via
 * `document.elementsFromPoint`. Results are shown in a fixed banner
 * AND mirrored to localStorage so the lab page can read them back.
 *
 * This component renders nothing (and registers no listeners) when not
 * armed. Cost when disabled: a single localStorage read on mount.
 */

import { useEffect, useState } from 'react';

const FLAG_KEY = 'reknowable:inspect-clicks';
const LAST_KEY = 'reknowable:inspect-last';

type Entry = {
  tag: string;
  classes: string;
  pointerEvents: string;
  zIndex: string;
};

type Capture = {
  ts: number;
  x: number;
  y: number;
  stack: Entry[];
};

function describe(el: Element): Entry {
  const style = window.getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    classes: ((el.getAttribute('class') ?? '') as string).slice(0, 80),
    pointerEvents: style.pointerEvents,
    zIndex: style.zIndex,
  };
}

export function ClickInspector() {
  const [armed, setArmed] = useState(false);
  const [capture, setCapture] = useState<Capture | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(FLAG_KEY) === '1') setArmed(true);
    } catch {
      // ignore
    }
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== FLAG_KEY) return;
      setArmed(e.newValue === '1');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!armed) return;
    const onClick = (e: MouseEvent): void => {
      const els = document.elementsFromPoint(e.clientX, e.clientY).slice(0, 10);
      const cap: Capture = {
        ts: Date.now(),
        x: e.clientX,
        y: e.clientY,
        stack: els.map(describe),
      };
      setCapture(cap);
      try {
        window.localStorage.setItem(LAST_KEY, JSON.stringify(cap));
      } catch {
        // ignore
      }
      // eslint-disable-next-line no-console
      console.log('[click-inspector]', cap);
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [armed]);

  if (!armed) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 2147483647,
        maxWidth: 'min(560px, calc(100vw - 24px))',
        background: 'var(--color-fg)',
        color: 'var(--color-bg)',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        lineHeight: 1.45,
        boxShadow: '0 8px 32px -12px rgba(0,0,0,0.55)',
        pointerEvents: 'auto',
      }}
      data-testid="click-inspector"
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>click-inspector</span>
        <span style={{ opacity: 0.7 }}>
          {capture ? `(${capture.x}, ${capture.y})` : 'click anywhere…'}
        </span>
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.removeItem(FLAG_KEY);
            } catch {
              // ignore
            }
            setArmed(false);
          }}
          style={{
            marginLeft: 'auto',
            background: 'rgba(255,255,255,0.12)',
            border: 0,
            color: 'var(--color-bg)',
            borderRadius: 4,
            padding: '2px 6px',
            cursor: 'pointer',
            fontSize: 10,
          }}
        >
          disarm
        </button>
      </div>
      {capture ? (
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          {capture.stack.map((e, i) => (
            <li key={i} style={{ opacity: i === 0 ? 1 : 0.75 }}>
              <span style={{ fontWeight: i === 0 ? 700 : 400 }}>{e.tag}</span>
              {e.classes ? (
                <span
                  style={{ opacity: 0.6 }}
                >{` .${e.classes.split(/\s+/).slice(0, 3).join('.')}`}</span>
              ) : null}
              <span style={{ opacity: 0.6 }}>{` · pe=${e.pointerEvents}`}</span>
              {e.zIndex !== 'auto' ? (
                <span style={{ opacity: 0.6 }}>{` · z=${e.zIndex}`}</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <div style={{ opacity: 0.7 }}>
          Listener armed. Click the broken button — the topmost element will appear here.
        </div>
      )}
    </div>
  );
}

/** Imperatively arm/disarm from anywhere (lab page, console). */
export function setClickInspectorArmed(armed: boolean): void {
  try {
    if (armed) window.localStorage.setItem(FLAG_KEY, '1');
    else window.localStorage.removeItem(FLAG_KEY);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: FLAG_KEY,
        newValue: armed ? '1' : null,
      }),
    );
  } catch {
    // ignore
  }
}

export function readLastClickCapture(): Capture | null {
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Capture;
  } catch {
    return null;
  }
}
