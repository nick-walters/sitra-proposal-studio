/**
 * Smart auto-fit: minimize vertical space by distributing column width.
 *
 * Strategy:
 * 1. Bubble columns (2+ bubbles in any cell) → fixed width from measured bubbles.
 * 2. Compact columns (all cells ≤ 10 chars, e.g. numbers) → natural no-wrap width.
 * 3. Text columns → distribute remaining space proportional to sqrt(maxCharCount)
 *    so that wider text gets more room and wrapping is minimized.
 *
 * The table always fills the container (18cm) to minimize overall height.
 */
export function computeAutoFitSmart(
  table: HTMLTableElement,
  options?: { fullWidth?: boolean }
): number[] | null {
  const { minWidths, containerWidth, cleanup } = measureColumnWidths(table);
  if (!minWidths) return null;

  const numCols = minWidths.length;
  if (numCols === 0) { cleanup(); return null; }

  const COMPACT_CHAR_LIMIT = 10;

  type ColType = 'bubble' | 'compact' | 'text';
  const colTypes: ColType[] = new Array(numCols).fill('text');
  const colFixedWidths: number[] = new Array(numCols).fill(0);
  const colMaxChars: number[] = new Array(numCols).fill(0);

  const rows = table.querySelectorAll('tbody tr, thead tr');
  const headerCells = table.querySelectorAll('thead th');

  for (let col = 0; col < numCols; col++) {
    let hasBubbleRow = false;
    let allBodyCompact = true;
    let maxChars = 0;
    let maxTwoBubbleWidth = 0;

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
        const b1 = (bubbles[0] as HTMLElement).offsetWidth;
        const b2 = (bubbles[1] as HTMLElement).offsetWidth;
        maxTwoBubbleWidth = Math.max(maxTwoBubbleWidth, b1 + b2 + 8);
      }

      const text = cell.textContent?.trim() || '';
      maxChars = Math.max(maxChars, text.length);
      if (text.length > COMPACT_CHAR_LIMIT && bubbles.length === 0) {
        allBodyCompact = false;
      }
    });

    if (hasBubbleRow) {
      colTypes[col] = 'bubble';
      colFixedWidths[col] = maxTwoBubbleWidth > 0 ? maxTwoBubbleWidth : minWidths[col];
    } else if (allBodyCompact) {
      colTypes[col] = 'compact';
      colFixedWidths[col] = minWidths[col] + 2;
    } else {
      colTypes[col] = 'text';
      colMaxChars[col] = Math.max(maxChars, 1);
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
      // Distribute available space proportionally — always fill the container
      finalWidths[i] = Math.max(60, availableSpace * (Math.sqrt(colMaxChars[i]) / totalMaxChars));
    } else {
      finalWidths[i] = Math.max(60, minWidths[i]);
    }
  }

  // Ensure we fill the container exactly
  const currentTotal = finalWidths.reduce((s, w) => s + w, 0);
  const diff = containerWidth - currentTotal;
  if (Math.abs(diff) > 1) {
    const textIdx = colTypes.findIndex(t => t === 'text');
    finalWidths[textIdx >= 0 ? textIdx : 0] += diff;
  }

  // Handle overflow: scale down if total exceeds container
  const total = finalWidths.reduce((s, w) => s + w, 0);
  if (total > containerWidth + 1) {
    const scale = containerWidth / total;
    finalWidths = finalWidths.map(w => Math.max(40, Math.floor(w * scale)));
    const diff2 = containerWidth - finalWidths.reduce((s, w) => s + w, 0);
    if (diff2 !== 0) finalWidths[0] += diff2;
  }

  cleanup();

  return finalWidths.map(w => Math.round(w));
}

// Legacy exports
export const computeAutoFitNarrow = (table: HTMLTableElement) =>
  computeAutoFitSmart(table);
export const computeAutoFitFull = (
  table: HTMLTableElement,
  _colMaxWidths?: Record<number, number>
) => computeAutoFitSmart(table, { fullWidth: true });

export function applyColumnWidthsToTable(
  table: HTMLTableElement,
  widths: number[],
  options?: { useMinWidth?: boolean }
): void {
  if (widths.length === 0) return;

  let colgroup = table.querySelector('colgroup');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    table.insertBefore(colgroup, table.firstChild);
  }

  const cols = Array.from(colgroup.querySelectorAll('col'));
  while (cols.length < widths.length) {
    const col = document.createElement('col');
    colgroup.appendChild(col);
    cols.push(col);
  }

  cols.forEach((col, i) => {
    if (i < widths.length) {
      col.style.width = `${widths[i]}px`;
      col.style.minWidth = '';
      col.setAttribute('width', String(widths[i]));
    }
  });

  cols.slice(widths.length).forEach((col) => col.remove());

  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  table.style.tableLayout = 'fixed';
  table.style.width = `${totalWidth}px`;
  table.style.minWidth = options?.useMinWidth ? `${totalWidth}px` : '';

  table.querySelectorAll('th, td').forEach((cell) => {
    (cell as HTMLElement).style.verticalAlign = 'middle';
  });
}

/** Internal: measure no-wrap column widths, returns cleanup function to restore DOM */
function measureColumnWidths(table: HTMLTableElement): {
  minWidths: number[] | null;
  containerWidth: number;
  cleanup: () => void;
} {
  const prevLayout = table.style.tableLayout;
  const prevWidth = table.style.width;
  const prevMinWidth = table.style.minWidth;

  table.style.tableLayout = 'auto';
  table.style.width = 'auto';
  table.style.minWidth = '';

  const allCells = table.querySelectorAll('th, td');
  const savedStyles: { width: string; minWidth: string; whiteSpace: string }[] = [];
  const textareas = table.querySelectorAll('textarea');
  const savedTextareaStyles: { width: string; whiteSpace: string }[] = [];
  const cols = Array.from(table.querySelectorAll('colgroup col'));
  const savedColStyles = cols.map((col) => ({
    width: col.style.width,
    minWidth: col.style.minWidth,
    widthAttr: col.getAttribute('width'),
  }));

  cols.forEach((col) => {
    col.style.width = '';
    col.style.minWidth = '';
    col.removeAttribute('width');
  });

  textareas.forEach((ta, i) => {
    savedTextareaStyles[i] = { width: ta.style.width, whiteSpace: ta.style.whiteSpace };
    ta.style.width = 'auto';
    ta.style.whiteSpace = 'nowrap';
  });

  allCells.forEach((cell, i) => {
    const el = cell as HTMLElement;
    savedStyles[i] = {
      width: el.style.width,
      minWidth: el.style.minWidth,
      whiteSpace: el.style.whiteSpace,
    };
    el.style.width = '';
    el.style.minWidth = '';
    el.style.whiteSpace = 'nowrap';
  });

  table.offsetHeight; // force reflow
  const headerCells = table.querySelectorAll('thead th');
  const numCols = headerCells.length;

  const restore = () => {
    table.style.tableLayout = prevLayout;
    table.style.width = prevWidth;
    table.style.minWidth = prevMinWidth;
    allCells.forEach((cell, i) => {
      const el = cell as HTMLElement;
      el.style.width = savedStyles[i].width;
      el.style.minWidth = savedStyles[i].minWidth;
      el.style.whiteSpace = savedStyles[i].whiteSpace;
    });
    textareas.forEach((ta, i) => {
      ta.style.width = savedTextareaStyles[i].width;
      ta.style.whiteSpace = savedTextareaStyles[i].whiteSpace;
    });
    cols.forEach((col, i) => {
      col.style.width = savedColStyles[i].width;
      col.style.minWidth = savedColStyles[i].minWidth;
      if (savedColStyles[i].widthAttr != null) col.setAttribute('width', savedColStyles[i].widthAttr);
      else col.removeAttribute('width');
    });
  };

  if (numCols === 0) {
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

  allCells.forEach((cell, i) => {
    (cell as HTMLElement).style.whiteSpace = savedStyles[i].whiteSpace;
  });
  textareas.forEach((ta, i) => {
    ta.style.whiteSpace = savedTextareaStyles[i].whiteSpace;
  });
  const containerWidth = table.parentElement?.clientWidth ?? table.offsetWidth;

  return { minWidths, containerWidth, cleanup: restore };
}
