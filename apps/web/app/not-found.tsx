import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';

export const metadata = {
  title: 'Not found · Reknowable',
};

export default function NotFound() {
  return (
    <main
      className="relative mx-auto flex w-full max-w-md flex-col items-center justify-center px-6 py-12 text-center"
      style={{ minHeight: '100dvh' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft opacity-30 blur-3xl"
      />
      <div className="relative">
        <div className="mb-6 inline-flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          <span className="text-xs font-medium text-muted">reknowable</span>
        </div>
        <div className="mx-auto mb-6 inline-flex h-12 w-12 items-center justify-center rounded-md bg-surface-soft text-muted shadow-hairline-soft">
          <Compass size={18} aria-hidden />
        </div>
        <h1 className="text-[2rem] font-medium leading-[1.15] tracking-[-0.028em] text-fg">
          Nothing here.
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          That page doesn&apos;t exist, or it has moved. Try the notebook.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md bg-fg px-3 py-2 text-sm font-medium tracking-tight text-bg transition-all duration-fast ease-out-quart hover:opacity-90 focus-visible:opacity-90 active:scale-[0.98]"
          >
            <ArrowLeft size={12} aria-hidden />
            Back to the notebook
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center rounded-md bg-surface-soft px-3 py-2 text-sm font-medium tracking-tight text-fg transition-all duration-fast ease-out-quart hover:bg-surface focus-visible:bg-surface active:scale-[0.98]"
          >
            Settings
          </Link>
        </div>
      </div>
    </main>
  );
}
