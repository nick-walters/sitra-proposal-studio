import { TableMap, CellSelection } from '@tiptap/pm/tables';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

export type RuleStyle = 'thick' | 'thin';
export type RuleTarget = 'top' | 'middle' | 'bottom';

interface TableContext {
  table: PMNode;
  tableStart: number;
  map: TableMap;
  rect: { top: number; left: number; bottom: number; right: number };
}

/**
 * Resolve the enclosing table and the selection rectangle in grid coordinates.
 * `right` and `bottom` are exclusive, as prosemirror-tables defines them.
 */
function tableContext(editor: Editor): TableContext | null {
  const { selection } = editor.state;
  const $from = selection.$from;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type.name !== 'table') depth -= 1;
  if (depth === 0) return null;

  const table = $from.node(depth);
  const tableStart = $from.start(depth);
  const map = TableMap.get(table);

  let rect;
  if (selection instanceof CellSelection) {
    rect = map.rectBetween(
      selection.$anchorCell.pos - tableStart,
      selection.$headCell.pos - tableStart,
    );
  } else {
    // Nearest ancestor cell of the caret.
    let cellDepth = $from.depth;
    while (
      cellDepth > depth &&
      !['tableCell', 'tableHeader'].includes($from.node(cellDepth).type.name)
    ) {
      cellDepth -= 1;
    }
    if (cellDepth <= depth) return null;
    rect = map.findCell($from.start(cellDepth) - 1 - tableStart);
  }

  return { table, tableStart, map, rect };
}

/** Grid rows that must receive a bottom rule for the requested target. */
function targetRows(ctx: TableContext, target: RuleTarget): number[] | null {
  const { rect, map } = ctx;
  if (target === 'top') {
    if (rect.top === 0) return null;
    return [rect.top - 1];
  }
  if (target === 'bottom') {
    if (rect.bottom === map.height) return null;
    return [rect.bottom - 1];
  }
  if (rect.bottom - rect.top < 2) return null;
  const rows: number[] = [];
  for (let r = rect.top; r <= rect.bottom - 2; r += 1) rows.push(r);
  return rows;
}

export function ruleTargetAvailable(editor: Editor, target: RuleTarget): boolean {
  const ctx = tableContext(editor);
  if (!ctx) return false;
  return targetRows(ctx, target) !== null;
}

export function applyCellRule(editor: Editor, target: RuleTarget, style: RuleStyle): boolean {
  const ctx = tableContext(editor);
  if (!ctx) return false;
  const rows = targetRows(ctx, target);
  if (!rows) return false;

  const { map, table, tableStart, rect } = ctx;
  const offsets = new Set<number>();
  rows.forEach((r) => {
    for (let c = rect.left; c < rect.right; c += 1) {
      const offset = map.map[r * map.width + c];
      // A rowspan cell straddling this edge cannot carry a rule through its
      // middle, so only cells whose own bottom edge is r + 1 qualify.
      const cellRect = map.findCell(offset);
      if (cellRect.bottom !== r + 1) continue;
      offsets.add(offset);
    }
  });
  if (!offsets.size) return false;

  const tr = editor.state.tr;
  offsets.forEach((offset) => {
    const cell = table.nodeAt(offset);
    if (!cell) return;
    tr.setNodeMarkup(tableStart + offset, undefined, { ...cell.attrs, ruleBottom: style });
  });
  editor.view.dispatch(tr);
  return true;
}
