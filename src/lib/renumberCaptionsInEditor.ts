import { Editor } from '@tiptap/core';

/**
 * Renumbers figure and table captions directly in the ProseMirror document.
 * Called after block reordering (drag-and-drop or keyboard shortcuts).
 * 
 * Walks all top-level nodes, finds caption paragraphs matching
 * "Figure X.X.x." or "Table X.X.x.", and renumbers them sequentially (a, b, c...).
 * 
 * Returns true if any changes were made.
 */
export function renumberCaptionsInEditor(editor: Editor, sectionNumber: string): boolean {
  if (!editor || !sectionNumber) return false;

  const cleanSectionNum = sectionNumber.replace(/^[A-Za-z]+/, '');
  const { state } = editor;
  const { doc } = state;

  // Caption pattern: "Figure 1.1.a." or "Table 1.1.a." at the start of a paragraph
  const captionPattern = /^(Figure|Table)\s+(\d+\.\d+)\.([a-z])\./i;

  // Collect caption info: position of the paragraph, type, and the range of the caption text
  interface CaptionInfo {
    type: 'figure' | 'table';
    paragraphPos: number; // position of paragraph node in the doc
    // The caption text "Table 1.1.a." may span multiple text nodes (e.g., bold+italic)
    // We need to find the character range within the paragraph content
    captionTextStart: number; // absolute doc position of caption text start
    captionTextEnd: number;   // absolute doc position of caption text end (after the trailing ".")
    currentText: string;      // e.g. "Table 1.1.a."
  }

  const captions: CaptionInfo[] = [];

  doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') return;
    
    const fullText = node.textContent;
    const match = captionPattern.exec(fullText);
    if (!match) return;

    const type = match[1].toLowerCase() === 'figure' ? 'figure' : 'table';
    const captionStr = match[0]; // e.g. "Table 1.1.a."
    
    // The caption text starts at the beginning of the paragraph content
    // Paragraph content starts at offset + 1 (skip the opening tag)
    const captionTextStart = offset + 1;
    const captionTextEnd = captionTextStart + captionStr.length;

    captions.push({
      type,
      paragraphPos: offset,
      captionTextStart,
      captionTextEnd,
      currentText: captionStr,
    });
  });

  if (captions.length === 0) return false;

  // Count per type to assign letters
  let figureIdx = 0;
  let tableIdx = 0;
  const updates: { from: number; to: number; newText: string; oldText: string; type: 'figure' | 'table'; oldLetter: string; newLetter: string }[] = [];

  for (const cap of captions) {
    const idx = cap.type === 'figure' ? figureIdx++ : tableIdx++;
    const newLetter = String.fromCharCode('a'.charCodeAt(0) + idx);
    const prefix = cap.type === 'figure' ? 'Figure' : 'Table';
    const newText = `${prefix} ${cleanSectionNum}.${newLetter}.`;
    const oldMatch = captionPattern.exec(cap.currentText);
    const oldLetter = oldMatch ? oldMatch[3] : '';
    
    if (cap.currentText !== newText) {
      updates.push({ from: cap.captionTextStart, to: cap.captionTextEnd, newText, oldText: cap.currentText, type: cap.type, oldLetter, newLetter });
    }
  }

  if (updates.length === 0) return false;

  // Build a mapping from old label to new label for cross-reference mark updates
  // e.g. "Figure 1.1.b" → "Figure 1.1.a"
  const labelRemap = new Map<string, string>();
  // Also build a full remap for all captions (including unchanged ones) so refs always resolve
  figureIdx = 0;
  tableIdx = 0;
  for (const cap of captions) {
    const idx = cap.type === 'figure' ? figureIdx++ : tableIdx++;
    const newLetter = String.fromCharCode('a'.charCodeAt(0) + idx);
    const prefix = cap.type === 'figure' ? 'Figure' : 'Table';
    const oldMatch = captionPattern.exec(cap.currentText);
    const oldLetter = oldMatch ? oldMatch[3] : '';
    const oldLabel = `${prefix} ${oldMatch ? oldMatch[2] : cleanSectionNum}.${oldLetter}`;
    const newLabel = `${prefix} ${cleanSectionNum}.${newLetter}`;
    if (oldLabel !== newLabel) {
      labelRemap.set(oldLabel, newLabel);
    }
  }

  // Apply caption text updates in reverse order to preserve positions
  const tr = state.tr;
  for (let i = updates.length - 1; i >= 0; i--) {
    const { from, to, newText } = updates[i];
    const $from = doc.resolve(from);
    const marks = $from.marks();
    tr.replaceWith(from, to, state.schema.text(newText, marks));
  }

  // Now update figureTableReference marks whose text matches old labels
  if (labelRemap.size > 0) {
    const figTableRefType = state.schema.marks.figureTableReference;
    if (figTableRefType) {
      // Walk through the (already-modified) doc in the transaction
      const newDoc = tr.doc;
      const refUpdates: { from: number; to: number; newText: string; mark: any; otherMarks: any[] }[] = [];
      
      newDoc.descendants((node, pos) => {
        if (!node.isText) return;
        for (const mark of node.marks) {
          if (mark.type === figTableRefType) {
            const currentText = node.text || '';
            const newLabel = labelRemap.get(currentText);
            if (newLabel) {
              refUpdates.push({
                from: pos,
                to: pos + node.nodeSize,
                newText: newLabel,
                mark,
                otherMarks: node.marks.filter(m => m !== mark),
              });
            }
          }
        }
      });

      // Apply ref updates in reverse
      for (let i = refUpdates.length - 1; i >= 0; i--) {
        const { from, to, newText, mark, otherMarks } = refUpdates[i];
        const newMark = mark.type.create({ ...mark.attrs });
        tr.replaceWith(from, to, state.schema.text(newText, [newMark, ...otherMarks]));
      }
    }
  }

  tr.setMeta('blockReorder', true); // Skip track changes for this renumbering
  tr.setMeta('addToHistory', false); // Don't create separate undo step
  editor.view.dispatch(tr);

  return true;
}
