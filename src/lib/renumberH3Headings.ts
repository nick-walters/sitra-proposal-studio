import type { Editor } from '@tiptap/react';

/**
 * Renumber all numbered H3 headings in the editor based on their document order.
 * Numbered H3s are detected by a leading pattern like "X.X.N. " (digits.digits.digits.)
 * The sectionPrefix should be e.g. "1.1" so headings become "1.1.1.", "1.1.2.", etc.
 *
 * Applies the `headingNumberLabel` mark to the prefix to make it non-editable.
 */
export function renumberH3Headings(editor: Editor, sectionPrefix: string) {
  const { state } = editor;
  const { tr } = state;
  // Pattern: starts with digits.digits.digits. (the numbered prefix)
  const prefixPattern = /^\d+\.\d+\.\d+\.\s*/;
  
  let counter = 0;
  let hasChanges = false;

  const headingNumberMark = state.schema.marks.headingNumberLabel?.create();

  const replacements: { from: number; to: number; newPrefix: string; headingPos: number }[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.attrs.level === 3) {
      const text = node.textContent;
      const match = text.match(prefixPattern);
      if (match) {
        counter++;
        const newPrefix = `${sectionPrefix}.${counter}. `;
        const from = pos + 1; // inside the heading node
        const to = from + match[0].length;

        if (match[0] !== newPrefix || !hasHeadingNumberMark(node, state)) {
          replacements.push({ from, to, newPrefix, headingPos: pos });
        }
      }
    }
  });

  // Apply highest-position-first so earlier (lower) positions are not shifted
  // by length-changing replacements that happen later in the document
  // (e.g. when the counter crosses 9 → 10, or a prefix is introduced for the
  // first time). Same position-safety pattern as the reference-mark guards
  // and syncCrossReferences.
  replacements.sort((a, b) => b.from - a.from);

  for (const r of replacements) {
    // Re-check against the live transaction doc: the heading must still be a
    // level-3 heading and the text at [from, to] must still look like a
    // numbered prefix of the expected length. Skip silently otherwise.
    const headingNode = tr.doc.nodeAt(r.headingPos);
    if (!headingNode || headingNode.type.name !== 'heading' || headingNode.attrs.level !== 3) continue;
    if (r.to > tr.doc.content.size) continue;
    const currentText = tr.doc.textBetween(r.from, r.to, '', '');
    if (!prefixPattern.test(currentText)) continue;

    const marks = headingNumberMark ? [headingNumberMark] : [];
    tr.replaceRangeWith(r.from, r.to, state.schema.text(r.newPrefix, marks));
    hasChanges = true;
  }

  if (hasChanges) {
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }
}

/** Check if the first text node in the heading already has the headingNumberLabel mark */
function hasHeadingNumberMark(node: any, state: any): boolean {
  const markType = state.schema.marks.headingNumberLabel;
  if (!markType) return false;
  
  let found = false;
  node.forEach((child: any) => {
    if (!found && child.isText && child.marks.some((m: any) => m.type === markType)) {
      found = true;
    }
  });
  return found;
}
