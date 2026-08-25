import type { Editor } from '@tiptap/core';
import { PAIRED_TABLES_ROW_OP } from '@/extensions/PairedTables';
import type { Node as PMNode } from '@tiptap/pm/model';
/**
 * B2.1 impact summary table — linked row operations.
 *
 * The table is ONE logical six-column table that is stored, and rendered, as
 * two stacked three-column HTML tables inside a single text box: part 1 holds
 * Target groups / Specific needs / Expected results, part 2 holds DEC measures
 * / Expected outcomes / Expected impacts.
 *
 * A logical row therefore spans both parts, so every add and delete is applied
 * to both tables at the same body-row index. The pairing is not a convention
 * these helpers observe: the `PairedTables` extension rejects ANY transaction
 * that changes one part's row count on its own, so no drifted state exists.
 * (A single six-column table node cannot be used, because the two parts must
 * keep independent column widths, and one table has one set of columns.) Column widths are NOT touched
 * here — the two parts keep resizing independently.
 */

export const IMPACT_SUMMARY_KEY = 'b21.impact_summary';

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

function serialise(doc: Document): string {
  return doc.body.innerHTML;
}

function parts(doc: Document): HTMLTableElement[] {
  return Array.from(doc.querySelectorAll('table')) as HTMLTableElement[];
}

/** Body rows of one part: every row that is not the header row. */
function bodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.querySelectorAll('tr')).filter(
    (tr) => !tr.querySelector('th'),
  ) as HTMLTableRowElement[];
}

/** Number of logical rows — the two parts are always kept in step. */
export function impactSummaryRowCount(html: string): number {
  const tables = parts(parse(html));
  if (tables.length < 2) return 0;
  return Math.min(...tables.map((t) => bodyRows(t).length));
}

/** Short preview of a logical row, used to identify it in the delete menu. */
export function impactSummaryRowPreview(html: string, index: number): string {
  const tables = parts(parse(html));
  const cells: string[] = [];
  for (const table of tables) {
    const row = bodyRows(table)[index];
    if (!row) continue;
    for (const cell of Array.from(row.cells)) {
      const text = (cell.textContent ?? '').trim();
      if (text) cells.push(text);
    }
  }
  const joined = cells.join(' · ');
  return joined.length > 60 ? `${joined.slice(0, 57)}…` : joined;
}

/** How many of the six cells in a logical row hold text. */
export function impactSummaryFilledCells(html: string, index: number): number {
  const tables = parts(parse(html));
  let filled = 0;
  for (const table of tables) {
    const row = bodyRows(table)[index];
    if (!row) continue;
    for (const cell of Array.from(row.cells)) {
      if ((cell.textContent ?? '').trim()) filled += 1;
    }
  }
  return filled;
}

function emptyRowFor(doc: Document, table: HTMLTableElement): HTMLTableRowElement | null {
  const template = bodyRows(table)[0] ?? null;
  const columnCount =
    template?.cells.length ??
    (table.querySelector('tr')?.cells.length ?? 3);
  const tr = doc.createElement('tr');
  for (let i = 0; i < columnCount; i += 1) {
    const td = doc.createElement('td');
    td.className = 'he-table-cell';
    td.setAttribute('colspan', '1');
    td.setAttribute('rowspan', '1');
    td.appendChild(doc.createElement('p'));
    tr.appendChild(td);
  }
  return tr;
}

/** Appends one logical row — one body row in each part. */
export function impactSummaryAddRow(html: string): string {
  const doc = parse(html);
  const tables = parts(doc);
  if (tables.length < 2) return html;
  for (const table of tables) {
    const parent = table.querySelector('tbody') ?? table;
    const row = emptyRowFor(doc, table);
    if (row) parent.appendChild(row);
  }
  return serialise(doc);
}

/** Removes the logical row at `index` from both parts. */
export function impactSummaryDeleteRow(html: string, index: number): string {
  const doc = parse(html);
  const tables = parts(doc);
  if (tables.length < 2) return html;
  for (const table of tables) {
    const row = bodyRows(table)[index];
    if (row) row.remove();
  }
  return serialise(doc);
}

/* ------------------------------------------------------------------ */
/* In-editor row operations                                            */
/*                                                                     */
/* Rewriting the field's HTML and remounting the editor loses whatever */
/* the user has typed since mount and throws away TipTap's history, so */
/* both operations run as ProseMirror transactions on the live document */
/* instead: existing cells are never re-created, and one add or delete  */
/* is one undoable step covering BOTH parts of the table.               */


interface TableRef {
  node: PMNode;
  pos: number;
}

/** The stacked parts, in document order. Nested tables are not expected. */
function findTables(doc: PMNode): TableRef[] {
  const found: TableRef[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      found.push({ node, pos });
      return false;
    }
    return true;
  });
  return found;
}

function isHeaderRow(row: PMNode): boolean {
  let header = false;
  row.forEach((cell) => {
    if (cell.type.name === 'tableHeader') header = true;
  });
  return header;
}

/** Body rows of one part, with their absolute positions. */
function bodyRowRefs(table: TableRef): TableRef[] {
  const rows: TableRef[] = [];
  let offset = table.pos + 1;
  table.node.forEach((row) => {
    if (!isHeaderRow(row)) rows.push({ node: row, pos: offset });
    offset += row.nodeSize;
  });
  return rows;
}

/** Logical row count taken from the live document rather than stored HTML. */
export function impactSummaryEditorRowCount(editor: Editor): number {
  const tables = findTables(editor.state.doc);
  if (tables.length < 2) return 0;
  return Math.min(...tables.map((t) => bodyRowRefs(t).length));
}

function buildEmptyRow(editor: Editor, table: TableRef): PMNode | null {
  const { schema } = editor.state;
  const rowType = schema.nodes.tableRow;
  const cellType = schema.nodes.tableCell;
  if (!rowType || !cellType) return null;
  const rows = bodyRowRefs(table);
  const template = rows[rows.length - 1]?.node ?? table.node.firstChild;
  const columnCount = template?.childCount ?? 3;
  const cells: PMNode[] = [];
  for (let i = 0; i < columnCount; i += 1) {
    // Column width lives on the cell, so carry it over from the row above;
    // everything else (content) starts empty.
    const source = template?.child(Math.min(i, template.childCount - 1));
    const cell = cellType.createAndFill({
      colspan: 1,
      rowspan: 1,
      colwidth: source?.attrs?.colwidth ?? null,
    });
    if (!cell) return null;
    cells.push(cell);
  }
  return rowType.create(null, cells);
}

/**
 * Appends one logical row — one body row in each part — as a single history
 * step. Existing cells are untouched, so their chips, citations and formatting
 * survive verbatim.
 */
export function impactSummaryAddRowInEditor(editor: Editor): boolean {
  return editor
    .chain()
    .command(({ tr, state, dispatch }) => {
      const tables = findTables(state.doc);
      if (tables.length < 2) return false;
      // Later parts first: an earlier insert would shift their positions.
      for (const table of [...tables].reverse()) {
        const row = buildEmptyRow(editor, table);
        if (!row) return false;
        tr.insert(table.pos + table.node.nodeSize - 1, row);
      }
      // Marks this as the paired operation the invariant plugin allows: any
      // untagged transaction that changed one part's row count is rejected.
      tr.setMeta(PAIRED_TABLES_ROW_OP, true);
      if (dispatch) dispatch(tr.scrollIntoView());
      return true;
    })
    .run();
}

/**
 * Removes the logical row at `index` from both parts as a single history step,
 * so one undo brings the row back with all of its content.
 */
export function impactSummaryDeleteRowInEditor(editor: Editor, index: number): boolean {
  return editor
    .chain()
    .command(({ tr, state, dispatch }) => {
      const tables = findTables(state.doc);
      if (tables.length < 2) return false;
      const targets = [...tables]
        .reverse()
        .map((table) => bodyRowRefs(table)[index])
        .filter((row): row is TableRef => Boolean(row));
      if (targets.length !== tables.length) return false;
      for (const row of targets) tr.delete(row.pos, row.pos + row.node.nodeSize);
      tr.setMeta(PAIRED_TABLES_ROW_OP, true);
      if (dispatch) dispatch(tr);
      return true;
    })
    .run();
}
