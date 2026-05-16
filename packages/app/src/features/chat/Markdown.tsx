'use client';

import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MentionPill } from './MentionPill';

/**
 * Markdown — assistant-text renderer.
 *
 * Memoized on `text` so streaming partial markdown doesn't re-parse the
 * whole tree on every chunk. react-markdown handles partial markdown
 * gracefully (a half-closed `**bold` just renders as plain text until
 * the next chunk completes it).
 *
 * Component overrides match our calm/refined design system — no default
 * react-markdown styling.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-base leading-relaxed tracking-tight text-fg/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={MD_COMPONENTS}
        urlTransform={transformUrl}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

/**
 * URL transformer for react-markdown. Default sanitizer strips any
 * scheme that isn't http/https/mailto, which would mangle our
 * `contact:<uuid>` / `asset:<uuid>` mention links. Allow them through
 * (the `a` override below routes them to MentionPill); for everything
 * else, fall back to the library's default (block javascript:, data:,
 * etc.) by rejecting unknown schemes.
 */
function transformUrl(url: string): string {
  if (url.startsWith('contact:') || url.startsWith('asset:')) return url;
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(url)) return url;
  return ''; // strip anything else (javascript:, data:, file:, …)
}

const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
  strong: ({ children }) => <strong className="font-medium text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="ml-5 list-disc space-y-1 marker:text-faint">{children}</ul>,
  ol: ({ children }) => (
    <ol className="ml-5 list-decimal space-y-1 marker:text-faint">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="text-lg font-semibold tracking-tight text-fg">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-semibold tracking-tight text-fg">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold tracking-tight text-fg">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border-soft pl-3 text-muted">{children}</blockquote>
  ),
  hr: () => <hr className="border-border-soft" />,
  a: ({ href, children }) => {
    if (href?.startsWith('contact:')) {
      return (
        <MentionPill kind="contact" id={href.slice('contact:'.length)}>
          {children}
        </MentionPill>
      );
    }
    if (href?.startsWith('asset:')) {
      return (
        <MentionPill kind="asset" id={href.slice('asset:'.length)}>
          {children}
        </MentionPill>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
      >
        {children}
      </a>
    );
  },
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? '');
    if (isBlock) {
      return <code className={`block ${className ?? ''}`}>{children}</code>;
    }
    return (
      <code className="mono rounded bg-surface-soft px-1 py-0.5 text-[0.85em] text-fg">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mono overflow-x-auto rounded-md bg-surface-soft px-3 py-2 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border-soft px-2 py-1 text-left font-medium text-fg">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border-soft px-2 py-1 text-fg/85">{children}</td>
  ),
};
