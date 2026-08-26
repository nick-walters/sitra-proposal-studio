/**
 * Single source of truth for Horizon Europe table styling.
 *
 * Before this module the same values were repeated in four places: two blocks
 * in `src/index.css` (`.he-table` and `.ProseMirror table`), the print block
 * (`.print-export-container .print-table`) and inline styles in
 * `CasesTableNodeView.tsx` / `printRenderer.tsx`. They had already drifted
 * (0.03pt vs 1px vertical padding, 0.5px vs 1px body borders).
 *
 * The constants below are authoritative. `src/styles/table-card.css` consumes
 * them through CSS custom properties which `installTableStyleVars()` writes on
 * to `:root` at boot, so the stylesheet and the TypeScript exports can never
 * drift apart. Export paths that need literal CSS text call `tableStyleCss()`.
 */

import type { CSSProperties } from 'react';

/* ------------------------------------------------------------------ tokens */

/** Times first, then the metric-compatible URW clone used on Linux print hosts. */
export const TABLE_FONT_FAMILY =
  "'Times New Roman', Times, 'Nimbus Roman No9 L', serif";

export const TABLE_FONT_SIZE = '11pt';
export const TABLE_LINE_HEIGHT = '1.0';

/**
 * Cell padding.
 *
 * Deliberately NOT the 0.3pt from the original brief: Word adds its own default
 * cell margins (0.19 cm each side) on top of whatever the CSS declares, and a
 * literal 0.3pt in the browser is visually zero, so adjacent columns collide in
 * HTML/PDF while looking fine in Word. These values reproduce the density of the
 * current editor tables exactly (`1px 4px`) — 0.75pt vertical, 3pt horizontal —
 * which is very tight but leaves a visible gutter between columns at 11pt.
 */
export const TABLE_CELL_PADDING_Y = '1px';
export const TABLE_CELL_PADDING_X = '4px';
export const TABLE_CELL_PADDING = `${TABLE_CELL_PADDING_Y} ${TABLE_CELL_PADDING_X}`;

export const TABLE_HEADER_BORDER = '1.5px solid #000000';
export const TABLE_BODY_BORDER = '1px solid #e5e7eb';

export const TABLE_MAX_WIDTH = '18cm';
export const TABLE_LAYOUT = 'fixed';
export const TABLE_WIDTH = '100%';

export const TABLE_DEFAULT_ALIGN_H: CellAlignH = 'left';
export const TABLE_DEFAULT_ALIGN_V: CellAlignV = 'middle';

/** Header rows never repeat across page breaks (Commission house style). */
export const TABLE_HEADER_REPEATS_ON_BREAK = false;

export type CellAlignH = 'left' | 'center' | 'right' | 'justify';
export type CellAlignV = 'top' | 'middle' | 'bottom';
export type TableVariant = 'standard' | 'cases' | 'wp_description';

export const TABLE_STYLE_SPEC = {
  fontFamily: TABLE_FONT_FAMILY,
  fontSize: TABLE_FONT_SIZE,
  lineHeight: TABLE_LINE_HEIGHT,
  cellPaddingY: TABLE_CELL_PADDING_Y,
  cellPaddingX: TABLE_CELL_PADDING_X,
  headerBorder: TABLE_HEADER_BORDER,
  bodyBorder: TABLE_BODY_BORDER,
  maxWidth: TABLE_MAX_WIDTH,
  tableLayout: TABLE_LAYOUT,
  width: TABLE_WIDTH,
  defaultAlignH: TABLE_DEFAULT_ALIGN_H,
  defaultAlignV: TABLE_DEFAULT_ALIGN_V,
  headerRepeatsOnBreak: TABLE_HEADER_REPEATS_ON_BREAK,
} as const;

/* ------------------------------------------------- custom-property bridge */

export const TABLE_CSS_VARS: Record<string, string> = {
  '--card-table-font': TABLE_FONT_FAMILY,
  '--card-table-size': TABLE_FONT_SIZE,
  '--card-table-line-height': TABLE_LINE_HEIGHT,
  '--card-table-pad-y': TABLE_CELL_PADDING_Y,
  '--card-table-pad-x': TABLE_CELL_PADDING_X,
  '--card-table-header-border': TABLE_HEADER_BORDER,
  '--card-table-body-border': TABLE_BODY_BORDER,
  '--card-table-max-width': TABLE_MAX_WIDTH,
};

/** Writes the tokens on to `:root` so `table-card.css` reads the values above. */
export function installTableStyleVars(target?: HTMLElement): void {
  const el = target ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!el) return;
  for (const [name, value] of Object.entries(TABLE_CSS_VARS)) {
    el.style.setProperty(name, value);
  }
}

/* ---------------------------------------------------------- class helpers */

export const TABLE_CLASS = 'card-table';
export const TABLE_HEADER_CELL_CLASS = 'card-table__th';
export const TABLE_BODY_CELL_CLASS = 'card-table__td';
export const TABLE_CAPTION_CLASS = 'document-table-caption';
export const TABLE_CAPTION_LABEL_CLASS = 'caption-label';

/** Class list for a table element, optionally variant-scoped. */
export function tableClass(variant: TableVariant = 'standard', extra?: string): string {
  return [TABLE_CLASS, variant !== 'standard' ? `${TABLE_CLASS}--${variant}` : '', extra]
    .filter(Boolean)
    .join(' ');
}

export function tableCellClass(rowType: 'header' | 'body', extra?: string): string {
  return [rowType === 'header' ? TABLE_HEADER_CELL_CLASS : TABLE_BODY_CELL_CLASS, extra]
    .filter(Boolean)
    .join(' ');
}

export function tableCaptionClass(extra?: string): string {
  return [TABLE_CAPTION_CLASS, extra].filter(Boolean).join(' ');
}

/* ------------------------------------------------------------ align helper */

/** Per-cell alignment overrides; omitted values fall back to the spec defaults. */
export function cellAlignStyle(h?: CellAlignH | null, v?: CellAlignV | null): CSSProperties {
  return {
    textAlign: (h ?? TABLE_DEFAULT_ALIGN_H) as CSSProperties['textAlign'],
    verticalAlign: (v ?? TABLE_DEFAULT_ALIGN_V) as CSSProperties['verticalAlign'],
  };
}

/** Same thing as an inline `style="…"` string, for HTML built as text. */
export function cellAlignCss(h?: CellAlignH | null, v?: CellAlignV | null): string {
  return `text-align:${h ?? TABLE_DEFAULT_ALIGN_H};vertical-align:${v ?? TABLE_DEFAULT_ALIGN_V};`;
}

/* ---------------------------------------------------------- CSS generation */

/**
 * Literal CSS for export contexts (DOCX/PDF pipelines that inline a stylesheet
 * rather than linking one). `scope` prefixes every selector.
 */
export function tableStyleCss(variant: TableVariant = 'standard', scope = ''): string {
  const s = scope ? `${scope} ` : '';
  const t = variant === 'standard' ? `.${TABLE_CLASS}` : `.${TABLE_CLASS}--${variant}`;

  return `
${s}${t} {
  width: ${TABLE_WIDTH};
  max-width: ${TABLE_MAX_WIDTH};
  table-layout: ${TABLE_LAYOUT};
  border-collapse: collapse;
  font-family: ${TABLE_FONT_FAMILY};
  font-size: ${TABLE_FONT_SIZE};
  line-height: ${TABLE_LINE_HEIGHT};
  margin: 0 0 6pt 0;
}
${s}${t} th,
${s}${t} td {
  border: none;
  border-bottom: ${TABLE_BODY_BORDER};
  padding: ${TABLE_CELL_PADDING};
  font-family: ${TABLE_FONT_FAMILY};
  font-size: ${TABLE_FONT_SIZE};
  line-height: ${TABLE_LINE_HEIGHT};
  text-align: ${TABLE_DEFAULT_ALIGN_H};
  vertical-align: ${TABLE_DEFAULT_ALIGN_V};
  word-wrap: break-word;
  overflow-wrap: break-word;
}
${s}${t} th {
  background: transparent;
  color: #000;
  font-weight: bold;
  border-bottom: ${TABLE_HEADER_BORDER};
}
${s}${t} td {
  background: #fff;
  color: #000;
}
${s}${t} tr > :first-child {
  padding-left: 0;
}
${s}${t} tr > :last-child {
  padding-right: 0;
}
${s}${t} tr:last-child > td,
${s}${t} tr:last-child > th {
  border-bottom: none;
}
${s}${t} th p,
${s}${t} td p {
  margin: 0;
  padding: 0;
  line-height: ${TABLE_LINE_HEIGHT};
  font-family: ${TABLE_FONT_FAMILY};
}
${s}${t} thead {
  display: table-row-group; /* header must NOT repeat across page breaks */
}
${s}.${TABLE_CAPTION_CLASS} {
  font-family: ${TABLE_FONT_FAMILY};
  font-size: ${TABLE_FONT_SIZE};
  line-height: ${TABLE_LINE_HEIGHT};
  font-style: italic;
  text-align: left;
  margin: 3pt 0 1pt 0;
  padding: 0;
}
${s}.${TABLE_CAPTION_CLASS} .${TABLE_CAPTION_LABEL_CLASS} {
  font-weight: bold;
  font-style: italic;
}
`.trim();
}

/* ------------------------------------------------- editor (TipTap) markup */

/**
 * Classes TipTap writes on to tables it creates. They are declared here rather
 * than inline in `RichTextEditor` so that HTML generated for seeding is
 * guaranteed identical to HTML produced when a user inserts a table by hand —
 * the two used to be able to drift.
 */
export const EDITOR_TABLE_CLASS = 'he-table';
export const EDITOR_TABLE_HEADER_CELL_CLASS = 'he-table-header';
export const EDITOR_TABLE_BODY_CELL_CLASS = 'he-table-cell';

/** TipTap's own per-column minimum, emitted in the colgroup it round-trips. */
const EDITOR_COL_MIN_WIDTH_PX = 25;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A table in exactly the shape TipTap serialises: `he-table` wrapper, colgroup
 * of per-column minimums, header row of `<th>` and `rows` empty body rows.
 * Cell text lives in a paragraph, as ProseMirror requires.
 */
export function editorTableHtml(columns: string[], rows = 1): string {
  const cols = columns
    .map(() => `<col style="min-width: ${EDITOR_COL_MIN_WIDTH_PX}px;">`)
    .join('');
  const head = columns
    .map(
      (c) =>
        `<th class="${EDITOR_TABLE_HEADER_CELL_CLASS}" colspan="1" rowspan="1">` +
        `<p>${escapeHtml(c)}</p></th>`,
    )
    .join('');
  const bodyRow =
    '<tr>' +
    columns
      .map(
        () =>
          `<td class="${EDITOR_TABLE_BODY_CELL_CLASS}" colspan="1" rowspan="1"><p></p></td>`,
      )
      .join('') +
    '</tr>';
  const minWidth = columns.length * EDITOR_COL_MIN_WIDTH_PX;
  return (
    `<table class="${EDITOR_TABLE_CLASS}" style="min-width: ${minWidth}px;">` +
    `<colgroup>${cols}</colgroup><tbody><tr>${head}</tr>` +
    bodyRow.repeat(Math.max(0, rows)) +
    '</tbody></table>'
  );
}

/**
 * A caption paragraph above a table. The bold-italic label span is left empty
 * and non-editable: `renumberCaptionsInEditor` fills in "Table N.N.x." from the
 * caption's position, so a seeded caption must not hard-code a number.
 */
export function editorTableCaptionHtml(text: string): string {
  return (
    `<p class="${TABLE_CAPTION_CLASS}" style="text-align: left;">` +
    '<span><strong><em>' +
    `<span data-caption-label="" contenteditable="false" ` +
    'style="user-select: none; font-weight: bold; font-style: italic;"></span>' +
    '</em></strong></span>' +
    `<em>${escapeHtml(text)}</em></p>`
  );
}
