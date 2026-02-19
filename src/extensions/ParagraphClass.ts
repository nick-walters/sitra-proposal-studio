import { Extension } from '@tiptap/core';

/**
 * Adds a persistent `class` attribute to the Paragraph node so that
 * classes like `figure-caption` and `table-caption` survive the
 * ProseMirror schema round-trip.
 */
export const ParagraphClass = Extension.create({
  name: 'paragraphClass',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          class: {
            default: null,
            parseHTML: (element) => element.getAttribute('class') || null,
            renderHTML: (attributes) => {
              if (!attributes.class) return {};
              return { class: attributes.class };
            },
          },
        },
      },
    ];
  },
});
