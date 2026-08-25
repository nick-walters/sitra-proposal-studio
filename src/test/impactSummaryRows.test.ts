import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import {
  impactSummaryAddRowInEditor,
  impactSummaryDeleteRowInEditor,
  impactSummaryEditorRowCount,
} from '@/lib/cards/impactSummaryRows';

/**
 * Two stacked three-column parts, as B2.1 stores them. Row 2 carries the sort
 * of content that must survive a row operation verbatim: a bold run, a
 * cross-reference chip and a citation superscript.
 */
const PART = (label: string, rows: string[][]) => `
<table><tbody>
  <tr>${['A', 'B', 'C'].map((c) => `<th><p>${label}${c}</p></th>`).join('')}</tr>
  ${rows.map((r) => `<tr>${r.map((c) => `<td><p>${c}</p></td>`).join('')}</tr>`).join('')}
</tbody></table>`;

const CONTENT =
  PART('P1', [
    ['row1 a', 'row1 b', 'row1 c'],
    ['<strong>row2 bold</strong>', 'chip <span data-wp-chip="WP2">WP2</span>', 'cite<sup data-citation="7">7</sup>'],
    ['row3 a', 'row3 b', 'row3 c'],
  ]) +
  PART('P2', [
    ['row1 d', 'row1 e', 'row1 f'],
    ['<em>row2 italic</em>', 'row2 e', 'row2 f'],
    ['row3 d', 'row3 e', 'row3 f'],
  ]);

function createEditor() {
  return new Editor({
    extensions: [StarterKit, Table.configure({ resizable: true }), TableRow, TableHeader, TableCell],
    content: CONTENT,
  });
}

/** Cell text of every part, as a nested array: [part][row][cell]. */
function cellText(editor: Editor): string[][][] {
  const holder = document.createElement('div');
  holder.innerHTML = editor.getHTML();
  return Array.from(holder.querySelectorAll('table')).map((table) =>
    Array.from(table.querySelectorAll('tr'))
      .filter((tr) => !tr.querySelector('th'))
      .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.innerHTML)),
  );
}

describe('impact summary linked rows', () => {
  it('counts logical rows from the live document', () => {
    const editor = createEditor();
    expect(impactSummaryEditorRowCount(editor)).toBe(3);
    editor.destroy();
  });

  it('adding a row leaves every existing cell byte-identical', () => {
    const editor = createEditor();
    const before = cellText(editor);

    expect(impactSummaryAddRowInEditor(editor)).toBe(true);
    const after = cellText(editor);

    expect(after.map((p) => p.length)).toEqual([4, 4]);
    // Existing rows compared CELL BY CELL, not merely counted.
    after.forEach((part, p) => {
      part.slice(0, 3).forEach((row, r) => {
        expect(row).toEqual(before[p][r]);
      });
    });
    // The appended row is empty in both parts.
    after.forEach((part) => {
      part[3].forEach((cell) => expect(cell.replace(/<[^>]+>/g, '').trim()).toBe(''));
    });
    editor.destroy();
  });

  it('deleting a row removes only that row from both parts', () => {
    const editor = createEditor();
    const before = cellText(editor);

    expect(impactSummaryDeleteRowInEditor(editor, 1)).toBe(true);
    const after = cellText(editor);

    expect(after.map((p) => p.length)).toEqual([2, 2]);
    after.forEach((part, p) => {
      expect(part[0]).toEqual(before[p][0]);
      expect(part[1]).toEqual(before[p][2]);
    });
    editor.destroy();
  });

  it('undo restores a deleted row with its chips, citations and formatting', () => {
    const editor = createEditor();
    const before = cellText(editor);

    impactSummaryDeleteRowInEditor(editor, 1);
    editor.commands.undo();
    expect(cellText(editor)).toEqual(before);

    // …and redo removes it again — one history step covering BOTH parts.
    editor.commands.redo();
    expect(impactSummaryEditorRowCount(editor)).toBe(2);
    editor.destroy();
  });

  it('undo reverses an added row in a single step', () => {
    const editor = createEditor();
    const before = cellText(editor);

    impactSummaryAddRowInEditor(editor);
    editor.commands.undo();
    expect(cellText(editor)).toEqual(before);
    editor.destroy();
  });
});
