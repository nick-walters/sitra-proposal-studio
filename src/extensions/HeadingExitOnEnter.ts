import { Extension } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';

/**
 * When the cursor is at the end of an H3 heading and Enter is pressed,
 * create a new paragraph below instead of continuing the heading.
 */
export const HeadingExitOnEnter = Extension.create({
  name: 'headingExitOnEnter',

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from } = selection;
        const parent = $from.parent;

        if (parent.type.name !== 'heading' || parent.attrs.level !== 3) {
          return false;
        }

        const isAtEnd = $from.parentOffset === parent.content.size;
        if (!isAtEnd) {
          return false;
        }

        const endPos = $from.after();
        const paragraph = state.schema.nodes.paragraph.create();
        const tr = state.tr.insert(endPos, paragraph);
        tr.setSelection(TextSelection.create(tr.doc, endPos + 1));
        editor.view.dispatch(tr);
        return true;
      },
    };
  },
});
