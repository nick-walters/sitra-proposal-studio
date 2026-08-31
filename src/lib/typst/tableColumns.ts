/**
 * Shared column-track builder for every emitted Typst table.
 *
 * The editors store dragged column widths in `table_column_widths` as CSS
 * pixels, against a board that is 18 cm wide. Typst tables are placed in the
 * same 18 cm block, so a stored row converts to an ABSOLUTE point track:
 * 1 px = 0.75 pt, floored at the editor's own per-column minimum, then scaled
 * so the track sums to exactly 18 cm. That is the editor's geometry, printed.
 *
 * Fractional (`fr`) tracks remain the fallback for a table that has never been
 * resized: they express the template's default proportions, which have no
 * pixel measurements behind them.
 */

/** 18 cm in Typst points — `he-table-width` in the preamble. */
export const HE_TABLE_WIDTH_PT = 510.24;

/** CSS pixel → Typst point. */
export const PX_TO_PT = 0.75;

/** The editors never let a column go below this (see `useColumnResize`). */
export const MIN_COL_PX = 25;

function floorFor(minPx: number | number[] | undefined, index: number): number {
  if (Array.isArray(minPx)) return (minPx[index] ?? MIN_COL_PX) * PX_TO_PT;
  return (minPx ?? MIN_COL_PX) * PX_TO_PT;
}

/**
 * Stored pixel widths → point widths summing to `totalPt`, with each column
 * kept at or above its floor. Columns above their floor absorb the difference.
 */
export function pointWidths(
  pxWidths: number[],
  minPx?: number | number[],
  totalPt: number = HE_TABLE_WIDTH_PT,
): number[] {
  const floors = pxWidths.map((_, i) => floorFor(minPx, i));
  const floorSum = floors.reduce((s, f) => s + f, 0);
  // Pathological case: the floors alone overflow the page. Fall back to plain
  // proportional scaling — an unreadably narrow column beats an overflow.
  if (floorSum >= totalPt) {
    const sum = pxWidths.reduce((s, w) => s + w, 0) || 1;
    return pxWidths.map((w) => (w / sum) * totalPt);
  }

  let widths = pxWidths.map((w, i) => Math.max(w * PX_TO_PT, floors[i]));
  for (let pass = 0; pass < 8; pass += 1) {
    const sum = widths.reduce((s, w) => s + w, 0);
    const delta = totalPt - sum;
    if (Math.abs(delta) < 0.01) break;
    const slack = widths.reduce((s, w, i) => s + (w - floors[i]), 0);
    if (slack <= 0) break;
    widths = widths.map((w, i) => Math.max(floors[i], w + (delta * (w - floors[i])) / slack));
  }
  return widths;
}

/** `(120.00pt, 60.00pt, …)` — a Typst column track. */
export function ptTrack(widthsPt: number[]): string {
  return `(${widthsPt.map((w) => `${w.toFixed(2)}pt`).join(', ')})`;
}

/**
 * The column track for a table whose widths MAY have been stored. `keys` is
 * tried in order (a table that moved between editors has more than one
 * historical key) and the first stored row of the right shape wins; otherwise
 * the caller's template default is returned unchanged.
 */
export function storedColumnTrack(
  store: Record<string, number[]>,
  keys: string | string[],
  count: number,
  fallback: string,
  minPx?: number | number[],
): string {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const widths = store[key];
    if (widths && widths.length === count && widths.every((w) => w > 0)) {
      return ptTrack(pointWidths(widths, minPx));
    }
  }
  return fallback;
}
