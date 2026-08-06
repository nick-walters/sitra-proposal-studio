import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { TableMap } from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Word-like column resizing for document tables.
 *
 * Rules (mirroring MS Word):
 * - The table is confined to the 18cm text column and spans it by default.
 * - Dragging an INTERNAL border only moves that border: the column to its left
 *   grows/shrinks and the column to its right compensates. Every other column
 *   keeps its exact position and width; the total table width is unchanged.
 * - Dragging the RIGHT border of the LAST column changes the total table width,
 *   so a table can be made narrower than 18cm (never wider).
 */

const MAX_TABLE_WIDTH_PX = (18 / 2.54) * 96; // 18cm at 96dpi
const MIN_COL_WIDTH = 24;
const HANDLE_ZONE = 6;

export const wordTableResizingKey = new PluginKey<ResizeState>('wordTableResizing');

interface ResizeState {
  /** Table start position (position of the table node) of the hovered table. */
  tablePos: number | null;
  /** Index of the column whose RIGHT border is hovered. */
  colIndex: number | null;
  dragging: boolean;
}

const emptyState: ResizeState = { tablePos: null, colIndex: null, dragging: false };

function findTableAtDom(view: EditorView, target: HTMLElement) {
  const table = target.closest('table');
  if (!table || !view.dom.contains(table)) return null;
  const posAt = view.posAtDOM(table, 0);
  const $pos = view.state.doc.resolve(posAt);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'table') {
      return { table: table as HTMLTableElement, tablePos: $pos.before(depth), node: $pos.node(depth) };
    }
  }
  return null;
}

/** Rendered widths of each column, measured from the first row's cells. */
function measureColumnWidths(table: HTMLTableElement): number[] {
  const cols = Array.from(table.querySelectorAll('col')) as HTMLTableColElement[];
  const firstRow = table.querySelector('tr');
  const cells = firstRow ? (Array.from(firstRow.children) as HTMLElement[]) : [];
  const widths: number[] = [];
  cells.forEach((cell) => {
    const span = Number(cell.getAttribute('colspan') || 1);
    const w = cell.getBoundingClientRect().width / span;
    for (let i = 0; i < span; i++) widths.push(w);
  });
  if (widths.length === 0 && cols.length > 0) {
    cols.forEach((c) => widths.push(c.getBoundingClientRect().width));
  }
  return widths.map((w) => Math.max(MIN_COL_WIDTH, Math.round(w)));
}

function maxWidthFor(table: HTMLTableElement): number {
  const parent = table.parentElement;
  const available = parent ? parent.clientWidth : 0;
  return Math.round(Math.min(MAX_TABLE_WIDTH_PX, available > 0 ? available : MAX_TABLE_WIDTH_PX));
}

/** Live DOM preview while dragging. */
function applyWidthsToDom(table: HTMLTableElement, widths: number[]) {
  let colgroup = table.querySelector('colgroup');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    table.insertBefore(colgroup, table.firstChild);
  }
  while (colgroup.children.length < widths.length) colgroup.appendChild(document.createElement('col'));
  while (colgroup.children.length > widths.length) colgroup.removeChild(colgroup.lastChild!);
  widths.forEach((w, i) => {
    const col = colgroup!.children[i] as HTMLTableColElement;
    col.style.width = `${w}px`;
  });
  table.style.width = `${widths.reduce((a, b) => a + b, 0)}px`;
}

/** Persist widths onto every cell's colwidth attribute. */
function commitWidths(view: EditorView, tablePos: number, widths: number[]) {
  const { state } = view;
  const tableNode = state.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== 'table') return;
  const map = TableMap.get(tableNode);
  const tr = state.tr;
  const seen = new Set<number>();
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const cellPos = map.map[row * map.width + col];
      if (seen.has(cellPos)) continue;
      seen.add(cellPos);
      const cell = tableNode.nodeAt(cellPos);
      if (!cell) continue;
      const span = cell.attrs.colspan || 1;
      const next = widths.slice(col, col + span);
      if (next.length !== span) continue;
      const current: number[] | null = cell.attrs.colwidth;
      const same = current && current.length === span && current.every((w, i) => w === next[i]);
      if (same) continue;
      tr.setNodeMarkup(tablePos + 1 + cellPos, undefined, { ...cell.attrs, colwidth: next });
    }
  }
  if (tr.docChanged) view.dispatch(tr.setMeta('addToHistory', true));
}

export const WordTableResizing = Extension.create({
  name: 'wordTableResizing',

  addProseMirrorPlugins() {
    let drag: {
      view: EditorView;
      table: HTMLTableElement;
      tablePos: number;
      colIndex: number;
      startX: number;
      startWidths: number[];
      isLast: boolean;
      maxWidth: number;
      widths: number[];
    } | null = null;

    const onMove = (event: MouseEvent) => {
      if (!drag) return;
      event.preventDefault();
      const delta = event.clientX - drag.startX;
      const widths = drag.startWidths.slice();
      const i = drag.colIndex;
      if (drag.isLast) {
        const total = drag.startWidths.reduce((a, b) => a + b, 0);
        const maxDelta = drag.maxWidth - total;
        const clamped = Math.max(MIN_COL_WIDTH - widths[i], Math.min(delta, maxDelta));
        widths[i] = widths[i] + clamped;
      } else {
        const min = MIN_COL_WIDTH - widths[i];
        const max = widths[i + 1] - MIN_COL_WIDTH;
        const clamped = Math.max(min, Math.min(delta, max));
        widths[i] = widths[i] + clamped;
        widths[i + 1] = widths[i + 1] - clamped;
      }
      drag.widths = widths.map((w) => Math.round(w));
      applyWidthsToDom(drag.table, drag.widths);
    };

    const onUp = () => {
      const current = drag;
      drag = null;
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      document.body.classList.remove('table-col-resizing');
      if (!current) return;
      commitWidths(current.view, current.tablePos, current.widths);
      const { view } = current;
      view.dispatch(view.state.tr.setMeta(wordTableResizingKey, { ...emptyState }));
    };

    return [
      new Plugin<ResizeState>({
        key: wordTableResizingKey,
        state: {
          init: () => ({ ...emptyState }),
          apply(tr, value) {
            const meta = tr.getMeta(wordTableResizingKey) as ResizeState | undefined;
            if (meta) return meta;
            if (tr.docChanged && value.tablePos != null) {
              return { ...value, tablePos: tr.mapping.map(value.tablePos) };
            }
            return value;
          },
        },
        props: {
          attributes(state) {
            const s = wordTableResizingKey.getState(state);
            return s && s.colIndex != null ? { class: 'resize-cursor' } : {};
          },
          decorations(state) {
            const s = wordTableResizingKey.getState(state);
            if (!s || s.tablePos == null || s.colIndex == null) return DecorationSet.empty;
            const tableNode = state.doc.nodeAt(s.tablePos);
            if (!tableNode || tableNode.type.name !== 'table') return DecorationSet.empty;
            const map = TableMap.get(tableNode);
            if (s.colIndex >= map.width) return DecorationSet.empty;
            const decos: Decoration[] = [];
            for (let row = 0; row < map.height; row++) {
              const cellPos = map.map[row * map.width + s.colIndex];
              const cell = tableNode.nodeAt(cellPos);
              if (!cell) continue;
              const from = s.tablePos + 1 + cellPos;
              decos.push(Decoration.node(from, from + cell.nodeSize, { class: 'col-resize-hint' }));
            }
            return DecorationSet.create(state.doc, decos);
          },
          handleDOMEvents: {
            mousemove(view, event) {
              if (drag) return false;
              const target = event.target as HTMLElement | null;
              const state = wordTableResizingKey.getState(view.state) || emptyState;
              const found = target ? findTableAtDom(view, target) : null;
              if (!found) {
                if (state.colIndex != null) {
                  view.dispatch(view.state.tr.setMeta(wordTableResizingKey, { ...emptyState }));
                }
                return false;
              }
              const cell = target!.closest('td, th') as HTMLElement | null;
              if (!cell) return false;
              const rect = cell.getBoundingClientRect();
              const nearRight = Math.abs(event.clientX - rect.right) <= HANDLE_ZONE;
              const nearLeft = Math.abs(event.clientX - rect.left) <= HANDLE_ZONE;
              let colIndex: number | null = null;
              const rowCells = Array.from(cell.parentElement?.children || []) as HTMLElement[];
              let index = 0;
              for (const c of rowCells) {
                const span = Number(c.getAttribute('colspan') || 1);
                if (c === cell) break;
                index += span;
              }
              const span = Number(cell.getAttribute('colspan') || 1);
              if (nearRight) colIndex = index + span - 1;
              else if (nearLeft && index > 0) colIndex = index - 1;
              if (colIndex === state.colIndex && found.tablePos === state.tablePos) return false;
              view.dispatch(
                view.state.tr.setMeta(wordTableResizingKey, {
                  tablePos: colIndex == null ? null : found.tablePos,
                  colIndex,
                  dragging: false,
                }),
              );
              return false;
            },
            mouseleave(view) {
              if (drag) return false;
              const state = wordTableResizingKey.getState(view.state);
              if (state && state.colIndex != null) {
                view.dispatch(view.state.tr.setMeta(wordTableResizingKey, { ...emptyState }));
              }
              return false;
            },
            mousedown(view, event) {
              const state = wordTableResizingKey.getState(view.state);
              if (!state || state.colIndex == null || state.tablePos == null) return false;
              if (!view.editable) return false;
              const target = event.target as HTMLElement | null;
              const found = target ? findTableAtDom(view, target) : null;
              if (!found) return false;

              const widths = measureColumnWidths(found.table);
              if (widths.length === 0) return false;
              const colIndex = Math.min(state.colIndex, widths.length - 1);
              const isLast = colIndex === widths.length - 1;

              drag = {
                view,
                table: found.table,
                tablePos: found.tablePos,
                colIndex,
                startX: event.clientX,
                startWidths: widths,
                isLast,
                maxWidth: maxWidthFor(found.table),
                widths,
              };
              // Freeze the current layout immediately so nothing shifts.
              applyWidthsToDom(found.table, widths);
              document.body.classList.add('table-col-resizing');
              window.addEventListener('mousemove', onMove, true);
              window.addEventListener('mouseup', onUp, true);
              event.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },
});

export default WordTableResizing;
