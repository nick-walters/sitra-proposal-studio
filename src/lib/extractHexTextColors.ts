/**
 * Scan an HTML string for inline text-colour usages and return a Set of
 * canonical uppercase 6-digit hex codes (e.g. "#RRGGBB").
 *
 * Matches BOTH forms the app can produce:
 *   • `style="... color: #RRGGBB ..."`  (TipTap TextStyle when a hex is
 *     serialised directly, and manual paste)
 *   • `style="... color: rgb(r, g, b) ..."`  (what the browser CSSOM emits
 *     for both `execCommand('foreColor')` in bespoke contentEditable toolbars
 *     AND @tiptap/extension-color once the value round-trips through the DOM)
 *
 * The leading boundary blocks `background-color` / `border-color` false
 * positives. `background` shorthand and named colours are intentionally
 * ignored — custom_colors stores canonical 6-digit hex only.
 */
const HEX_COLOR_RE = /(?:^|[;"'\s])color\s*:\s*#([0-9a-fA-F]{6})\b/g;
const RGB_COLOR_RE = /(?:^|[;"'\s])color\s*:\s*rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/gi;

function byteToHex(n: number): string {
  const clamped = Math.max(0, Math.min(255, n | 0));
  return clamped.toString(16).padStart(2, '0').toUpperCase();
}

export function extractHexTextColorsFromHtml(
  html: string | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!html || typeof html !== 'string') return out;

  HEX_COLOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEX_COLOR_RE.exec(html)) !== null) {
    out.add(`#${m[1].toUpperCase()}`);
  }

  RGB_COLOR_RE.lastIndex = 0;
  while ((m = RGB_COLOR_RE.exec(html)) !== null) {
    out.add(`#${byteToHex(+m[1])}${byteToHex(+m[2])}${byteToHex(+m[3])}`);
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
