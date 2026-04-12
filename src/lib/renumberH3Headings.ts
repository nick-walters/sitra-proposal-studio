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
          // Replace prefix text with marked version
          const marks = headingNumberMark ? [headingNumberMark] : [];
          tr.replaceRangeWith(from, to, state.schema.text(newPrefix, marks));
          hasChanges = true;
        }
      }
    }
  });

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
