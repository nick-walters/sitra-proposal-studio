/**
 * Convert HTML → plain text for fields that should not contain markup
 * (e.g. the A1 abstract). Preserves paragraph structure:
 *   - </p>, </div>, </h1..6> → double newline
 *   - <br>                    → single newline
 * Strips all remaining tags, decodes common HTML entities, and collapses
 * runs of whitespace within a line. Newlines are preserved.
 *
 * Isomorphic (regex-only) so it can run in browsers, Node, and Deno.
 */
export function htmlToPlainText(input: string): string {
  if (!input) return '';
  let s = String(input);

  // Drop script/style blocks entirely.
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');

  // Block-level closers → paragraph break.
  s = s.replace(/<\/(p|div|h[1-6]|li|tr)\s*>/gi, '\n\n');
  // Line breaks.
  s = s.replace(/<br\s*\/?>/gi, '\n');

  // Strip all remaining tags.
  s = s.replace(/<[^>]+>/g, '');

  // Decode common entities.
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16)));

  // Collapse whitespace within each line; preserve newlines.
  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n');

  // Collapse 3+ newlines to a single paragraph break.
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}
