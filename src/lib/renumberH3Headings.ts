import type { Editor } from '@tiptap/react';

/**
 * Renumber all numbered H3 headings in the editor based on their document order.
 * Numbered H3s are detected by a leading pattern like "X.X.N. " (digits.digits.digits.)
 * The sectionPrefix should be e.g. "1.1" so headings become "1.1.1.", "1.1.2.", etc.
 */
export function renumberH3Headings(editor: Editor, sectionPrefix: string) {
  const { state } = editor;
  const { tr } = state;
  // Pattern: starts with digits.digits.digits. (the numbered prefix)
  const prefixPattern = /^\d+\.\d+\.\d+\.\s*/;
  
  let counter = 0;
  let hasChanges = false;

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.attrs.level === 3) {
      const text = node.textContent;
      const match = text.match(prefixPattern);
      if (match) {
        counter++;
        const newPrefix = `${sectionPrefix}.${counter}. `;
        if (match[0] !== newPrefix) {
          // Replace the old prefix with the new one
          const from = pos + 1; // inside the heading node
          const to = from + match[0].length;
          tr.replaceRangeWith(from, to, state.schema.text(newPrefix));
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
