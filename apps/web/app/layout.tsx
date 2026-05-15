import type { ReactNode } from 'react';

export const metadata = {
  title: 'network-ai',
  description: 'Personal network mapper with AI agent',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
