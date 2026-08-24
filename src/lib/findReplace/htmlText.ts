/**
 * Stored HTML → plain text, with an offset map back into the HTML.
 *
 * Why not the DOM: collapsed blocks and unmounted fields have no DOM. Why not
 * a naive `replace(/<[^>]+>/g, '')`: we need to map a plain-text match back to
 * an exact HTML range in order to replace it without disturbing markup, and we
 * need to skip whole subtrees (cross-reference chips, citations, figures).
 *
 * Matching happens on the stripped text, so "post-quantum" is found even when
 * the "post-" is bolded, and a search can never hit a tag name or an attribute
 * value.
 */

export interface TextSegment {
  /** Offset into the plain text. */
  textStart: number;
  textLen: number;
  /** Offset into the source HTML. */
  htmlStart: number;
  htmlLen: number;
  /**
   * True when text and HTML advance one-for-one (a literal run). Entities are
   * emitted as non-linear segments of one plain character.
   */
  linear: boolean;
  /** Synthetic separators (block boundaries) map to nothing in the HTML. */
  synthetic?: boolean;
}

export interface ExtractedText {
  text: string;
  segments: TextSegment[];
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Elements after which a plain-text boundary is inserted. */
const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'td', 'th', 'tr', 'table', 'tbody', 'thead',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'figure', 'figcaption', 'br',
]);

/**
 * Subtrees whose text is NOT part of the searchable content.
 *
 * Cross-reference chips and citation markers store an id and render their
 * label at read time; the visible "WP4" or "¹²" is never the stored text, so
 * matching it would be matching something the user cannot edit. Figures are
 * atomic. `contenteditable="false"` catches any other atom node generically.
 */
const EXCLUDED_TAGS = new Set(['img', 'svg', 'iframe', 'style', 'script']);

const EXCLUDED_ATTR_PATTERNS: RegExp[] = [
  /\sdata-reference\b/i,
  /\sdata-reference-[a-z-]+\s*=/i,
  /\sdata-citation\b/i,
  /\sdata-citation-[a-z-]+\s*=/i,
  /\sdata-ref-key\s*=/i,
  /\sdata-figure(-[a-z-]+)?\s*=/i,
  /\sdata-mention\b/i,
  /\sdata-type\s*=\s*["'](reference|crossRef|cross-ref|citation|figure|mention|participantRef|figureRef)["']/i,
  /\scontenteditable\s*=\s*["']false["']/i,
  /\sclass\s*=\s*["'][^"']*\b(reference-chip|citation-marker|cross-ref-chip|mention-chip)\b/i,
];

function isExcludedTag(tagName: string, rawTag: string): boolean {
  if (EXCLUDED_TAGS.has(tagName)) return true;
  return EXCLUDED_ATTR_PATTERNS.some((re) => re.test(rawTag));
}

const ENTITY_RE = /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', eacute: 'é', deg: '°', euro: '€',
};

function decodeEntity(body: string): string {
  if (body.startsWith('#x') || body.startsWith('#X')) {
    return String.fromCodePoint(parseInt(body.slice(2), 16));
  }
  if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
  return NAMED_ENTITIES[body] ?? `&${body};`;
}

/** Extracts searchable plain text from stored HTML, with an offset map. */
export function extractHtmlText(html: string): ExtractedText {
  const segments: TextSegment[] = [];
  let text = '';
  let skipDepth = 0;
  /** Open element names, so a close tag can pop the right excluded subtree. */
  const stack: { name: string; excluded: boolean }[] = [];

  const pushSeparator = (htmlPos: number) => {
    if (text.length === 0 || text.endsWith('\n')) return;
    segments.push({
      textStart: text.length,
      textLen: 1,
      htmlStart: htmlPos,
      htmlLen: 0,
      linear: false,
      synthetic: true,
    });
    text += '\n';
  };

  const pushTextChunk = (chunk: string, htmlStart: number) => {
    ENTITY_RE.lastIndex = 0;
    let cursor = 0;
    let m: RegExpExecArray | null;
    while ((m = ENTITY_RE.exec(chunk)) !== null) {
      if (m.index > cursor) {
        const literal = chunk.slice(cursor, m.index);
        segments.push({
          textStart: text.length,
          textLen: literal.length,
          htmlStart: htmlStart + cursor,
          htmlLen: literal.length,
          linear: true,
        });
        text += literal;
      }
      const decoded = decodeEntity(m[1]);
      segments.push({
        textStart: text.length,
        textLen: decoded.length,
        htmlStart: htmlStart + m.index,
        htmlLen: m[0].length,
        linear: false,
      });
      text += decoded;
      cursor = m.index + m[0].length;
    }
    if (cursor < chunk.length) {
      const literal = chunk.slice(cursor);
      segments.push({
        textStart: text.length,
        textLen: literal.length,
        htmlStart: htmlStart + cursor,
        htmlLen: literal.length,
        linear: true,
      });
      text += literal;
    }
  };

  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|<!--[\s\S]*?-->/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    if (match.index > last && skipDepth === 0) {
      pushTextChunk(html.slice(last, match.index), last);
    }
    last = tagRe.lastIndex;

    const raw = match[0];
    if (raw.startsWith('<!--')) continue;

    const name = (match[1] || '').toLowerCase();
    const isClose = raw.startsWith('</');
    const selfClosing = /\/\s*>$/.test(raw) || VOID_TAGS.has(name);

    if (isClose) {
      // Pop to the matching open element, tolerating unbalanced markup.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          for (let j = stack.length - 1; j >= i; j--) {
            if (stack[j].excluded) skipDepth = Math.max(0, skipDepth - 1);
          }
          stack.length = i;
          break;
        }
      }
      if (BLOCK_TAGS.has(name) && skipDepth === 0) pushSeparator(tagRe.lastIndex);
      continue;
    }

    const excluded = isExcludedTag(name, match[2] || '');
    if (selfClosing) {
      if (BLOCK_TAGS.has(name) && skipDepth === 0) pushSeparator(tagRe.lastIndex);
      continue;
    }
    if (excluded) skipDepth += 1;
    stack.push({ name, excluded });
  }

  if (last < html.length && skipDepth === 0) {
    pushTextChunk(html.slice(last), last);
  }

  return { text, segments };
}

/** Plain-text field (no markup): the map is the identity. */
export function extractPlainText(value: string): ExtractedText {
  return {
    text: value,
    segments: value
      ? [{ textStart: 0, textLen: value.length, htmlStart: 0, htmlLen: value.length, linear: true }]
      : [],
  };
}

export interface HtmlEdit {
  htmlStart: number;
  htmlEnd: number;
  insert: string;
}

/**
 * Turns one plain-text range into the HTML edits that realise it.
 *
 * A match split across markup ("<b>post-</b>quantum") produces one edit per
 * contributing text run: the replacement lands whole in the first run, later
 * runs lose their matched slice. Markup, chips and table structure are never
 * touched because only text-run ranges are ever edited.
 */
export function mapRangeToHtmlEdits(
  extracted: ExtractedText,
  start: number,
  end: number,
  replacement: string,
): HtmlEdit[] {
  const edits: HtmlEdit[] = [];
  let placed = false;

  for (const seg of extracted.segments) {
    if (seg.synthetic || seg.htmlLen === 0) continue;
    const segEnd = seg.textStart + seg.textLen;
    if (segEnd <= start || seg.textStart >= end) continue;

    const from = Math.max(start, seg.textStart);
    const to = Math.min(end, segEnd);

    let htmlStart: number;
    let htmlEnd: number;
    if (seg.linear) {
      htmlStart = seg.htmlStart + (from - seg.textStart);
      htmlEnd = seg.htmlStart + (to - seg.textStart);
    } else {
      // Entity: replaced whole or not at all.
      htmlStart = seg.htmlStart;
      htmlEnd = seg.htmlStart + seg.htmlLen;
    }

    edits.push({ htmlStart, htmlEnd, insert: placed ? '' : replacement });
    placed = true;
  }

  return edits;
}

/** Applies edits (any order) to a source string, right to left. */
export function applyHtmlEdits(source: string, edits: HtmlEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.htmlStart - a.htmlStart);
  let out = source;
  for (const edit of ordered) {
    out = out.slice(0, edit.htmlStart) + edit.insert + out.slice(edit.htmlEnd);
  }
  return out;
}

/** Escapes text so it can be inserted into HTML without becoming markup. */
export function escapeForHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
