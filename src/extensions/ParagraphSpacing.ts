import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphSpacing: {
      setParagraphSpacing: (attrs: { before?: number | null; after?: number | null }) => ReturnType;
      unsetParagraphSpacing: () => ReturnType;
    };
  }
}

/**
 * Adds spacingBefore / spacingAfter (in pt) attributes to paragraphs.
 * Renders as inline margin-top / margin-bottom styles.
 */
export const ParagraphSpacing = Extension.create({
  name: 'paragraphSpacing',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          spacingBefore: {
            default: null,
            parseHTML: (el) => {
              const raw = el.getAttribute('data-spacing-before');
              if (raw) return parseFloat(raw);
              return null;
            },
            renderHTML: (attrs) => {
              if (attrs.spacingBefore == null) return {};
              return {
                'data-spacing-before': String(attrs.spacingBefore),
                style: `margin-top: ${attrs.spacingBefore}pt${attrs.spacingAfter != null ? `; margin-bottom: ${attrs.spacingAfter}pt` : ''}`,
              };
            },
          },
          spacingAfter: {
            default: null,
            parseHTML: (el) => {
              const raw = el.getAttribute('data-spacing-after');
              if (raw) return parseFloat(raw);
              return null;
            },
            renderHTML: (attrs) => {
              if (attrs.spacingAfter == null) return {};
              return {
                'data-spacing-after': String(attrs.spacingAfter),
                style: `margin-bottom: ${attrs.spacingAfter}pt${attrs.spacingBefore != null ? `; margin-top: ${attrs.spacingBefore}pt` : ''}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphSpacing:
        (attrs) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name === 'paragraph') {
              const newAttrs: Record<string, any> = { ...node.attrs };
              if (attrs.before !== undefined) newAttrs.spacingBefore = attrs.before;
              if (attrs.after !== undefined) newAttrs.spacingAfter = attrs.after;
              tr.setNodeMarkup(pos, undefined, newAttrs);
              changed = true;
            }
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
      unsetParagraphSpacing:
        () =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name === 'paragraph') {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                spacingBefore: null,
                spacingAfter: null,
              });
              changed = true;
            }
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
    };
  },
});
