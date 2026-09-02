/**
 * One shared layout definition for every lump-sum table and total row.
 *
 * Every figure in the lump sum budget — line totals, category totals,
 * parent totals, per-work-package subtotals and the E–H totals table — must
 * share a single right edge. That is only possible if every table agrees on
 * two numbers: the width of the figure column, and the combined width of
 * everything to the right of it (the delete/action gutter). Those two values
 * live here and nowhere else; no lump-sum table may declare its own.
 */

/** Width of the column that holds costs and totals. */
export const LS_FIGURE_WIDTH = 120;

/**
 * Distance from a section container's right edge to the figure column's right
 * edge: the width of the trailing delete/action column.
 */
export const LS_RIGHT_GUTTER = 34;

/** Every column width used anywhere in the lump-sum tables. */
export const LS_COL = {
  grip: 30,
  /** Work package selector column in the B–D cost tables. */
  wp: 84,
  quantity: 76,
  unitCost: 96,
  /** Personnel table columns. */
  role: 130,
  category: 120,
  rate: 78,
  wpPm: 44,
  totalPm: 66,
  /** Summary-table columns. */
  summaryWp: 64,
  summaryMoney: 96,
  /** A–E in the summary table: narrower, so the table's right edge still coincides. */
  summaryNarrow: 70,
  request: 100,
  percent: LS_FIGURE_WIDTH,
  /** Depreciation-register columns before its flexible comments spacer. */
  depreciationType: 90,
  depreciationName: 110,
  depreciationDate: 100,
  depreciationCost: 90,
  depreciationPercent: 60,
  depreciationInclude: 65,
  /** The shared figure column and the gutter to its right. */
  figure: LS_FIGURE_WIDTH,
  gutter: LS_RIGHT_GUTTER,
  /** Semantic aliases for itemised cost tables. */
  amount: LS_FIGURE_WIDTH,
  delete: LS_RIGHT_GUTTER,
} as const;

/** Minimum width for the personnel grid before its own horizontal scroller engages. */
export const LS_PERSONNEL_MIN_WIDTH = (workPackageCount: number, hasCategoryColumn: boolean) =>
  LS_COL.grip + LS_COL.role + (hasCategoryColumn ? LS_COL.category : 0) + LS_COL.rate
  + workPackageCount * LS_COL.wpPm + LS_COL.totalPm + LS_COL.figure + LS_COL.gutter;

/**
 * Cell classes for the figure column and for the label immediately left of it.
 * Identical padding on both sides of every table is what makes the right edges
 * coincide to the pixel.
 */
export const LS_FIGURE_CELL = 'px-1 text-right tabular-nums';
export const LS_LABEL_CELL = 'px-1 text-right';

/** Every aligned table uses one full-width, fixed-layout box. */
export const LS_TABLE = 'w-full table-fixed border-collapse';

/** Shared colgroup for a label + figure + gutter total row. */
export const LS_TOTAL_COLS = [LS_COL.grip, null, LS_COL.figure, LS_COL.gutter] as const;
