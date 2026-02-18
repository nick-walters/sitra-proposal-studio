import { Mark, mergeAttributes } from '@tiptap/core';

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
          const label = `${attrs.milestoneNumber}`;
          return chain()
            .insertContent({
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
            })
            .run();
        },
    };
  },
});
