/**
 * Plain-text extraction from a Typst SOURCE string.
 *
 * The evaluation payload must be the SAME document the export produces, so it
 * is derived from `buildPartBTypstDocument`'s source rather than from the
 * legacy print DOM (which only ever knew about `section_content`).
 *
 * Everything an author writes reaches the Typst source as a quoted string
 * literal — headings, paragraphs, table cells, chip labels, figure captions.
 * So the extraction walks the source, collects string literals in document
 * order, and drops the ones that are plainly styling (font names, weights,
 * alignments, colours, lengths). Headings keep their markdown level from the
 * `he-hN-plain` call that carries them.
 */

/** Literals that are styling arguments, never authored content. */
const STYLE_WORDS = new Set([
  'bold',
  'regular',
  'medium',
  'semibold',
  'light',
  'italic',
  'normal',
  'oblique',
  'center',
  'centre',
  'left',
  'right',
  'top',
  'bottom',
  'horizon',
  'auto',
  'none',
  'start',
  'end',
  'justify',
  'solid',
  'dashed',
  'dotted',
  'ltr',
  'rtl',
  'linebreak',
  'smart',
]);

const FONT_LIKE =
  /^(times new roman|archivo black|new computer modern|liberation|nimbus|dejavu|helvetica|arial|linux libertine)/i;
const LENGTH_LIKE = /^-?\d+(\.\d+)?(pt|mm|cm|in|em|fr|%|deg)$/i;
const COLOUR_LIKE = /^#?[0-9a-f]{3,8}$/i;

function isStyling(literal: string): boolean {
  const s = literal.trim();
  if (!s) return true;
  if (STYLE_WORDS.has(s.toLowerCase())) return true;
  if (FONT_LIKE.test(s)) return true;
  if (LENGTH_LIKE.test(s)) return true;
  if (COLOUR_LIKE.test(s) && !/\s/.test(s)) return true;
  return false;
}

function unescapeTypst(raw: string): string {
  return raw
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ');
}

/** Heading helpers emitted by `sectionToTypst`. */
const HEADING_CALLS: Array<[RegExp, string]> = [
  [/he-h1-plain\($/, '# '],
  [/he-h2-plain\($/, '## '],
  [/he-h3-plain\($/, '### '],
  [/he-h4-plain\($/, '#### '],
];

export interface TypstTextOptions {
  /**
   * Skip everything before the first `<part-marker>`, i.e. the preamble, whose
   * literals are all page furniture and style definitions.
   */
  dropPreamble?: boolean;
}

/**
 * Readable, roughly markdown-shaped text for the whole Typst source.
 *
 * Not a Typst interpreter: it is a faithful ordered dump of the authored
 * strings, which is what an LLM evaluator needs.
 */
export function typstSourceToText(source: string, options: TypstTextOptions = {}): string {
  let src = source;
  if (options.dropPreamble !== false) {
    const first = src.indexOf('<part-marker>');
    if (first > 0) src = src.slice(first);
  }

  const lines: string[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    // Comments never carry content.
    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? src.length : nl + 1;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }

    if (ch !== '"') {
      i += 1;
      continue;
    }

    let j = i + 1;
    let raw = '';
    while (j < src.length) {
      if (src[j] === '\\') {
        raw += src[j] + (src[j + 1] ?? '');
        j += 2;
        continue;
      }
      if (src[j] === '"') break;
      raw += src[j];
      j += 1;
    }

    const before = src.slice(Math.max(0, i - 24), i);
    const value = unescapeTypst(raw).replace(/\u00a0/g, ' ').trim();
    i = j + 1;

    if (!value || isStyling(value)) continue;

    let prefix = '';
    for (const [pattern, mark] of HEADING_CALLS) {
      if (pattern.test(before)) {
        prefix = mark;
        break;
      }
    }
    if (prefix) lines.push('', prefix + value, '');
    else lines.push(value);
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
