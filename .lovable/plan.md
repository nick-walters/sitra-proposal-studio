

## Rewrite Auto-Resize Column Logic

The current approach measures the DOM "no-wrap" width of each column, which is unreliable for text-heavy columns (textareas, long titles) because their natural unwrapped width can be enormous, distorting proportions. Your proposed character-count-based approach is much more robust.

### New Algorithm

The new `computeAutoFitSmart` function will replace both `computeAutoFitNarrow` and `computeAutoFitFull` with a single unified algorithm:

1. **Detect bubble columns**: Scan each column's cells for bubble elements (`.rounded-full` spans). If any cell has 2+ bubbles, fix that column's width to the measured width of two bubbles side-by-side (plus padding).

2. **Detect compact columns**: For remaining columns, check if every cell contains only a single short word or bubble (no cell text exceeds ~10 characters). These get their natural no-wrap width (measured from the DOM as today).

3. **Measure max character count for text columns**: For each remaining "text" column, find the cell with the longest text content (`textContent.trim().length`). Record this max character count per column.

4. **Distribute remaining width proportionally**: Subtract the fixed and compact column widths from the container width. Divide the remaining space proportionally based on each text column's max character count.

5. **Handle overflow**: If total fixed+compact exceeds container, scale everything down proportionally (same as current fallback).

### Changes

**`src/lib/autoFitColumns.ts`**
- Add new exported function `computeAutoFitSmart(table: HTMLTableElement, options?: { fullWidth?: boolean })`.
- `fullWidth: true` (for 3.1.e) ensures the table fills the container; `fullWidth: false` (for 3.1.c, d, f, g, h) allows the table to be narrower than the container.
- The function implements the 4-step algorithm above.
- Keep `measureColumnWidths` for measuring compact/bubble columns' natural widths.
- Deprecate or remove `computeAutoFitNarrow` and `computeAutoFitFull`.

**`src/components/B31TablesEditor.tsx`**
- Table 3.1.c (Deliverables): Replace `computeAutoFitNarrow` call with `computeAutoFitSmart(table)`.
- Table 3.1.d (Milestones): Replace `computeAutoFitNarrow` call with `computeAutoFitSmart(table)`.
- Table 3.1.e (Risks): Replace `computeAutoFitFull` call with `computeAutoFitSmart(table, { fullWidth: true })`. Remove the inline bubble-measuring logic (now handled inside the function).

**`src/components/B31EffortMatrix.tsx`**
- Replace `computeAutoFitNarrow` call with `computeAutoFitSmart(table)` (effort matrix is all compact/numeric columns, so it will naturally stay narrow).

### Technical Details

```text
For each column:
  1. Has 2+ bubbles in any cell?
     YES -> fixed width = measured 2-bubble width
  2. All cells <= ~10 chars and no multi-line content?
     YES -> compact width = measured no-wrap width
  3. Otherwise -> "text" column
     -> maxChars = max(textContent.length) across all cells

Available space = containerWidth - sum(fixed) - sum(compact)
Each text column width = available * (maxChars / totalMaxChars)

If fullWidth=false and sum(all) < containerWidth:
  use natural widths (don't stretch)
If fullWidth=true:
  always fill container
```

This approach is content-aware rather than pixel-aware, making it robust against textarea sizing quirks and producing proportional results that match human expectations.
