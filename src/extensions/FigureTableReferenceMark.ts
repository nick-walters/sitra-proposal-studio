import { Mark, mergeAttributes } from '@tiptap/core';
import { handleRefMarkDeletion } from './deleteRefMarkHelper';

export interface FigureTableReferenceMarkOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    figureTableReference: {
      insertFigureTableReference: (attrs: {
        refText: string;
        figureId?: string;
        tableKey?: string;
        refKind?: 'figure' | 'table';
      }) => ReturnType;
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

  addAttributes() {
    return {
      figureId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-figure-id'),
        renderHTML: (attrs) => attrs.figureId ? { 'data-figure-id': attrs.figureId } : {},
      },
      tableKey: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-table-key'),
        renderHTML: (attrs) => attrs.tableKey ? { 'data-table-key': attrs.tableKey } : {},
      },
      refKind: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-ref-kind'),
        renderHTML: (attrs) => attrs.refKind ? { 'data-ref-kind': attrs.refKind } : {},
      },
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
        ({ refText, figureId, tableKey, refKind }) =>
        ({ tr, dispatch, editor }) => {
          if (dispatch) {
            const markAttrs: Record<string, any> = {};
            if (figureId) markAttrs.figureId = figureId;
            if (tableKey) markAttrs.tableKey = tableKey;
            if (refKind) markAttrs.refKind = refKind;
            const mark = editor.schema.marks.figureTableReference.create(markAttrs);
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
