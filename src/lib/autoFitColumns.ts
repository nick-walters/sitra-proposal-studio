/**
 * Smart auto-fit: character-count-based column sizing.
 *
 * 1. Bubble columns (2+ bubbles in any cell) → fixed width from measured bubbles.
 * 2. Compact columns (all cells ≤ 10 chars) → natural no-wrap width.
 * 3. Text columns → distribute remaining space proportional to max char count.
 *
 * @param fullWidth - true to always fill the container (e.g. Table 3.1.e).
 */
export function computeAutoFitSmart(
  table: HTMLTableElement,
  options?: { fullWidth?: boolean }
): number[] | null {
  const fullWidth = options?.fullWidth ?? false;
  const { minWidths, containerWidth, cleanup } = measureColumnWidths(table);
  if (!minWidths) return null;

  const numCols = minWidths.length;
  const COMPACT_CHAR_LIMIT = 10;

  // Classify each column
  type ColType = 'bubble' | 'compact' | 'text';
  const colTypes: ColType[] = new Array(numCols).fill('text');
  const colFixedWidths: number[] = new Array(numCols).fill(0);
  const colMaxChars: number[] = new Array(numCols).fill(0);

  const rows = table.querySelectorAll('tbody tr');
  const headerCells = table.querySelectorAll('thead th');

  for (let col = 0; col < numCols; col++) {
    let hasBubbleRow = false;
    let allBodyCompact = true;
    let maxChars = 0;
    let maxTwoBubbleWidth = 0;

    // Check header text for char count (but don't use it for compact classification)
    if (headerCells[col]) {
      const headerText = (headerCells[col] as HTMLElement).textContent?.trim() || '';
      maxChars = Math.max(maxChars, headerText.length);
    }

    rows.forEach(row => {
      const cells = row.querySelectorAll('th, td');
      const cell = cells[col] as HTMLElement | undefined;
      if (!cell) return;

      const bubbles = cell.querySelectorAll('span.rounded-full');
      if (bubbles.length >= 2) {
        hasBubbleRow = true;
        // Measure two-bubble width
        const b1 = (bubbles[0] as HTMLElement).offsetWidth;
        const b2 = (bubbles[1] as HTMLElement).offsetWidth;
        const gap = 4;
        maxTwoBubbleWidth = Math.max(maxTwoBubbleWidth, b1 + b2 + gap + 4);
      }

      const text = cell.textContent?.trim() || '';
      maxChars = Math.max(maxChars, text.length);
      // Compact classification based on body cells only
      if (text.length > COMPACT_CHAR_LIMIT && bubbles.length === 0) {
        allBodyCompact = false;
      }
    });

    if (hasBubbleRow) {
      colTypes[col] = 'bubble';
      colFixedWidths[col] = maxTwoBubbleWidth > 0 ? maxTwoBubbleWidth : minWidths[col];
    } else if (allBodyCompact) {
      colTypes[col] = 'compact';
      colFixedWidths[col] = minWidths[col] + 2; // small buffer
    } else {
      colTypes[col] = 'text';
      colMaxChars[col] = Math.max(maxChars, 1); // avoid zero
    }
  }

  const fixedTotal = colTypes.reduce(
    (sum, t, i) => sum + (t !== 'text' ? colFixedWidths[i] : 0),
    0
  );
  const totalMaxChars = colMaxChars.reduce((s, c) => s + Math.sqrt(c), 0);
  const availableSpace = Math.max(0, containerWidth - fixedTotal);

  let finalWidths: number[] = new Array(numCols);

  for (let i = 0; i < numCols; i++) {
    if (colTypes[i] !== 'text') {
      finalWidths[i] = colFixedWidths[i];
    } else if (totalMaxChars > 0) {
      finalWidths[i] = Math.max(60, availableSpace * (Math.sqrt(colMaxChars[i]) / totalMaxChars));
    } else {
      finalWidths[i] = Math.max(60, minWidths[i]);
    }
  }

  // If not fullWidth, cap text columns at their natural no-wrap width
  // so the table doesn't stretch wider than necessary
  if (!fullWidth) {
    for (let i = 0; i < numCols; i++) {
      if (colTypes[i] === 'text') {
        finalWidths[i] = Math.min(finalWidths[i], minWidths[i] + 2);
      }
    }
  }

  // If fullWidth, ensure we fill the container exactly
  if (fullWidth) {
    const currentTotal = finalWidths.reduce((s, w) => s + w, 0);
    const diff = containerWidth - currentTotal;
    if (diff !== 0) {
      // Add remainder to the first text column, or first column
      const textIdx = colTypes.findIndex(t => t === 'text');
      finalWidths[textIdx >= 0 ? textIdx : 0] += diff;
    }
  }

  // Handle overflow: scale down if total exceeds container
  const total = finalWidths.reduce((s, w) => s + w, 0);
  if (total > containerWidth) {
    const scale = containerWidth / total;
    finalWidths = finalWidths.map(w => Math.max(40, Math.floor(w * scale)));
    const diff2 = containerWidth - finalWidths.reduce((s, w) => s + w, 0);
    if (diff2 !== 0) finalWidths[0] += diff2;
  }

  cleanup();

  // Ensure all cells are vertically centered
  table.querySelectorAll('th, td').forEach(cell => {
    (cell as HTMLElement).style.verticalAlign = 'middle';
  });

  return finalWidths.map(w => Math.round(w));
}

// Keep legacy exports for any other consumers (deprecated)
export const computeAutoFitNarrow = (table: HTMLTableElement) =>
  computeAutoFitSmart(table);
export const computeAutoFitFull = (
  table: HTMLTableElement,
  _colMaxWidths?: Record<number, number>
) => computeAutoFitSmart(table, { fullWidth: true });

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
