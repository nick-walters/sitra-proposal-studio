import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';

/**
 * Binds the two visual parts of a split table into ONE logical table.
 *
 * B2.1's impact summary is a six-column table that has to be shown as two
 * stacked three-column parts so it fits the page width. The parts are two
 * ProseMirror table nodes (a single table node cannot give the two parts
 * independent column widths — see the note in `impactSummaryRows.ts`), so the
 * invariant "there is only one set of rows" is enforced here, in the state
 * pipeline, rather than in the button handlers:
 *
 *  - `filterTransaction` REJECTS any transaction that would change the number
 *    of body rows in either part unless it is a paired row operation. Nothing
 *    can add or delete a row in one part alone — not the table menu, not the
 *    keyboard, not a paste, not a collaborator's streamed content.
 *  - `appendTransaction` REPAIRS any state that still arrives mismatched (a
 *    legacy field saved while the two parts had already drifted) by padding the
 *    shorter part with empty rows. It never deletes, so no text can be lost.
 *
 * The result: no state the user can reach — or that can be loaded — has
 * different row counts in the two parts.
 */

export const PAIRED_TABLES_ROW_OP = 'pairedTablesRowOp';

const pairedTablesKey = new PluginKey('pairedTables');

function isHeaderRow(row: PMNode): boolean {
  let header = false;
  row.forEach((cell) => {
    if (cell.type.name === 'tableHeader') header = true;
  });
  return header;
}

/** Top-level tables with their absolute positions, in document order. */
function topLevelTables(doc: PMNode): { node: PMNode; pos: number }[] {
  const found: { node: PMNode; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      found.push({ node, pos });
      return false;
    }
    return true;
  });
  return found;
}

function bodyRowCount(table: PMNode): number {
  let count = 0;
  table.forEach((row) => {
    if (!isHeaderRow(row)) count += 1;
  });
  return count;
}

function bodyRowCounts(doc: PMNode): number[] {
  return topLevelTables(doc).map((t) => bodyRowCount(t.node));
}

function buildEmptyRow(schema: Schema, table: PMNode): PMNode | null {
  const rowType = schema.nodes.tableRow;
  const cellType = schema.nodes.tableCell;
  if (!rowType || !cellType) return null;
  let template: PMNode | null = null;
  table.forEach((row) => {
    if (!isHeaderRow(row)) template = row;
  });
  const source = template ?? table.firstChild;
  const columnCount = source?.childCount ?? 3;
  const cells: PMNode[] = [];
  for (let i = 0; i < columnCount; i += 1) {
    const sourceCell = source?.child(Math.min(i, source.childCount - 1));
    const cell = cellType.createAndFill({
      colspan: 1,
      rowspan: 1,
      // Column widths stay independent per part: carry over this part's own.
      colwidth: (sourceCell?.attrs as { colwidth?: number[] | null })?.colwidth ?? null,
    });
    if (!cell) return null;
    cells.push(cell);
  }
  return rowType.create(null, cells);
}

/**
 * Whole-document replacement — loading the field, or mirroring a collaborator's
 * streamed content — is not an edit of the current table and is let through;
 * the repair pass then brings the incoming content into step.
 */
function isFullDocReplace(tr: Transaction, docSize: number): boolean {
  return tr.steps.some((step) => {
    const s = step as unknown as { from?: number; to?: number };
    return s.from === 0 && s.to === docSize;
  });
}

/** Undo/redo must be able to restore any earlier — consistent — state. */
function isHistory(tr: Transaction): boolean {
  return Boolean(tr.getMeta('history$'));
}

/**
 * Pads the shorter part with empty rows so the two parts hold the same number
 * of rows. Nothing is ever deleted, so no text can be lost by the repair.
 */
function buildRepairTransaction(state: EditorState): Transaction | null {
  const tables = topLevelTables(state.doc);
  if (tables.length !== 2) return null;
  const counts = tables.map((t) => bodyRowCount(t.node));
  const target = Math.max(...counts);
  if (counts.every((c) => c === target)) return null;

  const tr = state.tr;
  // Later parts first so earlier inserts cannot shift their positions.
  for (let i = tables.length - 1; i >= 0; i -= 1) {
    const missing = target - counts[i];
    for (let n = 0; n < missing; n += 1) {
      const row = buildEmptyRow(state.schema, tables[i].node);
      if (!row) return null;
      tr.insert(tables[i].pos + tables[i].node.nodeSize - 1, row);
    }
  }
  tr.setMeta(PAIRED_TABLES_ROW_OP, true);
  tr.setMeta('addToHistory', false);
  return tr;
}

export interface PairedTablesOptions {
  /** Only the split table's own text box turns the invariant on. */
  isEnabled: () => boolean;
}

export const PairedTables = Extension.create<PairedTablesOptions>({
  name: 'pairedTables',

  addOptions() {
    return { isEnabled: () => false };
  },

  onCreate() {
    if (!this.options.isEnabled()) return;
    const tr = buildRepairTransaction(this.editor.state);
    if (tr) this.editor.view.dispatch(tr);
  },

  addProseMirrorPlugins() {
    const isEnabled = () => this.options.isEnabled();

    return [
      new Plugin({
        key: pairedTablesKey,

        filterTransaction(tr, state) {
          if (!isEnabled() || !tr.docChanged) return true;
          if (tr.getMeta(PAIRED_TABLES_ROW_OP) || isHistory(tr)) return true;

          if (isFullDocReplace(tr, state.doc.content.size)) return true;

          const before = bodyRowCounts(state.doc);
          const after = bodyRowCounts(tr.doc);
          // Neither part may be removed on its own either.
          if (before.length === 2 && after.length !== 2) return false;
          // Not the paired shape (initial load, content replacement): the
          // repair pass below brings whatever arrives back into step.
          if (before.length !== 2 || after.length !== 2) return true;

          const changed = after.some((count, i) => count !== before[i]);
          // A one-sided row change is the only thing rejected; typing,
          // formatting, chips and column resizing all pass untouched.
          return !changed;
        },

        appendTransaction(_trs, _old, state) {
          if (!isEnabled()) return null;
          return buildRepairTransaction(state);
        },
      }),
    ];
  },
});

export default PairedTables;
