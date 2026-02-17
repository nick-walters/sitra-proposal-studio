/**
 * Auto-fit columns to their natural no-wrap widths.
 * Table can be narrower than the container if everything fits.
 * Used for tables like 3.1.f, 3.1.g, 3.1.h where compact sizing is preferred.
 */
export function computeAutoFitNarrow(table: HTMLTableElement): number[] | null {
  const { minWidths, containerWidth, cleanup } = measureColumnWidths(table);
  if (!minWidths) return null;

  const totalMinWidth = minWidths.reduce((s, w) => s + w, 0);
  // Add small buffer to each column to prevent edge-case wrapping
  const buffered = minWidths.map(w => w + 2);
  const totalBuffered = buffered.reduce((s, w) => s + w, 0);
  let finalWidths: number[];

  if (totalBuffered <= containerWidth) {
    // Everything fits — use buffered natural widths
    finalWidths = [...buffered];
  } else {
    // Proportional scale-down
    const scale = containerWidth / totalBuffered;
    finalWidths = buffered.map(w => Math.max(40, Math.floor(w * scale)));
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
 *
 * @param colMaxWidths - Optional map of colIndex → max pixel width.
 *   If a column's natural width exceeds this cap, it is fixed at the cap value
 *   and treated as compact (not flexed).
 */
export function computeAutoFitFull(
  table: HTMLTableElement,
  colMaxWidths?: Record<number, number>
): number[] | null {
  const { minWidths, containerWidth, cleanup } = measureColumnWidths(table);
  if (!minWidths) return null;

  // Apply column caps
  const cappedWidths = minWidths.map((w, i) => {
    const cap = colMaxWidths?.[i];
    return cap != null && w > cap ? cap : w;
  });

  const COMPACT_THRESHOLD = 120;
  // A column is compact if it's naturally small OR was capped
  const isCompact = (w: number, i: number) =>
    w < COMPACT_THRESHOLD || (colMaxWidths?.[i] != null && minWidths[i] > colMaxWidths[i]);

  const compactTotal = cappedWidths.reduce(
    (s, w, i) => s + (isCompact(w, i) ? w : 0),
    0
  );
  const flexIndices = cappedWidths
    .map((w, i) => (!isCompact(w, i) ? i : -1))
    .filter(i => i >= 0);
  const remainingSpace = Math.max(0, containerWidth - compactTotal);
  const totalFlexMin = flexIndices.reduce((s, i) => s + cappedWidths[i], 0);

  let finalWidths = cappedWidths.map((w, i) => {
    if (isCompact(w, i)) return w;
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
  // Also handle textareas/contenteditable spans inside cells — they constrain width
  const textareas = table.querySelectorAll('textarea');
  const savedTextareaStyles: { width: string; whiteSpace: string }[] = [];
  textareas.forEach((ta, i) => {
    savedTextareaStyles[i] = { width: ta.style.width, whiteSpace: ta.style.whiteSpace };
    ta.style.width = 'auto';
    ta.style.whiteSpace = 'nowrap';
  });

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
    textareas.forEach((ta, i) => {
      ta.style.width = savedTextareaStyles[i].width;
      ta.style.whiteSpace = savedTextareaStyles[i].whiteSpace;
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
  textareas.forEach((ta, i) => {
    ta.style.whiteSpace = savedTextareaStyles[i].whiteSpace;
  });
  const containerWidth = table.parentElement?.clientWidth ?? table.offsetWidth;

  return { minWidths, containerWidth, cleanup: restore };
}
