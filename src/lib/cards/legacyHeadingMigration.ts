/**
 * Generic legacy `section_content` → block-board migration matcher.
 *
 * Splits a legacy Part B HTML document into heading-led segments and maps each
 * segment onto a template block. Used by the B1.1 / B2.1 / B2.2 / B3.2 cutover.
 *
 * Rules (identical for every section):
 *   1. A `data-*-slot-key` attribute on the heading wins outright.
 *   2. Otherwise the heading text is matched against the block title.
 *   3. A heading that matches nothing becomes a new manual block at the end of
 *      the free band, named after the heading. Content is never dropped.
 *   4. Content that sits before the first heading goes to the first block.
 *
 * Segment bodies keep their original HTML, so tables and figures survive as
 * nodes rather than flattened text.
 */

export type LegacyBlock = {
  key: string;
  title: string;
  orderIndex: number;
};

export type LegacySegment = {
  /** Heading text, or null for content before the first heading. */
  heading: string | null;
  /** Value of any `data-*-slot-key` attribute on the heading. */
  slotKey: string | null;
  /** Raw HTML of the segment body (heading excluded). */
  html: string;
  /** Length of the visible text in the body. */
  chars: number;
  tables: number;
  figures: number;
};

export type SegmentMatch = LegacySegment & {
  /** Target block key, or null when a new manual block must be created. */
  targetKey: string | null;
  /** Title for the new manual block when `targetKey` is null. */
  newBlockTitle: string | null;
  reason: 'slot-key' | 'title-match' | 'preamble' | 'unmatched';
};

const HEADING_RE = /<(h[1-4])\b([^>]*)>([\s\S]*?)<\/\1>/gi;

export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normaliseTitle(s: string): string {
  return htmlToText(s)
    .toLowerCase()
    .replace(/&|\band\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countTag(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
}

/** Split a legacy document into heading-led segments. */
export function splitByHeadings(html: string): LegacySegment[] {
  const segments: LegacySegment[] = [];
  const marks: { start: number; end: number; attrs: string; text: string }[] = [];
  let m: RegExpExecArray | null;
  HEADING_RE.lastIndex = 0;
  while ((m = HEADING_RE.exec(html)) !== null) {
    marks.push({ start: m.index, end: m.index + m[0].length, attrs: m[2], text: htmlToText(m[3]) });
  }

  const push = (heading: string | null, attrs: string, body: string) => {
    const slot = /data-[a-z0-9-]*slot-key\s*=\s*"([^"]+)"/i.exec(attrs);
    segments.push({
      heading,
      slotKey: slot ? slot[1] : null,
      html: body.trim(),
      chars: htmlToText(body).length,
      tables: countTag(body, 'table'),
      figures: countTag(body, 'img') + countTag(body, 'figure'),
    });
  };

  if (marks.length === 0) {
    push(null, '', html);
    return segments;
  }

  const preamble = html.slice(0, marks[0].start);
  if (htmlToText(preamble).length > 0) push(null, '', preamble);

  marks.forEach((mark, i) => {
    const body = html.slice(mark.end, i + 1 < marks.length ? marks[i + 1].start : html.length);
    push(mark.text, mark.attrs, body);
  });

  return segments;
}

/** Map segments onto blocks. Never drops content. */
export function matchSegments(segments: LegacySegment[], blocks: LegacyBlock[]): SegmentMatch[] {
  const byKeySuffix = new Map<string, LegacyBlock>();
  const byTitle = new Map<string, LegacyBlock>();
  for (const b of blocks) {
    byKeySuffix.set(b.key.split('.').pop() || b.key, b);
    byTitle.set(normaliseTitle(b.title), b);
  }
  const first = [...blocks].sort((a, b) => a.orderIndex - b.orderIndex)[0];

  return segments.map((seg): SegmentMatch => {
    if (seg.heading === null) {
      return { ...seg, targetKey: first?.key ?? null, newBlockTitle: null, reason: 'preamble' };
    }
    if (seg.slotKey) {
      const hit = byKeySuffix.get(seg.slotKey) || blocks.find((b) => b.key === seg.slotKey);
      if (hit) return { ...seg, targetKey: hit.key, newBlockTitle: null, reason: 'slot-key' };
    }
    const norm = normaliseTitle(seg.heading);
    const exact = byTitle.get(norm);
    if (exact) return { ...seg, targetKey: exact.key, newBlockTitle: null, reason: 'title-match' };

    const fuzzy = blocks.find((b) => {
      const t = normaliseTitle(b.title);
      return t.length > 3 && (t.startsWith(norm) || norm.startsWith(t));
    });
    if (fuzzy) return { ...seg, targetKey: fuzzy.key, newBlockTitle: null, reason: 'title-match' };

    return { ...seg, targetKey: null, newBlockTitle: seg.heading, reason: 'unmatched' };
  });
}
