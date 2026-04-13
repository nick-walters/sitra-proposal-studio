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
 * Values are stored as data-spacing-* attributes and rendered as inline margin styles.
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
              return raw ? parseFloat(raw) : null;
            },
            renderHTML: (attrs) => {
              const parts: string[] = [];
              if (attrs.spacingBefore != null) parts.push(`margin-top: ${attrs.spacingBefore}pt`);
              if (attrs.spacingAfter != null) parts.push(`margin-bottom: ${attrs.spacingAfter}pt`);
              const result: Record<string, string> = {};
              if (attrs.spacingBefore != null) result['data-spacing-before'] = String(attrs.spacingBefore);
              if (parts.length) result.style = parts.join('; ');
              return result;
            },
          },
          spacingAfter: {
            default: null,
            parseHTML: (el) => {
              const raw = el.getAttribute('data-spacing-after');
              return raw ? parseFloat(raw) : null;
            },
            renderHTML: (attrs) => {
              // Style is handled in spacingBefore renderHTML to avoid conflicts
              if (attrs.spacingAfter == null) return {};
              return { 'data-spacing-after': String(attrs.spacingAfter) };
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

          // For collapsed cursor, resolve the parent paragraph directly
          if (from === to) {
            const $pos = state.selection.$from;
            for (let d = $pos.depth; d >= 0; d--) {
              const node = $pos.node(d);
              if (node.type.name === 'paragraph') {
                const pos = $pos.before(d);
                const newAttrs: Record<string, any> = { ...node.attrs };
                if (attrs.before !== undefined) newAttrs.spacingBefore = attrs.before;
                if (attrs.after !== undefined) newAttrs.spacingAfter = attrs.after;
                tr.setNodeMarkup(pos, undefined, newAttrs);
                changed = true;
                break;
              }
            }
          } else {
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (node.type.name === 'paragraph') {
                const newAttrs: Record<string, any> = { ...node.attrs };
                if (attrs.before !== undefined) newAttrs.spacingBefore = attrs.before;
                if (attrs.after !== undefined) newAttrs.spacingAfter = attrs.after;
                tr.setNodeMarkup(pos, undefined, newAttrs);
                changed = true;
              }
            });
          }

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
