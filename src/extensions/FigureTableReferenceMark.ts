import { Mark, mergeAttributes } from '@tiptap/core';
import { handleRefMarkDeletion } from './deleteRefMarkHelper';

export interface FigureTableReferenceMarkOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    figureTableReference: {
      insertFigureTableReference: (attrs: { refText: string }) => ReturnType;
    };
  }
}

export const FigureTableReferenceMark = Mark.create<FigureTableReferenceMarkOptions>({
  name: 'figureTableReference',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-fig-table-ref]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-fig-table-ref': '',
        style: `
          font-weight: bold;
          font-style: italic;
          font-family: 'Times New Roman', Times, serif;
          font-size: 11pt;
          cursor: pointer;
        `.replace(/\s+/g, ' ').trim(),
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertFigureTableReference:
        ({ refText }) =>
        ({ tr, dispatch, editor }) => {
          if (dispatch) {
            const mark = editor.schema.marks.figureTableReference.create();
            const textNode = editor.schema.text(refText, [mark]);
            tr.replaceSelectionWith(textNode, false);
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => handleRefMarkDeletion(this.editor, this.name, 'backspace'),
      Delete: () => handleRefMarkDeletion(this.editor, this.name, 'delete'),
    };
  },
});

export default FigureTableReferenceMark;
