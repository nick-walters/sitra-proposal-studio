/**
 * B2.1 impact summary table — linked row operations.
 *
 * The table is ONE logical six-column table that is stored, and rendered, as
 * two stacked three-column HTML tables inside a single text box: part 1 holds
 * Target groups / Specific needs / Expected results, part 2 holds DEC measures
 * / Expected outcomes / Expected impacts.
 *
 * A logical row therefore spans both parts, so every add and delete is applied
 * to both tables at the same body-row index. Column widths are NOT touched
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
