import { Mark, mergeAttributes } from '@tiptap/core';

export interface WPReferenceOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wpReference: {
      /**
       * Set a WP reference mark
       */
      setWPReference: (attributes: {
        wpNumber: number;
        wpShortName: string;
        wpColor: string;
        wpId: string;
      }) => ReturnType;
      /**
       * Toggle a WP reference mark
       */
      toggleWPReference: (attributes: {
        wpNumber: number;
        wpShortName: string;
        wpColor: string;
        wpId: string;
      }) => ReturnType;
      /**
       * Unset a WP reference mark
       */
      unsetWPReference: () => ReturnType;
      /**
       * Insert a WP reference with content
       */
      insertWPReference: (attributes: {
        wpNumber: number;
        wpShortName: string;
        wpColor: string;
        wpId: string;
      }) => ReturnType;
    };
  }
}

export const WPReferenceMark = Mark.create<WPReferenceOptions>({
  name: 'wpReference',

  priority: 1000,

  // Make it atomic - content can't be edited inside the mark
  inclusive: false,
  excludes: '_',
  exitable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      wpNumber: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-wp-number'),
        renderHTML: (attributes) => {
          if (!attributes.wpNumber) {
            return {};
          }
          return {
            'data-wp-number': attributes.wpNumber,
          };
        },
      },
      wpShortName: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-wp-short-name'),
        renderHTML: (attributes) => {
          if (!attributes.wpShortName) {
            return {};
          }
          return {
            'data-wp-short-name': attributes.wpShortName,
          };
        },
      },
      wpColor: {
        default: '#2563EB',
        parseHTML: (element) => element.getAttribute('data-wp-color'),
        renderHTML: (attributes) => {
          return {
            'data-wp-color': attributes.wpColor,
          };
        },
      },
      wpId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-wp-id'),
        renderHTML: (attributes) => {
          if (!attributes.wpId) {
            return {};
          }
          return {
            'data-wp-id': attributes.wpId,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-wp-reference]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const color = HTMLAttributes['data-wp-color'] || '#2563EB';
    const wpNumber = HTMLAttributes['data-wp-number'];
    const wpShortName = HTMLAttributes['data-wp-short-name'];

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-wp-reference': '',
        'class': 'wp-reference-badge',
        'contenteditable': 'false',
        'style': `
          display: inline-flex;
          align-items: center;
          background-color: ${color};
          color: #ffffff;
          padding: 0 0.4rem;
          border-radius: 9999px;
          font-size: 9pt;
          font-weight: 700;
          line-height: 1.1;
          white-space: nowrap;
          vertical-align: baseline;
          user-select: none;
        `,
      }),
      `WP${wpNumber}`,
    ];
  },

  addCommands() {
    return {
      setWPReference:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      toggleWPReference:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      unsetWPReference:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
      insertWPReference:
        (attributes) =>
        ({ chain }) => {
          const label = `WP${attributes.wpNumber}`;
          return chain()
            .insertContent({
              type: 'text',
              text: label,
              marks: [
                {
                  type: 'wpReference',
                  attrs: attributes,
                },
              ],
            })
            .run();
        },
    };
  },
});

export default WPReferenceMark;
