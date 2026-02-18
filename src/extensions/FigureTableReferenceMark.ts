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
        'contenteditable': 'false',
        style: `
          font-weight: bold;
          font-style: italic;
          font-family: 'Times New Roman', Times, serif;
          font-size: 11pt;
          cursor: pointer;
          user-select: all;
        `.replace(/\s+/g, ' ').trim(),
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertFigureTableReference:
        ({ refText }) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: 'text',
              text: refText,
              marks: [{ type: this.name }],
            })
            .run();
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
