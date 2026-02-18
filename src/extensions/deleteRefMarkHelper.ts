import { Editor } from '@tiptap/core';

/**
 * Helper to delete an entire reference mark (contenteditable=false badge)
 * when Backspace or Delete is pressed adjacent to it.
 *
 * Returns true if a deletion was handled (to prevent default), false otherwise.
 */
export function handleRefMarkDeletion(
  editor: Editor,
  markName: string,
  direction: 'backspace' | 'delete'
): boolean {
  const { state } = editor;
  const { selection } = state;
  const { $from, empty } = selection;

  if (!empty) return false;

  const pos = $from.pos;

  if (direction === 'backspace' && pos > 0) {
    // Check the character(s) before cursor for the mark
    const resolvedBefore = state.doc.resolve(pos - 1);
    const marksBefore = resolvedBefore.marks();
    const hasMark = marksBefore.some(m => m.type.name === markName);

    if (hasMark) {
      // Find the full range of text with this mark
      const { from, to } = findMarkRange(state.doc, pos - 1, markName);
      editor.chain().deleteRange({ from, to }).run();
      return true;
    }
  }

  if (direction === 'delete' && pos < state.doc.content.size) {
    const resolvedAfter = state.doc.resolve(pos);
    // Check if the node after has the mark
    const nodeAfter = resolvedAfter.nodeAfter;
    if (nodeAfter && nodeAfter.isText) {
      const marksAfter = nodeAfter.marks;
      const hasMark = marksAfter.some(m => m.type.name === markName);
      if (hasMark) {
        const { from, to } = findMarkRange(state.doc, pos, markName);
        editor.chain().deleteRange({ from, to }).run();
        return true;
      }
    }
  }

  return false;
}

function findMarkRange(doc: any, pos: number, markName: string): { from: number; to: number } {
  const resolved = doc.resolve(pos);
  const parent = resolved.parent;
  const parentOffset = resolved.parentOffset;
  const startOfParent = pos - parentOffset;

  let from = pos;
  let to = pos + 1;

  // Walk backward to find start of marked text
  let offset = parentOffset;
  while (offset > 0) {
    const charIndex = offset - 1;
    const node = parent.childAfter(charIndex);
    if (node.node && node.node.isText && node.node.marks.some((m: any) => m.type.name === markName)) {
      from = startOfParent + charIndex;
      offset = charIndex;
    } else {
      break;
    }
  }

  // Walk forward to find end of marked text
  offset = parentOffset;
  while (offset < parent.content.size) {
    const node = parent.childAfter(offset);
    if (node.node && node.node.isText && node.node.marks.some((m: any) => m.type.name === markName)) {
      to = startOfParent + node.offset + node.node.nodeSize;
      offset = node.offset + node.node.nodeSize;
    } else {
      break;
    }
  }

  return { from, to };
}
