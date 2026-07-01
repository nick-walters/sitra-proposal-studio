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
export function renumberCaptionsInEditor(editor: Editor, sectionNumber: string, tableOffset: number = 0): boolean {
  if (!editor || !sectionNumber) return false;

  const cleanSectionNum = sectionNumber.replace(/^[A-Za-z]+/, '');
  const { state } = editor;
  const { doc } = state;

  // Caption pattern: "Figure 1.1.a." or "Table 1.1.a." at the start of a paragraph
  const captionPattern = /^(Figure|Table)\s+(\d+\.\d+)\.([a-z])\./i;

  // Collect caption info: position of the paragraph, type, and the range of the caption text
  interface CaptionInfo {
    type: 'figure' | 'table' | 'caseTable';
    paragraphPos: number; // position of paragraph node in the doc
    // The caption text "Table 1.1.a." may span multiple text nodes (e.g., bold+italic)
    // We need to find the character range within the paragraph content
    captionTextStart: number; // absolute doc position of caption text start
    captionTextEnd: number;   // absolute doc position of caption text end (after the trailing ".")
    currentText: string;      // e.g. "Table 1.1.a."
  }

  const captions: CaptionInfo[] = [];

  doc.forEach((node, offset) => {
    // casesTable atoms render their caption inside a NodeView (React) — they
    // are NOT paragraphs, so they don't show up in the text scan. We still
    // need to count them as table-caption slots so manual tables interleaved
    // around them get the right sequential letter.
    if (node.type.name === 'casesTable') {
      captions.push({
        type: 'caseTable',
        paragraphPos: offset,
        captionTextStart: -1,
        captionTextEnd: -1,
        currentText: '',
      });
      return;
    }
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
  let tableIdx = tableOffset; // Start from offset to account for B12 tables before editor
  const updates: { from: number; to: number; newText: string; oldText: string; type: 'figure' | 'table'; oldLetter: string; newLetter: string }[] = [];

  for (const cap of captions) {
    if (cap.type === 'caseTable') {
      // Reserve a slot — case-table captions render inside the NodeView.
      tableIdx++;
      continue;
    }
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
  tableIdx = tableOffset;
  for (const cap of captions) {
    if (cap.type === 'caseTable') {
      tableIdx++;
      continue;
    }
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
  const captionLabelMark = state.schema.marks.captionLabel?.create();
  const boldMark = state.schema.marks.bold?.create();
  const italicMark = state.schema.marks.italic?.create();
  
  for (let i = updates.length - 1; i >= 0; i--) {
    const { from, to, newText } = updates[i];
    // Apply captionLabel + bold + italic marks to the renumbered label
    const marks = [boldMark, italicMark, captionLabelMark].filter(Boolean);
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

/**
 * Finds the table node the cursor is currently inside, then looks for a caption
 * paragraph immediately above it. If the caption exists but is improperly formatted
 * (e.g. pasted text without auto-numbering), it rewrites it with proper numbering
 * and styling. If no caption paragraph exists above the table, one is inserted.
 *
 * Caption format:
 *  - Label ("Table X.X.x. ") → bold + italic
 *  - Description text → italic only (not bold)
 *
 * Returns true if changes were made.
 */
export function updateCaptionForTableAtCursor(editor: Editor, sectionNumber: string, tableOffset: number = 0): boolean {
  if (!editor || !sectionNumber) return false;

  const cleanSectionNum = sectionNumber.replace(/^[A-Za-z]+/, '');
  const { state } = editor;
  const { doc, schema } = state;
  const { $from } = state.selection;

  // Walk up to find the table node
  let tableDepth = -1;
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === 'table') {
      tableDepth = d;
      break;
    }
  }
  if (tableDepth < 0) return false;

  const tablePos = $from.before(tableDepth); // position before the table node

  // Count all table captions BEFORE this table to determine the letter
  const captionPattern = /^(Table)\s+(\d+\.\d+)\.([a-z])\./i;
  let tableLetterIdx = tableOffset;
  doc.forEach((node, offset) => {
    if (offset >= tablePos) return; // only count captions before this table
    // casesTable atoms render their caption in a NodeView (not a paragraph),
    // but they still occupy a slot in the global table-caption sequence.
    if (node.type.name === 'casesTable') {
      tableLetterIdx++;
      return;
    }
    if (node.type.name === 'paragraph') {
      const cls = (node.attrs?.class || '') as string;
      const text = node.textContent;
      if (cls.includes('table-caption') && captionPattern.test(text)) {
        tableLetterIdx++;
      }
    }
  });


  // Check if there's a paragraph immediately before the table
  const $tablePos = doc.resolve(tablePos);
  const indexInParent = $tablePos.index($tablePos.depth);
  const parent = $tablePos.parent;

  let existingCaptionPos: number | null = null;
  let existingCaptionNode: any = null;

  if (indexInParent > 0) {
    const prevNode = parent.child(indexInParent - 1);
    if (prevNode.type.name === 'paragraph') {
      const cls = (prevNode.attrs?.class || '') as string;
      const text = prevNode.textContent.trim();
      // Accept it as a caption if it has the table-caption class, or if it looks like a table caption
      if (
        cls.includes('table-caption') ||
        /^table\s+/i.test(text)
      ) {
        // Calculate the absolute position of this paragraph
        let pos = $tablePos.start($tablePos.depth);
        for (let i = 0; i < indexInParent - 1; i++) {
          pos += parent.child(i).nodeSize;
        }
        existingCaptionPos = pos;
        existingCaptionNode = prevNode;
      }
    }
  }

  const newLetter = String.fromCharCode('a'.charCodeAt(0) + tableLetterIdx);
  const newLabel = `Table ${cleanSectionNum}.${newLetter}. `;

  const boldMark = schema.marks.bold?.create();
  const italicMark = schema.marks.italic?.create();

  if (existingCaptionNode && existingCaptionPos !== null) {
    // Extract the user text (strip any existing label)
    const fullText = existingCaptionNode.textContent;
    const labelMatch = /^(?:Table\s+\d+\.\d+\.[a-z]\.\s*)/i.exec(fullText);
    const userText = labelMatch ? fullText.slice(labelMatch[0].length).trim() : fullText.trim();

    // Rebuild the caption node content with captionLabel mark for non-editable label
    const captionLabelMark = schema.marks.captionLabel?.create();
    const labelMarks = [boldMark, italicMark, captionLabelMark].filter(Boolean);
    const labelTextNode = schema.text(newLabel, labelMarks);
    const contentNodes = [labelTextNode];
    if (userText) {
      contentNodes.push(schema.text(userText, [italicMark].filter(Boolean)));
    } else {
      contentNodes.push(schema.text('Caption', [italicMark].filter(Boolean)));
    }

    const newCaptionNode = schema.nodes.paragraph.create(
      { class: 'table-caption', textAlign: 'left' },
      contentNodes,
    );

    const tr = state.tr.replaceWith(
      existingCaptionPos,
      existingCaptionPos + existingCaptionNode.nodeSize,
      newCaptionNode,
    );
    tr.setMeta('addToHistory', true);
    editor.view.dispatch(tr);
    return true;
  } else {
    // No caption above the table — insert one
    const captionLabelMark = schema.marks.captionLabel?.create();
    const labelMarks = [boldMark, italicMark, captionLabelMark].filter(Boolean);
    const labelTextNode = schema.text(newLabel, labelMarks);
    const captionTextNode = schema.text('Caption', [italicMark].filter(Boolean));
    const newCaptionNode = schema.nodes.paragraph.create(
      { class: 'table-caption', textAlign: 'left' },
      [labelTextNode, captionTextNode],
    );

    const tr = state.tr.insert(tablePos, newCaptionNode);
    tr.setMeta('addToHistory', true);
    editor.view.dispatch(tr);
    return true;
  }
}
