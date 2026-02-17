/**
 * Shared auto-fit column logic for B3.1 tables.
 * Measures natural content widths, then distributes available container width
 * so that compact columns (bubbles, badges) keep their natural size while
 * text-heavy columns share the remaining space.
 */
export function computeAutoFitWidths(table: HTMLTableElement): number[] | null {
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
    // Restore and bail
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

  // Classify columns: "compact" columns (< 120px natural width, e.g. bubbles,
  // badges, short numbers) keep their natural size. Remaining space is
  // distributed proportionally among "flex" columns (text-heavy).
  const COMPACT_THRESHOLD = 120;
  let finalWidths: number[];

  if (totalMinWidth <= containerWidth) {
    // Everything fits without wrapping — use exact natural widths (no expansion)
    finalWidths = [...minWidths];
  } else {
    // Content overflows — compact columns keep their natural width,
    // flex columns share the remaining space proportionally.
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

  return finalWidths.map(w => Math.round(w));
}
