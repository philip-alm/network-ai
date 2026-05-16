/**
 * Header-value sanitization for the agent-chat response.
 *
 * HTTP headers are ByteString (ISO-8859-1, no control chars). Deno's
 * `new Response(body, { headers })` rejects any header value containing
 * a code point outside 0x00–0xFF with "Value is not a valid ByteString",
 * which crashes the whole response. Upstream error bodies, provider
 * labels, and our own diagnostic strings can all carry characters that
 * trip this: smart quotes from JSON error payloads, the `…` ellipsis,
 * the `→` arrow we use in chain descriptions, accented letters in
 * provider error messages, raw newlines, etc.
 *
 * Two helpers:
 *   - `truncate(s, max)` — ASCII-only truncate. Uses `...` not `…`.
 *   - `asHeaderValue(s)` — collapses newlines, replaces any byte
 *     outside printable-ASCII with `_`, and trims whitespace.
 *
 * All values written to response headers in `index.ts` MUST go through
 * `asHeaderValue` first, even when we think they're safe.
 */

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 3) return s.slice(0, max);
  return `${s.slice(0, max - 3)}...`;
}

export function asHeaderValue(s: string): string {
  return (
    s
      .replace(/[\r\n]+/g, ' ')
      // deno-lint-ignore no-control-regex
      .replace(/[^\x20-\x7E]+/g, '_')
      .trim()
  );
}
