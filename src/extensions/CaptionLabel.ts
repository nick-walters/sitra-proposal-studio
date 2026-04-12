import { Mark } from '@tiptap/core';

/**
 * A TipTap mark that wraps caption labels (e.g. "Table 1.2.a. ")
 * and renders them as non-editable, non-selectable spans.
 *
 * The label is always bold + italic. The trailing space after the
 * label period is included inside the mark so users cannot delete it.
 */
export const CaptionLabel = Mark.create({
  name: 'captionLabel',

  // Exclude other marks that would conflict — the label already contains bold+italic styling
  excludes: '',

  parseHTML() {
    return [{ tag: 'span[data-caption-label]' }];
  },

  renderHTML() {
    return [
      'span',
      {
        'data-caption-label': '',
        contenteditable: 'false',
        style: 'user-select: none; font-weight: bold; font-style: italic;',
      },
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Prevent backspace from deleting into the caption label
      Backspace: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;

        // Check if the character just before cursor has the captionLabel mark
        const posBefore = $from.pos;
        if (posBefore <= 1) return false;

        const resolved = state.doc.resolve(posBefore - 1);
        const nodeBefore = resolved.parent;
        const indexBefore = resolved.index();

        if (indexBefore > 0) {
          return false;
        }

        // Check marks at the position just before cursor
        const $prev = state.doc.resolve(posBefore - 1);
        const marks = $prev.marks();
        if (marks.some((m) => m.type.name === 'captionLabel')) {
          return true; // Block the backspace
        }

        return false;
      },
    };
  },
});
