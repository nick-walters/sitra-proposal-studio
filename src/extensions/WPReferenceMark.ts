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
    };
  }
}

export const WPReferenceMark = Mark.create<WPReferenceOptions>({
  name: 'wpReference',

  priority: 1000,

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
    
    // Calculate contrasting text color
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const textColor = brightness > 128 ? '#000000' : '#ffffff';

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-wp-reference': '',
        'class': 'wp-reference-badge',
        'style': `
          display: inline-flex;
          align-items: center;
          background-color: ${color};
          color: ${textColor};
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          line-height: 1;
          white-space: nowrap;
          vertical-align: baseline;
        `,
      }),
      `WP${wpNumber}${wpShortName ? `: ${wpShortName}` : ''}`,
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
    };
  },
});

export default WPReferenceMark;
