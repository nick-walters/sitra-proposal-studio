/**
 * Auto-fit columns to their natural no-wrap widths.
 * Table can be narrower than the container if everything fits.
 * Used for tables like 3.1.f, 3.1.g, 3.1.h where compact sizing is preferred.
 */
export function computeAutoFitNarrow(table: HTMLTableElement): number[] | null {
  const { minWidths, containerWidth, cleanup } = measureColumnWidths(table);
  if (!minWidths) return null;

  const totalMinWidth = minWidths.reduce((s, w) => s + w, 0);
  let finalWidths: number[];

  if (totalMinWidth <= containerWidth) {
    // Everything fits — use exact natural widths
    finalWidths = [...minWidths];
  } else {
    // Proportional scale-down
    const scale = containerWidth / totalMinWidth;
    finalWidths = minWidths.map(w => Math.max(40, Math.floor(w * scale)));
    const diff = containerWidth - finalWidths.reduce((s, w) => s + w, 0);
    if (diff !== 0) finalWidths[0] += diff;
  }

  cleanup();
  return finalWidths.map(w => Math.round(w));
}

/**
 * Auto-fit columns to fill the full container width.
 * Compact columns (bubbles, badges, short values) keep their natural size;
 * remaining space is distributed proportionally among text-heavy columns.
 * Used for tables like 3.1.e where full-width is preferred.
 */
export function computeAutoFitFull(table: HTMLTableElement): number[] | null {
  const { minWidths, containerWidth, cleanup } = measureColumnWidths(table);
  if (!minWidths) return null;

  const COMPACT_THRESHOLD = 120;
  const compactTotal = minWidths.reduce(
    (s, w) => s + (w < COMPACT_THRESHOLD ? w : 0),
    0
  );
  const flexIndices = minWidths
    .map((w, i) => (w >= COMPACT_THRESHOLD ? i : -1))
    .filter(i => i >= 0);
  const remainingSpace = Math.max(0, containerWidth - compactTotal);
  const totalFlexMin = flexIndices.reduce((s, i) => s + minWidths[i], 0);

  let finalWidths = minWidths.map((w, i) => {
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

  cleanup();
  return finalWidths.map(w => Math.round(w));
}

/** Internal: measure no-wrap column widths, returns cleanup function to restore DOM */
function measureColumnWidths(table: HTMLTableElement): {
  minWidths: number[] | null;
  containerWidth: number;
  cleanup: () => void;
} {
  const prevLayout = table.style.tableLayout;
  const prevWidth = table.style.width;

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

  table.offsetHeight;
  const headerCells = table.querySelectorAll('thead th');
  const numCols = headerCells.length;

  const restore = () => {
    table.style.tableLayout = prevLayout;
    table.style.width = prevWidth;
    allCells.forEach((cell, i) => {
      (cell as HTMLElement).style.width = savedStyles[i];
    });
  };

  if (numCols === 0) {
    allCells.forEach((cell) => { (cell as HTMLElement).style.whiteSpace = ''; });
    restore();
    return { minWidths: null, containerWidth: 0, cleanup: () => {} };
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

  allCells.forEach((cell) => { (cell as HTMLElement).style.whiteSpace = ''; });
  const containerWidth = table.parentElement?.clientWidth ?? table.offsetWidth;

  return { minWidths, containerWidth, cleanup: restore };
}
