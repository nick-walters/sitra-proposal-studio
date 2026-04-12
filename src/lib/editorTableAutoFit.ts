import type { EditorView } from '@tiptap/pm/view';
import { applyColumnWidthsToTable, computeAutoFitSmart } from '@/lib/autoFitColumns';

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

export function autoFitEditorTableAtPos(
  view: EditorView,
  tablePos: number,
  tableDom?: HTMLTableElement | null,
): boolean {
  const table = tableDom ?? resolveTableDom(view, tablePos);
  if (!table) return false;

  const widths = computeAutoFitSmart(table);
  if (!widths) return false;

  applyColumnWidthsToTable(table, widths);

  const tableNode = view.state.doc.nodeAt(tablePos);
  const firstRow = tableNode?.firstChild;
  if (!tableNode || tableNode.type.name !== 'table' || !firstRow) return true;

  let tr = view.state.tr;
  let cellPos = tablePos + 2;
  let colIndex = 0;

  for (let i = 0; i < firstRow.childCount; i += 1) {
    const cell = firstRow.child(i);
    const colspan = Math.max(Number(cell.attrs.colspan) || 1, 1);
    const nextWidths = widths.slice(colIndex, colIndex + colspan);

    if (!sameWidths(cell.attrs.colwidth, nextWidths)) {
      tr = tr.setNodeMarkup(cellPos, undefined, {
        ...cell.attrs,
        colwidth: nextWidths,
      });
    }

    colIndex += colspan;
    cellPos += cell.nodeSize;
  }

  if (tr.docChanged) {
    view.dispatch(tr);
  }

  return true;
}