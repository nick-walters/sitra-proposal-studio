/**
 * One shared layout definition for every lump-sum table and total row.
 *
 * THE PRINCIPLE
 *
 * Each table has two zones:
 *   - a RIGHT-ANCHORED block of fixed-width columns, in a fixed order, that is
 *     identical across every table of the same kind;
 *   - a LEFT zone whose last flexible column absorbs the remaining width.
 *
 * Because the right block is counted from the right edge inwards, tables with
 * different numbers of left-zone columns (A.1 has an F&TP category column, A.2
 * does not) still line up perfectly on the right. A column in the right block
 * exists in every row of that table even when the row has nothing to put in it.
 *
 * No lump-sum table may declare its own widths; import them from here.
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
  grip: 34,
  /** Work package selector column in the B–D cost tables. */
  wp: 84,
  quantity: 76,
  unitCost: 96,
  /** Personnel table columns. */
  role: 176,
  category: 156,
  rate: 88,
  wpPm: 64,
  totalPm: 80,
  /** Summary-table columns. */
  summaryWp: 64,
  summaryMoney: 96,
  /** A–E in the summary table: narrower, so the table's right edge still coincides. */
  summaryNarrow: 70,
  request: 100,
  percent: LS_FIGURE_WIDTH,
  /**
   * Depreciation-register columns. The short name and the comments both hold
   * free text and were unusably narrow, so each is twice its former width; the
   * date, resource-type and percentage columns give back what they never used.
   */
  depreciationType: 80,
  depreciationName: 192,
  depreciationDate: 96,
  depreciationCost: 88,
  depreciationPercent: 48,
  depreciationInclude: 48,
  depreciationComments: 144,

  /** The shared figure column and the gutter to its right. */
  figure: LS_FIGURE_WIDTH,
  gutter: LS_RIGHT_GUTTER,
  /** Semantic aliases for itemised cost tables. */
  amount: LS_FIGURE_WIDTH,
  delete: LS_RIGHT_GUTTER,
} as const;

/** Sum of a table's fixed columns plus the minimum width of its flexible one. */
export const lsMinWidth = (fixed: number[], flexMinimum: number) =>
  fixed.reduce((sum, width) => sum + width, 0) + flexMinimum;

/**
 * The role-name column may compress to this before the table scrolls: the
 * right-anchored block must never shrink, but the flexible column may.
 */
const PERSONNEL_FLEX_MINIMUM = 80;

/**
 * Minimum width of a personnel table (A.1–A.4). The role-name column is the
 * flexible one, so it supplies the minimum.
 */
export const LS_PERSONNEL_MIN_WIDTH = (workPackageCount: number, hasCategoryColumn: boolean) =>
  lsMinWidth([
    LS_COL.grip,
    ...(hasCategoryColumn ? [LS_COL.category] : []),
    LS_COL.rate,
    workPackageCount * LS_COL.wpPm,
    LS_COL.totalPm,
    LS_COL.figure,
    LS_COL.gutter,
  ], PERSONNEL_FLEX_MINIMUM);

/** Minimum width of an itemised cost table (B.1, C.1, C.2/C.3 sub-lines). */
export const LS_ITEMISED_MIN_WIDTH = lsMinWidth(
  [LS_COL.grip, LS_COL.wp, LS_COL.quantity, LS_COL.unitCost, LS_COL.figure, LS_COL.gutter],
  240,
);

/** Minimum width of a D table (D.1, D.2). */
export const LS_D_MIN_WIDTH = lsMinWidth([LS_COL.grip, LS_COL.wp, LS_COL.figure, LS_COL.gutter], 240);

/** Minimum width of the depreciation register. */
export const LS_DEPRECIATION_MIN_WIDTH = lsMinWidth([
  LS_COL.grip,
  LS_COL.wp,
  LS_COL.depreciationType,
  LS_COL.depreciationName,
  LS_COL.depreciationDate,
  LS_COL.depreciationCost,
  LS_COL.depreciationPercent * 2,
  LS_COL.depreciationInclude,
  0,
  LS_COL.figure,
  LS_COL.gutter,
], 0);

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

/**
 * A table never grows wider than the narrowest section container in the
 * lump-sum panel: beyond this the table would scroll and its figure column
 * would no longer share the panel's right edge.
 */
export const LS_MAX_TABLE_WIDTH = 880;
