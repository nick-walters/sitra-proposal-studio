import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { PairedTables } from '@/extensions/PairedTables';
import {
  impactSummaryAddRowInEditor,
  impactSummaryDeleteRowInEditor,
  impactSummaryEditorRowCount,
} from '@/lib/cards/impactSummaryRows';

const PART = (label: string, rows: string[][]) => `
<table><tbody>
  <tr>${['A', 'B', 'C'].map((c) => `<th><p>${label}${c}</p></th>`).join('')}</tr>
  ${rows.map((r) => `<tr>${r.map((c) => `<td><p>${c}</p></td>`).join('')}</tr>`).join('')}
</tbody></table>`;

const BALANCED =
  PART('P1', [
    ['a1', 'b1', 'c1'],
    ['<strong>a2</strong>', 'b2', 'c2'],
  ]) + PART('P2', [['d1', 'e1', 'f1'], ['d2', 'e2', 'f2']]);

/** A field saved while the two parts had already drifted apart. */
const DRIFTED =
  PART('P1', [['a1', 'b1', 'c1'], ['a2', 'b2', 'c2'], ['a3', 'b3', 'c3']]) +
  PART('P2', [['d1', 'e1', 'f1']]);

function createEditor(content = BALANCED) {
  return new Editor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      PairedTables.configure({ isEnabled: () => true }),
    ],
    content,
  });
}

function rowCounts(editor: Editor): number[] {
  const counts: number[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'table') return true;
    let rows = 0;
    node.forEach((row) => {
      let header = false;
      row.forEach((cell) => {
        if (cell.type.name === 'tableHeader') header = true;
      });
      if (!header) rows += 1;
    });
    counts.push(rows);
    return false;
  });
  return counts;
}

/** Places the caret in the first body cell of the given part. */
function caretInPart(editor: Editor, part: number) {
  const tables: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      tables.push(pos);
      return false;
    }
    return true;
  });
  const table = editor.state.doc.nodeAt(tables[part]);
  if (!table) throw new Error('part not found');
  // Header row first, then the first body row's first cell.
  const headerSize = table.firstChild?.nodeSize ?? 0;
  editor.commands.setTextSelection(tables[part] + 1 + headerSize + 3);
}

describe('paired tables invariant', () => {
  it('rejects a row added to one part alone', () => {
    const editor = createEditor();
    caretInPart(editor, 0);
    editor.commands.addRowAfter();
    expect(rowCounts(editor)).toEqual([2, 2]);
    editor.destroy();
  });

  it('rejects a row deleted from one part alone', () => {
    const editor = createEditor();
    caretInPart(editor, 1);
    editor.commands.deleteRow();
    expect(rowCounts(editor)).toEqual([2, 2]);
    editor.destroy();
  });

  it('rejects deleting a whole part', () => {
    const editor = createEditor();
    caretInPart(editor, 1);
    editor.commands.deleteTable();
    expect(rowCounts(editor)).toHaveLength(2);
    editor.destroy();
  });

  it('allows the paired add and delete, and keeps content intact', () => {
    const editor = createEditor();
    expect(impactSummaryAddRowInEditor(editor)).toBe(true);
    expect(rowCounts(editor)).toEqual([3, 3]);
    expect(impactSummaryDeleteRowInEditor(editor, 2)).toBe(true);
    expect(rowCounts(editor)).toEqual([2, 2]);
    expect(editor.getHTML()).toContain('<strong>a2</strong>');
    editor.destroy();
  });

  it('undo restores a deleted row with its content', () => {
    const editor = createEditor();
    impactSummaryDeleteRowInEditor(editor, 1);
    expect(rowCounts(editor)).toEqual([1, 1]);
    editor.commands.undo();
    expect(rowCounts(editor)).toEqual([2, 2]);
    expect(editor.getHTML()).toContain('<strong>a2</strong>');
    editor.commands.redo();
    expect(rowCounts(editor)).toEqual([1, 1]);
    editor.destroy();
  });

  it('repairs already-drifted content by padding, never deleting', () => {
    const editor = createEditor(DRIFTED);
    expect(rowCounts(editor)).toEqual([3, 3]);
    const html = editor.getHTML();
    for (const text of ['a3', 'b3', 'c3', 'd1', 'e1', 'f1']) expect(html).toContain(text);
    expect(impactSummaryEditorRowCount(editor)).toBe(3);
    editor.destroy();
  });
});
