import { Node, mergeAttributes } from '@tiptap/core';
import { formatWPLabel } from '@/lib/referenceLabels';


export interface WPReferenceOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wpReference: {
      /**
       * Insert a WP reference inline atom node.
       * Same signature as the legacy WPReferenceMark.insertWPReference,
       * so existing call sites (DocumentEditor cross-ref dropdown) work unchanged.
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

/**
 * WPReferenceNode
 *
 * Inline atomic node replacing the legacy WPReferenceMark. The badge is now
 * structurally indivisible: the caret cannot enter it, arrow keys step over
 * it as one unit, and Backspace/Delete removes it atomically. The displayed
 * label is recomputed from attrs on every render — there is no editable text
 * inside the node — so no relabel guard or text-merge logic is required.
 *
 * Backward compatibility: parseHTML matches the SAME `span[data-wp-reference]`
 * shape the legacy mark produced, so existing saved documents load straight
 * into this node with no data migration. toDOM re-emits the identical DOM
 * (same data-attrs, class, contenteditable, inline pill CSS), so the
 * sanitiser allowlist and the export converters (which key on those
 * attrs/classes) require no changes.
 */
export const WPReferenceNode = Node.create<WPReferenceOptions>({
  name: 'wpReference',

  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      wpNumber: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-wp-number');
          if (raw === null || raw === '') return null;
          const n = Number(raw);
          return Number.isFinite(n) ? n : raw;
        },
        renderHTML: (attributes) => {
          if (attributes.wpNumber === null || attributes.wpNumber === undefined) {
            return {};
          }
          return { 'data-wp-number': attributes.wpNumber };
        },
      },
      wpShortName: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-wp-short-name'),
        renderHTML: (attributes) => {
          if (!attributes.wpShortName) return {};
          return { 'data-wp-short-name': attributes.wpShortName };
        },
      },
      wpColor: {
        default: '#2563EB',
        parseHTML: (element) => element.getAttribute('data-wp-color') || '#2563EB',
        renderHTML: (attributes) => {
          return { 'data-wp-color': attributes.wpColor || '#2563EB' };
        },
      },
      wpId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-wp-id'),
        renderHTML: (attributes) => {
          if (!attributes.wpId) return {};
          return { 'data-wp-id': attributes.wpId };
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

  renderHTML({ node, HTMLAttributes }) {
    const color = node.attrs.wpColor || '#2563EB';
    const wpNumber = node.attrs.wpNumber;
    const wpShortName = node.attrs.wpShortName;
    const label = wpShortName ? `WP${wpNumber}: ${wpShortName}` : `WP${wpNumber}`;

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
          border: 1.5px solid ${color};
          padding: 0px 5px;
          border-radius: 9999px;
          white-space: nowrap;
          vertical-align: baseline;
          cursor: pointer;
        `,
      }),
      [
        'span',
        {
          style:
            "color: #ffffff; font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: 700; line-height: 1;",
        },
        label,
      ],
    ];
  },

  addCommands() {
    return {
      insertWPReference:
        (attributes) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const node = this.type.create(attributes);
            tr.replaceSelectionWith(node);
          }
          return true;
        },
    };
  },
});

export default WPReferenceNode;
