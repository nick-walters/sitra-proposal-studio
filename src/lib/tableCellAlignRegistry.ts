import type { Editor } from '@tiptap/react';
import type { CellAlignH, CellAlignV } from '@/lib/tableStyleSpec';

/**
 * Per-cell alignment is data, not an editor mark: the toolbar must write it to
 * `card_table_cells.align_h/align_v` rather than to the ProseMirror document.
 *
 * Visibility of the controls is decided by `fieldCapabilities` (the cell editor
 * declares `tableCellAlign`); this registry supplies the handler the toolbar
 * calls, keyed by the same editor instance.
 */
export interface CellAlignController {
  alignH: CellAlignH | null;
  alignV: CellAlignV | null;
  setAlignH: (value: CellAlignH) => void;
  setAlignV: (value: CellAlignV) => void;
}

const registry = new WeakMap<Editor, CellAlignController>();

export function registerCellAlign(editor: Editor, controller: CellAlignController): void {
  registry.set(editor, controller);
}

export function unregisterCellAlign(editor: Editor): void {
  registry.delete(editor);
}

export function getCellAlign(editor: Editor | null | undefined): CellAlignController | null {
  if (!editor || editor.isDestroyed) return null;
  return registry.get(editor) ?? null;
}
