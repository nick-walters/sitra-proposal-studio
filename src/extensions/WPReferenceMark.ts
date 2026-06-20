import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { handleRefMarkDeletion } from './deleteRefMarkHelper';

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
        default: '#73C92D',
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
    const color = HTMLAttributes['data-wp-color'] || '#73C92D';
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
          border: 1.5px solid ${color};
          padding: 0px 5px;
          border-radius: 9999px;
          font-family: 'Times New Roman', Times, serif;
          font-size: 11pt;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
          vertical-align: baseline;
          cursor: pointer;
        `,
      }),
      0, // Use 0 to render the actual text content, not duplicate it
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => handleRefMarkDeletion(this.editor, this.name, 'backspace'),
      Delete: () => handleRefMarkDeletion(this.editor, this.name, 'delete'),
    };
  },

  addProseMirrorPlugins() {
    const markName = this.name;
    return [
      new Plugin({
        key: new PluginKey('wpReferenceGuard'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged)) return null;

          const changedRanges: { from: number; to: number }[] = [];
          transactions.forEach(t => {
            t.steps.forEach(step => {
              step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                changedRanges.push({ from: newStart, to: newEnd });
              });
            });
          });
          if (changedRanges.length === 0) return null;

          const { tr, doc, schema } = newState;
          const markType = schema.marks[markName];
          if (!markType) return null;

          const replacements: { pos: number; end: number; expected: string; marks: readonly any[] }[] = [];
          const seen = new Set<number>();

          for (const range of changedRanges) {
            const from = Math.max(0, range.from - 10);
            const to = Math.min(doc.content.size, range.to + 10);
            if (from >= to) continue;

            doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText) return;
              if (seen.has(pos)) return;
              const mark = node.marks.find(m => m.type === markType);
              if (!mark) return; // defensive: only queue nodes that already carry THIS mark
              seen.add(pos);

              const wpNum = mark.attrs.wpNumber;
              const wpSN = mark.attrs.wpShortName;
              const expected = wpSN ? `WP${wpNum}: ${wpSN}` : `WP${wpNum}`;
              const actual = node.text || '';

              if (actual !== expected) {
                replacements.push({ pos, end: pos + node.nodeSize, expected, marks: node.marks });
              }
            });
          }

          // Apply highest position first so lower positions remain valid (no mapping drift).
          replacements.sort((a, b) => b.pos - a.pos);
          let modified = false;
          for (const r of replacements) {
            // Re-verify the target node still carries this mark before overwriting.
            const target = doc.nodeAt(r.pos);
            if (!target || !target.isText) continue;
            if (!target.marks.some(m => m.type === markType)) continue;
            const newNode = schema.text(r.expected, r.marks);
            tr.replaceWith(r.pos, r.end, newNode);
            modified = true;
          }

          return modified ? tr : null;

        },
      }),
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
          const label = attributes.wpShortName ? `WP${attributes.wpNumber}: ${attributes.wpShortName}` : `WP${attributes.wpNumber}`;
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
