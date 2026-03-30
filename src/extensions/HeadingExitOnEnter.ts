import { Extension } from '@tiptap/react';

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

        // Only handle H3 headings
        if (parent.type.name !== 'heading' || parent.attrs.level !== 3) {
          return false;
        }

        // Only handle when cursor is at the end of the heading
        const isAtEnd = $from.parentOffset === parent.content.size;
        if (!isAtEnd) {
          return false;
        }

        // Insert a new paragraph after the current heading
        const endPos = $from.after();
        const paragraph = state.schema.nodes.paragraph.create();
        const tr = state.tr.insert(endPos, paragraph);
        // Move cursor into the new paragraph
        tr.setSelection(
          state.selection.constructor === selection.constructor
            ? new (await import('@tiptap/pm/state')).TextSelection(tr.doc.resolve(endPos + 1))
            : tr.selection
        );
        editor.view.dispatch(tr);
        return true;
      },
    };
  },
});
