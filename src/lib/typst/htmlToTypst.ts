/**
 * `content_html` → Typst.
 *
 * The stored HTML is walked with the browser's own DOM parser and emitted as
 * Typst CODE (function calls composed with `+`), never as Typst markup. All
 * literal text goes through `t("…")`, so no character in the document can be
 * read as Typst syntax — the only escaping needed is for `"` and `\`.
 *
 * Anything this step does not handle is recorded in `unsupported` and, when it
 * is block-level, rendered as a visible `not-converted` placeholder rather
 * than silently dropped.
 */

import type { RefSnapshot } from '@/lib/referenceData';
import { captionLetter } from '@/lib/cards/captionSlots';
import { chipKind, chipToTypst, reduceChip, toHex } from './typstChips';
import { htmlToPlainText } from '@/lib/htmlToPlainText';

export interface ConvertContext {
  data?: RefSnapshot;
  /** Names of things encountered but not converted, for the report. */
  unsupported: Set<string>;
  /**
   * Per-page footnote state for citations. `numbers` and `html` come from the
   * proposal-wide numbering module (never recomputed here); `emitted` records
   * which references already carry a footnote in THIS document, so only the
   * first citation of a reference prints one.
   */
  citations?: {
    numbers: Map<number, number>;
    html: Map<number, string>;
    /** Bare titles, used to shorten an overlong footnote to a single line. */
    titles?: Map<number, string>;
    emitted: Set<number>;
  };
  /**
   * Emits a B1.2 cases ("pilots") table. The stored HTML holds only an empty
   * atom `<div data-cases-table-node>`, so without this the table converts to
   * nothing — the caller supplies the fetched data (see `casesData.ts`).
   */
  casesTable?: (caseTypeId: string | null, captionLabel: string | null, ctx: ConvertContext) => string[];
  /**
   * Emits an A2 → B3.2 mirror slot. Like the cases table, the stored HTML holds
   * only an empty atom `<div data-b32-mirror-slot data-b32-slot-key="…">`, so
   * without this the mirrored participant content converts to nothing (see
   * `b32Mirrors.ts`).
   */
  b32Slot?: (slotKey: string | null, ctx: ConvertContext) => string[];
  /**
   * Emits the B3.2 "Access to critical infrastructure" table. Stored HTML holds
   * only `<div data-b32-infra-table data-header="…">`; rows come from
   * `participant_infrastructure.project_support` (see `b32InfraData.ts`).
   */
  b32InfraTable?: (header: string, ctx: ConvertContext) => string[];
  /** Position-derived caption sequence for authored content outside B3.1. */
  captionNumbering?: {
    sectionNumber: string;
    tableIndex: number;
    figureIndex: number;
  };
}

export function typstString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const lit = (s: string) => `t(${typstString(s)})`;

function join(parts: string[]): string {
  const kept = parts.filter((p) => p && p.trim());
  if (kept.length === 0) return lit('');
  return kept.join(' + ');
}

/* ─────────────────────────────── inline ────────────────────────────────── */

const MARK_WRAPPERS: Record<string, (inner: string) => string> = {
  strong: (x) => `strong(${x})`,
  b: (x) => `strong(${x})`,
  em: (x) => `emph(${x})`,
  i: (x) => `emph(${x})`,
  u: (x) => `underline(${x})`,
  s: (x) => `strike(${x})`,
  strike: (x) => `strike(${x})`,
  del: (x) => `strike(${x})`,
  sub: (x) => `sub(${x})`,
  sup: (x) => `super(${x})`,
  code: (x) => `raw(${x})`,
};

/**
 * A citation becomes a Typst FOOTNOTE the first time its reference appears in
 * the document, and a bare superscript number every time after that. The
 * number is always the proposal-wide display number derived by the numbering
 * module, so the footnote marker and the on-screen superscript agree.
 */
function convertCitation(el: Element, ctx: ConvertContext): string {
  const refKey = Number((el.getAttribute('data-citation') || '').trim());
  const state = ctx.citations;
  if (!state || !Number.isFinite(refKey)) {
    ctx.unsupported.add('citation');
    return '';
  }
  const display = state.numbers.get(refKey);
  if (display == null) return '';
  if (state.emitted.has(refKey)) {
    return `he-cite-again(${typstString(String(display))})`;
  }
  state.emitted.add(refKey);
  const raw = state.html.get(refKey) || '';
  const body = htmlToTypstInline(raw, ctx);
  const num = typstString(String(display));

  // One-line fit: the title is the only part that may be shortened, so the
  // emitter hands Typst the plain text on either side of it. Typst measures
  // the entry against the footnote width and drops whole words from the end
  // of the title until it fits (see `he-cite-note-fit`).
  const title = (state.titles?.get(refKey) || '').trim();
  const plain = htmlToPlainText(raw).replace(/\s+/g, ' ').trim();
  const at = title ? plain.indexOf(title) : -1;
  if (at >= 0) {
    const pre = plain.slice(0, at);
    const post = plain.slice(at + title.length);
    return `he-cite-note-fit(${num}, ${body}, ${typstString(pre)}, ${typstString(title)}, ${typstString(post)})`;
  }
  return `he-cite-note(${num}, ${body})`;
}

function inlineColour(el: Element): string | null {
  const colour = (el as HTMLElement).style?.color?.trim();
  if (!colour || colour === 'inherit') return null;
  const hex = toHex(colour, '');
  return hex || null;
}

function convertInlineChildren(node: Node, ctx: ConvertContext): string {
  return join(Array.from(node.childNodes).map((child) => convertInline(child, ctx)));
}

/** The previous sibling that carries ink (whitespace-only text is skipped). */
function previousMeaningful(node: Node): Node | null {
  let prev = node.previousSibling;
  while (prev && prev.nodeType === Node.TEXT_NODE && !(prev.textContent || '').trim()) {
    prev = prev.previousSibling;
  }
  return prev;
}

function convertInline(node: Node, ctx: ConvertContext): string {
  if (node.nodeType === Node.TEXT_NODE) {
    let text = (node.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
    if (!text) return '';
    // A space that immediately FOLLOWS a chip is made non-breaking, so it can
    // never be pushed to the head of the next line as a stray indent.
    const prev = previousMeaningful(node);
    if (
      text.startsWith(' ') &&
      prev &&
      prev.nodeType === Node.ELEMENT_NODE &&
      chipKind(prev as Element)
    ) {
      text = `\u00a0${text.slice(1)}`;
    }
    return lit(text);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  // Chips first: their inner spans are decoration and must never be walked.
  const kind = chipKind(el);
  if (kind) {
    const chip = reduceChip(el, kind, ctx.data);
    return chip ? chipToTypst(chip) : '';
  }

  if (tag === 'br') return `linebreak()`;
  if (tag === 'img') {
    ctx.unsupported.add('inline image');
    return `not-converted(${typstString('[image — not rendered in this step]')})`;
  }
  if (el.hasAttribute('data-citation')) {
    return convertCitation(el, ctx);
  }
  // Tracked changes never reach the preview or the export. The document is
  // rendered as it stood BEFORE the tracked editing — every pending change
  // rejected: an insertion is omitted, a deletion is restored as ordinary
  // text. A change only shows once it has been accepted in the editor.
  if (el.hasAttribute('data-track-insertion')) return '';
  if (el.hasAttribute('data-track-deletion')) {
    return convertInlineChildren(el, ctx);
  }


  if (tag === 'a') {
    const href = el.getAttribute('href') || '';
    const inner = convertInlineChildren(el, ctx);
    return href ? `link(${typstString(href)}, ${inner})` : inner;
  }

  let out = convertInlineChildren(el, ctx);
  const wrapper = MARK_WRAPPERS[tag];
  if (wrapper) out = wrapper(out);

  const colour = inlineColour(el);
  if (colour) out = `text(fill: rgb(${typstString(colour)}), ${out})`;

  // Bold set through a STYLE rather than a <strong> tag. TipTap writes
  // `font-weight: bolder` on runs pasted or split around an inline atom (a
  // chip), and the old numeric-only test discarded it, so a title bolded end
  // to end in the editor printed only the <strong>-marked part in bold.
  const weight = ((el as HTMLElement).style?.fontWeight || '').trim().toLowerCase();
  const numericWeight = Number(weight);
  if (weight === 'bold' || weight === 'bolder' || (Number.isFinite(numericWeight) && numericWeight >= 600)) {
    out = `strong(${out})`;
  }

  const fontStyle = (el as HTMLElement).style?.fontStyle;
  if (fontStyle === 'italic') out = `emph(${out})`;

  return out;
}

/* ─────────────────────────────── blocks ─────────────────────────────────── */

const ALIGNMENTS: Record<string, string> = {
  left: 'left',
  center: 'center',
  centre: 'center',
  right: 'right',
  justify: 'left',
};

function blockSpacing(el: Element): { above: string | null; below: string | null } {
  const before = el.getAttribute('data-spacing-before');
  const after = el.getAttribute('data-spacing-after');
  const num = (v: string | null) => (v != null && v !== '' && Number.isFinite(Number(v)) ? `${Number(v)}pt` : null);
  return { above: num(before), below: num(after) };
}

function wrapBlock(el: Element, body: string): string {
  const { above, below } = blockSpacing(el);
  const args = [above ? `above: ${above}` : '', below ? `below: ${below}` : ''].filter(Boolean);
  const withSpacing = args.length ? `block(${args.join(', ')}, ${body})` : body;

  const raw = ((el as HTMLElement).style?.textAlign || '').toLowerCase();
  const align = ALIGNMENTS[raw];
  if (align && align !== 'left') return `align(${align}, ${withSpacing})`;
  return withSpacing;
}

function convertParagraph(el: Element, ctx: ConvertContext): string {
  const inner = convertInlineChildren(el, ctx);
  const justify = ((el as HTMLElement).style?.textAlign || '').toLowerCase() === 'justify';
  return wrapBlock(el, `par(justify: ${justify ? 'true' : 'false'}, ${inner})`);
}

/** Table/figure captions are SIBLING paragraphs, not children of the table. */
function convertCaption(el: Element, ctx: ConvertContext): string {
  const classes = el.classList;
  const markedLabel = el.querySelector('[data-caption-label]')?.textContent ?? '';
  const isFigure =
    classes.contains('figure-caption') ||
    classes.contains('document-figure-caption') ||
    /^\s*Figure\b/i.test(markedLabel);
  const kind = isFigure ? 'Figure' : 'Table';
  const numbering = ctx.captionNumbering;
  const index = numbering
    ? isFigure
      ? numbering.figureIndex++
      : numbering.tableIndex++
    : 0;
  const derivedLabel = numbering
    ? `${kind} ${numbering.sectionNumber.replace(/^[A-Za-z]+/, '')}.${captionLetter(index)}.`
    : '';
  const labelEl = el.querySelector('[data-caption-label]');
  const storedLabel = (labelEl?.textContent || '').trim();
  const label = derivedLabel || storedLabel;
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[data-caption-label]').forEach((n) => n.remove());
  // Captions are italic as a whole (`he-caption` emphasises them). Stored
  // captions usually wrap their text in <em>, which in Typst would TOGGLE the
  // emphasis back to upright — so unwrap those marks here and let the helper
  // supply the single, authoritative italic.
  clone.querySelectorAll('em, i').forEach((n) => {
    const parent = n.parentNode;
    if (!parent) return;
    while (n.firstChild) parent.insertBefore(n.firstChild, n);
    parent.removeChild(n);
  });
  const rest = convertInlineChildren(clone, ctx);
  const helper = isFigure ? 'he-figure-caption' : 'he-caption';

  return `${helper}(${typstString(label)}, ${rest})`;
}

const HEADING_SIZES: Record<number, string> = { 1: '14pt', 2: '13pt', 3: '12pt', 4: '11pt' };

function convertHeading(el: Element, level: number, ctx: ConvertContext): string {
  // The number comes from the `data-heading-number` span, never from parsing
  // the heading text.
  const numberEl = el.querySelector('[data-heading-number]');
  const number = (numberEl?.textContent || '').trim();
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[data-heading-number]').forEach((n) => n.remove());
  const title = convertInlineChildren(clone, ctx).replace(/^t\(" /, 't("');
  const prefix = number ? `${lit(number.endsWith(' ') ? number : `${number} `)} + ` : '';
  const size = HEADING_SIZES[level] || '11pt';
  // Headings use the ordinary 3pt paragraph spacing (the document spec), not
  // an enlarged structural gap: a H4 between two modules must not open a
  // wider hole than a paragraph break.
  //
  // `wrapBlock` is deliberately NOT used for the spacing here. Editor-stored
  // `data-spacing-before` / `data-spacing-after` attributes (typically 6-12pt,
  // inherited from pasted content) were wrapping the heading in a SECOND block
  // whose own margins won out over the 3pt inner ones, which is what made the
  // gap above and below every H3 larger than specified. The heading's spacing
  // is fixed by the document spec, so the stored values are ignored; only the
  // alignment from `wrapBlock` still applies.
  const alignRaw = ((el as HTMLElement).style?.textAlign || '').toLowerCase();
  const align = ALIGNMENTS[alignRaw];
  // `sticky: true` keeps the heading on the same page as the content it
  // introduces.
  const block = `block(above: 3pt, below: 3pt, sticky: true, text(size: ${size}, weight: "bold", ${prefix}${title}))`;
  return align && align !== 'left' ? `align(${align}, ${block})` : block;
}

const LIST_NUMBERING: Record<string, string> = {
  decimal: '"1."',
  'lower-alpha': '"a."',
  'lower-latin': '"a."',
  'upper-alpha': '"A."',
  'upper-latin': '"A."',
  'lower-roman': '"i."',
  'upper-roman': '"I."',
};

function convertList(el: Element, ctx: ConvertContext): string {
  const ordered = el.tagName.toLowerCase() === 'ol';
  const items: string[] = [];
  Array.from(el.children).forEach((li) => {
    if (li.tagName.toLowerCase() !== 'li') return;
    const inlineParts: string[] = [];
    const nested: string[] = [];
    Array.from(li.childNodes).forEach((child) => {
      const childTag =
        child.nodeType === Node.ELEMENT_NODE ? (child as Element).tagName.toLowerCase() : '';
      if (childTag === 'ul' || childTag === 'ol') {
        nested.push(convertList(child as Element, ctx));
      } else if (childTag === 'p') {
        inlineParts.push(convertInlineChildren(child as Element, ctx));
      } else {
        inlineParts.push(convertInline(child, ctx));
      }
    });
    items.push(join([join(inlineParts), ...nested]));
  });
  if (!items.length) return '';
  if (ordered) {
    const style =
      el.getAttribute('data-list-style') || (el as HTMLElement).style?.listStyleType || 'decimal';
    const numbering = LIST_NUMBERING[style] || '"1."';
    const startAttr = el.getAttribute('start');
    const start = startAttr && Number.isFinite(Number(startAttr)) ? `, start: ${Number(startAttr)}` : '';
    return wrapBlock(el, `enum(numbering: ${numbering}${start}, ${items.join(', ')})`);
  }
  return wrapBlock(el, `list(${items.join(', ')})`);
}

function cellAlign(cell: Element): string | null {
  const raw = ((cell as HTMLElement).style?.textAlign || '').toLowerCase();
  const align = ALIGNMENTS[raw];
  return align && align !== 'left' ? align : null;
}

function convertCell(cell: Element, ctx: ConvertContext, header: boolean): string {
  const blocks = Array.from(cell.children).filter((c) =>
    ['p', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4'].includes(c.tagName.toLowerCase()),
  );
  // A document paragraph may deliberately be justified, but that formatting
  // must not leak into a table cell. Tables are left aligned throughout Part B.
  const body = (blocks.length
    ? join(blocks.map((b) => convertBlock(b, ctx)))
    : `par(justify: false, ${convertInlineChildren(cell, ctx)})`)
    .replace(/par\(justify: true,/g, 'par(justify: false,');
  const inner = header ? `strong(${body})` : body;
  const args: string[] = [];
  const colspan = Number(cell.getAttribute('colspan') || '1');
  const rowspan = Number(cell.getAttribute('rowspan') || '1');
  if (colspan > 1) args.push(`colspan: ${colspan}`);
  if (rowspan > 1) args.push(`rowspan: ${rowspan}`);
  const align = cellAlign(cell);
  if (align) args.push(`align: ${align}`);
  return `table.cell(${args.length ? `${args.join(', ')}, ` : ''}${inner})`;
}

/**
 * The editor's own text column: 18 cm at 96 CSS px per inch. An authored table
 * fills that width on the block board, so a column the author never dragged
 * takes an equal share of whatever the dragged columns leave over — exactly
 * what `table-layout: fixed` does on screen.
 */
const EDITOR_TABLE_PX = Math.round((18 / 2.54) * 96);
/** TipTap's own per-column floor, so a filler column is never absurdly thin. */
const MIN_COL_PX = 25;

/**
 * Column widths in editor pixels, from `<colgroup>` first and then per-cell
 * `colwidth`. TipTap only writes a width for columns that have been RESIZED
 * (the rest carry `min-width` alone), so a partially resized table is
 * completed here with the remaining width shared equally — the same geometry
 * the editor lays out — instead of collapsing to equal columns throughout.
 */
function columnWidths(table: Element, colCount: number): number[] | null {
  const explicit: Array<number | null> = Array.from({ length: colCount }, () => null);

  const cols = Array.from(table.querySelectorAll('colgroup > col'));
  if (cols.length === colCount) {
    cols.forEach((c, i) => {
      // `min-width` is TipTap's placeholder for "not resized" — only an actual
      // `width` is an authored measurement.
      const raw = c.getAttribute('width') || (c as HTMLElement).style?.width || '';
      const value = Number(String(raw).replace('px', '').trim());
      if (Number.isFinite(value) && value > 0) explicit[i] = value;
    });
  }

  if (explicit.every((w) => w == null)) {
    const firstRow = table.querySelector('tr');
    if (firstRow) {
      let index = 0;
      Array.from(firstRow.children).forEach((cell) => {
        const parts = (cell.getAttribute('colwidth') || '')
          .split(',')
          .map((n) => Number(n));
        const span = Number(cell.getAttribute('colspan') || '1');
        for (let i = 0; i < span; i += 1, index += 1) {
          const value = parts[i];
          if (index < colCount && Number.isFinite(value) && value > 0) explicit[index] = value;
        }
      });
    }
  }

  if (explicit.every((w) => w == null)) return null;
  if (explicit.every((w) => w != null)) return explicit as number[];

  const known = explicit.reduce<number>((sum, w) => sum + (w || 0), 0);
  const missing = explicit.filter((w) => w == null).length;
  const filler = Math.max(MIN_COL_PX, (EDITOR_TABLE_PX - known) / missing);
  return explicit.map((w) => (w == null ? filler : w));
}


function convertTable(el: Element, ctx: ConvertContext): string {
  const rows = Array.from(el.querySelectorAll('tr'));
  if (!rows.length) return '';
  const colCount = Array.from(rows[0].children).reduce(
    (sum, c) => sum + Number(c.getAttribute('colspan') || '1'),
    0,
  );
  const widths = columnWidths(el, colCount);
  // Fractions rather than absolute widths: the table is placed in an 18cm
  // block, so proportional columns are exactly the capped geometry.
  // Trailing commas are load-bearing: `(x)` is a plain parenthesised value in
  // Typst, and spreading it raises "cannot spread content". `(x,)` is a
  // one-element array, and `()` an empty one.
  const columns = widths
    ? `(${widths.map((w) => `${(w / Math.min(...widths)).toFixed(3)}fr`).join(', ')},)`
    : `(${Array.from({ length: colCount }, () => '1fr').join(', ')},)`;

  const emittedCells: string[] = [];
  rows.forEach((row, index) => {
    const rowCells = Array.from(row.children).filter((c) =>
      ['td', 'th'].includes(c.tagName.toLowerCase()),
    );
    const isHeader = index === 0 && rowCells.length > 0 && rowCells.every((c) => c.tagName.toLowerCase() === 'th');
    const converted = rowCells.map((c) => convertCell(c, ctx, isHeader || c.tagName.toLowerCase() === 'th'));
    if (isHeader) emittedCells.push(`table.header(${converted.join(', ')})`);
    else emittedCells.push(...converted);
  });
  if (!emittedCells.length || !colCount) return '';

  return `he-authored-table(${columns}, (${emittedCells.join(', ')},), ${rows.length})`;

}

function convertBlock(el: Element, ctx: ConvertContext): string {
  const tag = el.tagName.toLowerCase();

  // Cases table atom: empty in the stored HTML, rendered from case_drafts.
  // It consumes a slot in the position-derived caption sequence exactly as
  // the on-screen NodeView does.
  if (el.hasAttribute('data-cases-table-node')) {
    const numbering = ctx.captionNumbering;
    const label = numbering
      ? `Table ${numbering.sectionNumber.replace(/^[A-Za-z]+/, '')}.${captionLetter(numbering.tableIndex++)}.`
      : null;
    if (!ctx.casesTable) {
      ctx.unsupported.add('cases table');
      return '';
    }
    const parts = ctx.casesTable(el.getAttribute('data-case-type-id'), label, ctx);
    return parts.length ? `{\n${parts.join('\n')}\n}` : '';
  }

  // B3.2 critical-infrastructure table atom: rows fetched from A2.
  if (el.hasAttribute('data-b32-infra-table')) {
    if (!ctx.b32InfraTable) {
      ctx.unsupported.add('B3.2 infrastructure table');
      return '';
    }
    const parts = ctx.b32InfraTable(el.getAttribute('data-header') || '', ctx);
    return parts.length ? `{\n${parts.join('\n')}\n}` : '';
  }

  // B3.2 mirror slot atom: empty in the stored HTML, rendered from A2 data.
  if (el.hasAttribute('data-b32-mirror-slot')) {
    const slotKey = el.getAttribute('data-b32-slot-key');
    if (!ctx.b32Slot) {
      ctx.unsupported.add(`B3.2 mirror slot ${slotKey || '—'}`);
      return '';
    }
    const parts = ctx.b32Slot(slotKey, ctx);
    return parts.length ? `{\n${parts.join('\n')}\n}` : '';
  }

  if (
    el.classList.contains('table-caption') ||
    el.classList.contains('document-table-caption') ||
    el.classList.contains('figure-caption') ||
    el.classList.contains('document-figure-caption') ||
    el.hasAttribute('data-caption-label') ||
    !!el.querySelector('[data-caption-label]')
  ) {
    return convertCaption(el, ctx);
  }

  switch (tag) {
    case 'p':
      return convertParagraph(el, ctx);
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
      return convertHeading(el, Number(tag[1]), ctx);
    case 'ul':
    case 'ol':
      return convertList(el, ctx);
    case 'table':
      return convertTable(el, ctx);
    case 'blockquote':
      return wrapBlock(
        el,
        `block(inset: (left: 12pt), stroke: (left: 2pt + rgb("#cccccc")), ${join(
          Array.from(el.children).map((c) => convertBlock(c, ctx)),
        )})`,
      );
    case 'div':
    case 'section':
    case 'article':
      return join(Array.from(el.children).map((c) => convertBlock(c, ctx)));
    case 'figure':
    case 'img':
      ctx.unsupported.add('figure/image');
      return `not-converted(${typstString('[figure — not rendered in this step]')})`;
    case 'hr':
      return `line(length: 100%, stroke: 0.5pt)`;
    default: {
      ctx.unsupported.add(`<${tag}>`);
      return `par(justify: false, ${convertInlineChildren(el, ctx)})`;
    }
  }
}

/**
 * Converts one stored `content_html` value to a Typst expression list, one
 * top-level block per entry.
 */
export function htmlToTypstBlocks(html: string | null | undefined, ctx: ConvertContext): string[] {
  const raw = (html ?? '').toString().trim();
  if (!raw) return [];
  const tpl = document.createElement('template');
  tpl.innerHTML = raw;
  const out: string[] = [];
  Array.from(tpl.content.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').trim();
      if (text) out.push(`par(justify: false, ${lit(text)})`);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const converted = convertBlock(node as Element, ctx);
    if (converted) out.push(converted);
  });
  return out;
}

/** Tags that stand as their own paragraph when they appear at top level. */
const INLINE_BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'pre',
]);

export function htmlToTypstInline(html: string | null | undefined, ctx: ConvertContext): string {
  const raw = (html ?? '').toString().trim();
  if (!raw) return lit('');
  const tpl = document.createElement('template');
  tpl.innerHTML = raw;
  const nodes = Array.from(tpl.content.childNodes);
  // Multi-paragraph content reaches this function through the table emitters
  // (WP objectives, the field before tasks, task descriptions). Walking its
  // children inline ran the paragraphs together on one line; each top-level
  // block therefore contributes a `parbreak()`, giving cells the same
  // paragraphing the block converter gives body copy.
  const blockCount = nodes.filter(
    (n) => n.nodeType === Node.ELEMENT_NODE && INLINE_BLOCK_TAGS.has((n as Element).tagName.toLowerCase()),
  ).length;
  if (blockCount > 1) {
    const parts = nodes
      .map((n) => convertInline(n, ctx))
      .filter((p) => p && p.trim() && p !== lit(''));
    return parts.length ? parts.join(' + parbreak() + ') : lit('');
  }
  return convertInlineChildren(tpl.content, ctx);
}

