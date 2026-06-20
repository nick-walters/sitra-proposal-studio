import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { handleRefMarkDeletion } from './deleteRefMarkHelper';

export interface InlineReferenceOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineReference: {
      insertTaskReference: (attributes: {
        wpNumber: number;
        taskNumber: number;
        taskId?: string;
        wpColor?: string;
      }) => ReturnType;
      insertDeliverableReference: (attributes: {
        deliverableNumber: string;
        deliverableId?: string;
        wpColor?: string;
      }) => ReturnType;
      insertMilestoneReference: (attributes: {
        milestoneNumber: number;
        milestoneId?: string;
      }) => ReturnType;
    };
  }
}

export const InlineReferenceMark = Mark.create<InlineReferenceOptions>({
  name: 'inlineReference',

  priority: 1000,
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
      refType: {
        default: 'task',
        parseHTML: (el) => el.getAttribute('data-ref-type'),
        renderHTML: (attrs) => ({ 'data-ref-type': attrs.refType }),
      },
      wpNumber: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-wp-number'),
        renderHTML: (attrs) => attrs.wpNumber ? { 'data-wp-number': attrs.wpNumber } : {},
      },
      taskNumber: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-task-number'),
        renderHTML: (attrs) => attrs.taskNumber ? { 'data-task-number': attrs.taskNumber } : {},
      },
      taskId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-task-id'),
        renderHTML: (attrs) => attrs.taskId ? { 'data-task-id': attrs.taskId } : {},
      },
      deliverableNumber: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-deliverable-number'),
        renderHTML: (attrs) => attrs.deliverableNumber ? { 'data-deliverable-number': attrs.deliverableNumber } : {},
      },
      deliverableId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-deliverable-id'),
        renderHTML: (attrs) => attrs.deliverableId ? { 'data-deliverable-id': attrs.deliverableId } : {},
      },
      milestoneNumber: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-milestone-number'),
        renderHTML: (attrs) => attrs.milestoneNumber ? { 'data-milestone-number': attrs.milestoneNumber } : {},
      },
      milestoneId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-milestone-id'),
        renderHTML: (attrs) => attrs.milestoneId ? { 'data-milestone-id': attrs.milestoneId } : {},
      },
      wpColor: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-wp-color'),
        renderHTML: (attrs) => attrs.wpColor ? { 'data-wp-color': attrs.wpColor } : {},
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-inline-reference]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const refType = HTMLAttributes['data-ref-type'] || 'task';
    const wpColor = HTMLAttributes['data-wp-color'] || null;

    // Build inline style for WP color on task and deliverable refs
    const style: Record<string, string> = {};
    if (wpColor && (refType === 'task' || refType === 'deliverable')) {
      style['border-color'] = wpColor;
      style['--wp-color'] = wpColor;
    }

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-inline-reference': '',
        'contenteditable': 'false',
        'class': `inline-ref inline-ref-${refType}`,
        ...(Object.keys(style).length > 0 ? { style: Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') } : {}),
      }),
      0,
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
        key: new PluginKey('inlineReferenceGuard'),
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

              let expected: string | null = null;
              const refType = mark.attrs.refType;
              if (refType === 'task') {
                expected = `T${mark.attrs.wpNumber}.${mark.attrs.taskNumber}`;
              } else if (refType === 'deliverable') {
                expected = mark.attrs.deliverableNumber;
              } else if (refType === 'milestone') {
                expected = `MS${mark.attrs.milestoneNumber}`;
              }

              if (expected && node.text !== expected) {
                replacements.push({ pos, end: pos + node.nodeSize, expected, marks: node.marks });
              }
            });
          }

          // Apply highest position first so lower positions remain valid (no mapping drift).
          replacements.sort((a, b) => b.pos - a.pos);
          let modified = false;
          for (const r of replacements) {
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
      insertTaskReference:
        (attrs) =>
        ({ chain }) => {
          const label = `T${attrs.wpNumber}.${attrs.taskNumber}`;
          return chain()
            .insertContent({
              type: 'text',
              text: label,
              marks: [{
                type: 'inlineReference',
                attrs: {
                  refType: 'task',
                  wpNumber: attrs.wpNumber,
                  taskNumber: attrs.taskNumber,
                  taskId: attrs.taskId || null,
                  wpColor: attrs.wpColor || null,
                },
              }],
            })
            .run();
        },
      insertDeliverableReference:
        (attrs) =>
        ({ chain }) => {
          const label = attrs.deliverableNumber;
          return chain()
            .insertContent({
              type: 'text',
              text: label,
              marks: [{
                type: 'inlineReference',
                attrs: {
                  refType: 'deliverable',
                  deliverableNumber: attrs.deliverableNumber,
                  deliverableId: attrs.deliverableId || null,
                  wpColor: attrs.wpColor || null,
                },
              }],
            })
            .run();
        },
      insertMilestoneReference:
        (attrs) =>
        ({ chain }) => {
          const label = `MS${attrs.milestoneNumber}`;
          return chain()
            .insertContent([
              {
                type: 'text',
                text: label,
                marks: [{
                  type: 'inlineReference',
                  attrs: {
                    refType: 'milestone',
                    milestoneNumber: attrs.milestoneNumber,
                    milestoneId: attrs.milestoneId || null,
                  },
                }],
              },
            ])
            .run();
        },
    };
  },
});
