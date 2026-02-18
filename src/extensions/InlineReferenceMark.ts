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
      }) => ReturnType;
      insertDeliverableReference: (attributes: {
        deliverableNumber: string;
      }) => ReturnType;
      insertMilestoneReference: (attributes: {
        milestoneNumber: number;
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
      deliverableNumber: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-deliverable-number'),
        renderHTML: (attrs) => attrs.deliverableNumber ? { 'data-deliverable-number': attrs.deliverableNumber } : {},
      },
      milestoneNumber: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-milestone-number'),
        renderHTML: (attrs) => attrs.milestoneNumber ? { 'data-milestone-number': attrs.milestoneNumber } : {},
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

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-inline-reference': '',
        'contenteditable': 'false',
        'class': `inline-ref inline-ref-${refType}`,
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
                attrs: { refType: 'task', wpNumber: attrs.wpNumber, taskNumber: attrs.taskNumber },
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
                attrs: { refType: 'deliverable', deliverableNumber: attrs.deliverableNumber },
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
                attrs: { refType: 'milestone', milestoneNumber: attrs.milestoneNumber },
              }],
            })
            .run();
        },
    };
  },
});
