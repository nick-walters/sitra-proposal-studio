import type { EditorView } from '@tiptap/pm/view';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';

function sameWidths(a: unknown, b: number[]) {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return a.every((value, index) => Number(value) === b[index]);
}

function resolveTableDom(view: EditorView, tablePos: number): HTMLTableElement | null {
  const dom = view.nodeDOM(tablePos);
  if (dom instanceof HTMLTableElement) return dom;
  if (dom instanceof HTMLElement) return dom.querySelector('table');
  return null;
}

/**
 * Auto-fit columns for a table inside the TipTap editor.
 *
 * Strategy:
 * 1. Compute target widths via computeAutoFitSmart (off the live DOM).
 * 2. Persist widths by setting `colwidth` attrs on every row's first cells —
 *    TipTap's columnResizing plugin rebuilds the colgroup from these attrs on
 *    every render, so updating only one row would get clobbered.
 * 3. As a belt-and-braces measure, also write the widths directly to the
 *    existing <col> elements so the change is visible immediately, before
 *    ProseMirror re-renders the view.
 */
export function autoFitEditorTableAtPos(
  view: EditorView,
  tablePos: number,
  tableDom?: HTMLTableElement | null,
): boolean {
  const table = tableDom ?? resolveTableDom(view, tablePos);
  if (!table) return false;

  const widths = computeAutoFitSmart(table);
  if (!widths || widths.length === 0) return false;

  // Immediate visual update: write to existing <col> elements.
  const colgroup = table.querySelector('colgroup');
  if (colgroup) {
    const cols = Array.from(colgroup.querySelectorAll('col')) as HTMLTableColElement[];
    cols.forEach((col, i) => {
      if (i < widths.length) {
        col.style.width = `${widths[i]}px`;
        col.style.minWidth = `${widths[i]}px`;
        col.setAttribute('width', String(widths[i]));
      }
    });
  }

  const tableNode = view.state.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== 'table') return true;

  // Persist by updating colwidth attr on the first cell of every row.
  // (Updating only the first row gets reset on re-render because
  //  TipTap rebuilds the colgroup from the row that has colwidth set.)
  let tr = view.state.tr;
  let rowPos = tablePos + 1; // position of first row node

  for (let r = 0; r < tableNode.childCount; r += 1) {
    const row = tableNode.child(r);
    let cellPos = rowPos + 1; // position of first cell in this row
    let colIndex = 0;

    for (let c = 0; c < row.childCount; c += 1) {
      const cell = row.child(c);
      const colspan = Math.max(Number(cell.attrs.colspan) || 1, 1);
      const nextWidths = widths.slice(colIndex, colIndex + colspan);

      if (nextWidths.length === colspan && !sameWidths(cell.attrs.colwidth, nextWidths)) {
        tr = tr.setNodeMarkup(cellPos, undefined, {
          ...cell.attrs,
          colwidth: nextWidths,
        });
      }

      colIndex += colspan;
      cellPos += cell.nodeSize;
    }

    rowPos += row.nodeSize;
  }

  if (tr.docChanged) {
    tr.setMeta('addToHistory', true);
    view.dispatch(tr);
  }

  return true;
}
