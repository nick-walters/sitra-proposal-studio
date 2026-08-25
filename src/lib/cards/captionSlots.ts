/**
 * Caption slot counting for the block board.
 *
 * Table and figure captions are numbered by POSITION, never by hand: the
 * board walks its blocks in document order and hands every editor the index
 * its first table/figure should take. This module owns the two primitives
 * that walk needs — the letter for an index, and how many caption slots a
 * stored HTML fragment occupies.
 */

/** a, b, c … z, aa, ab … — the caption letter for a 0-based index. */
export function captionLetter(index: number): string {
  if (index < 0) return 'a';
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export interface CaptionSlots {
  tables: number;
  figures: number;
}

/** A caption written before the classes existed still starts with its label. */
const LEGACY_LABEL = /^\s*(Figure|Table)\s+\d+(?:\.\d+)*\.[a-z]+\./i;

/**
 * Whether a paragraph is a table or figure caption. Detection matches the
 * editor extension exactly (class first, then the legacy label text), so the
 * board's walk and the auto-numbering plugin can never disagree about how
 * many slots a text box burns.
 */
function captionKind(p: Element): 'table' | 'figure' | null {
  const cls = p.className || '';
  if (cls.includes('document-table-caption')) return 'table';
  if (cls.includes('figure-caption')) return 'figure';
  const m = LEGACY_LABEL.exec(p.textContent ?? '');
  if (!m) return null;
  return m[1].toLowerCase() === 'figure' ? 'figure' : 'table';
}

/**
 * How many table and figure caption slots a text box occupies. A cases-table
 * atom carries its caption inside its node view, so it burns a table slot
 * even though the stored HTML holds no caption paragraph.
 */
export function countCaptionSlots(html: string | null | undefined): CaptionSlots {
  if (!html) return { tables: 0, figures: 0 };
  if (typeof document === 'undefined') return { tables: 0, figures: 0 };
  const holder = document.createElement('div');
  holder.innerHTML = html;
  let tables = holder.querySelectorAll('div[data-cases-table-node]').length;
  let figures = 0;
  holder.querySelectorAll('p').forEach((p) => {
    const kind = captionKind(p);
    if (kind === 'table') tables += 1;
    else if (kind === 'figure') figures += 1;
  });
  return { tables, figures };
}
