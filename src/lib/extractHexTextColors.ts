/**
 * Scan an HTML string for inline text-colour usages and return a Set of
 * canonical uppercase 6-digit hex codes (e.g. "#RRGGBB").
 *
 * Matches `style="... color: #RRGGBB ..."` (case-insensitive, tolerant of
 * whitespace and other declarations around it). Intentionally ignores
 * `background-color`, `border-color`, rgb()/hsl(), named colours, and 3-digit
 * shorthand — custom_colors stores canonical 6-digit hex only, so only those
 * forms can block deletion.
 */
const COLOR_RE = /(?:^|[;"'\s])color\s*:\s*#([0-9a-fA-F]{6})\b/g;

export function extractHexTextColorsFromHtml(
  html: string | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!html || typeof html !== 'string') return out;
  COLOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COLOR_RE.exec(html)) !== null) {
    out.add(`#${m[1].toUpperCase()}`);
  }
  return out;
}

/** Recursively pull string leaves out of a jsonb value (e.g. subsection_content). */
export function collectStringsFromJson(value: unknown, sink: string[]): void {
  if (value == null) return;
  if (typeof value === 'string') {
    sink.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStringsFromJson(v, sink);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStringsFromJson(v, sink);
    }
  }
}
