import { Extension } from '@tiptap/core';

/**
 * Preserves the `class` attribute of a paragraph through a TipTap round trip.
 *
 * The live editor owns a richer version of this (caption widths, floats); the
 * STATIC renderers used by `LazyRichField` only need the class itself, or an
 * authored caption (`p.document-table-caption`) is re-serialised as a plain
 * paragraph and loses its italic Times styling and its derived label the
 * moment the field is unfocused or the page is reloaded.
 */
export const ParagraphClassStatic = Extension.create({
  name: 'paragraphClassStatic',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          class: {
            default: null,
            parseHTML: (element) => element.getAttribute('class') || null,
            renderHTML: (attributes) =>
              attributes.class ? { class: attributes.class as string } : {},
          },
        },
      },
    ];
  },
});
