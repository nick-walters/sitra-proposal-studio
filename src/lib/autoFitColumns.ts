/**
 * Shared auto-fit column logic for B3.1 tables.
 * Measures natural content widths, then distributes available container width
 * so that compact columns (bubbles, badges) keep their natural size while
 * text-heavy columns share the remaining space.
 *
 * Returns { widths, fillContainer }:
 * - widths: pixel widths per column
 * - fillContainer: true if the table should use 100% width (content wraps),
 *   false if it can be narrower (everything fits without wrapping)
 */
export function computeAutoFitWidths(table: HTMLTableElement): { widths: number[]; fillContainer: boolean } | null {
  const prevLayout = table.style.tableLayout;
  const prevWidth = table.style.width;

  // Temporarily switch to auto layout so columns shrink to content
  table.style.tableLayout = 'auto';
  table.style.width = 'auto';

  const allCells = table.querySelectorAll('th, td');
  const savedStyles: string[] = [];
  allCells.forEach((cell, i) => {
    const el = cell as HTMLElement;
    savedStyles[i] = el.style.width;
    el.style.width = '';
    el.style.whiteSpace = 'nowrap';
  });

  // Force reflow and measure no-wrap widths per column
  table.offsetHeight;
  const headerCells = table.querySelectorAll('thead th');
  const numCols = headerCells.length;
  if (numCols === 0) {
    table.style.tableLayout = prevLayout;
    table.style.width = prevWidth;
    allCells.forEach((cell, i) => {
      (cell as HTMLElement).style.width = savedStyles[i];
      (cell as HTMLElement).style.whiteSpace = '';
    });
    return null;
  }

  const minWidths = new Array(numCols).fill(0);

  table.querySelectorAll('tr').forEach(row => {
    const cells = row.querySelectorAll('th, td');
    cells.forEach((cell, colIdx) => {
      if (colIdx < numCols) {
        minWidths[colIdx] = Math.max(minWidths[colIdx], (cell as HTMLElement).offsetWidth);
      }
    });
  });

  // Restore whitespace
  allCells.forEach((cell) => {
    (cell as HTMLElement).style.whiteSpace = '';
  });

  const containerWidth = table.parentElement?.clientWidth ?? table.offsetWidth;
  const totalMinWidth = minWidths.reduce((s, w) => s + w, 0);

  const COMPACT_THRESHOLD = 120;
  let finalWidths: number[];
  let fillContainer: boolean;

  if (totalMinWidth <= containerWidth) {
    // Everything fits without wrapping — use exact natural widths (narrower table OK)
    finalWidths = [...minWidths];
    fillContainer = false;
  } else {
    // Content overflows — fill full container width.
    // Compact columns keep their natural width, flex columns share the rest.
    fillContainer = true;
    const compactTotal = minWidths.reduce(
      (s, w) => s + (w < COMPACT_THRESHOLD ? w : 0),
      0
    );
    const flexIndices = minWidths
      .map((w, i) => (w >= COMPACT_THRESHOLD ? i : -1))
      .filter(i => i >= 0);
    const remainingSpace = Math.max(0, containerWidth - compactTotal);
    const totalFlexMin = flexIndices.reduce((s, i) => s + minWidths[i], 0);

    finalWidths = minWidths.map((w, i) => {
      if (w < COMPACT_THRESHOLD) return w;
      if (totalFlexMin > 0) {
        return Math.max(60, remainingSpace * (w / totalFlexMin));
      }
      return Math.max(60, w);
    });

    // Adjust to fill container exactly
    const diff = containerWidth - finalWidths.reduce((s, w) => s + w, 0);
    if (diff !== 0 && flexIndices.length > 0) {
      finalWidths[flexIndices[0]] += diff;
    }
  }

  // Restore table styles
  table.style.tableLayout = prevLayout;
  table.style.width = prevWidth;
  allCells.forEach((cell, i) => {
    (cell as HTMLElement).style.width = savedStyles[i];
  });

  return { widths: finalWidths.map(w => Math.round(w)), fillContainer };
}
