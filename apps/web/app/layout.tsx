import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { OfflineBanner, ClickInspector } from '@reknowable/app';
import './globals.css';

export const metadata = {
  title: 'Reknowable',
  description:
    'A second brain for everyone in your network. Recall the right contact, the right asset, on demand.',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAFB' },
    { media: '(prefers-color-scheme: dark)', color: '#0E0F12' },
  ],
};

// Inline before-hydration script. Sets `data-theme` on <html> from the
// user's stored preference (or system fallback) BEFORE React paints so
// there's no flash of the wrong theme. Tiny + idempotent.
const THEME_BOOTSTRAP = `(() => {
  try {
    const stored = localStorage.getItem('reknowable:theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.dataset.theme = stored;
    }
  } catch {}
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /* suppressHydrationWarning: the inline bootstrap script below sets
       `data-theme` on <html> from localStorage before React paints. The
       server can't know the stored value, so the client's <html> attrs
       legitimately differ from the SSR-ed markup. Hydration mismatch
       warning here is expected and benign — suppress so it doesn't
       drown out real warnings in the console. */
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        <OfflineBanner />
        <ClickInspector />
      </body>
    </html>
  );
}
