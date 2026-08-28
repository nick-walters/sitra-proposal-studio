import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { B32InfraTableNodeView } from '@/components/B32InfraTableNodeView';

/**
 * b32InfraTable — the B3.2 "Access to critical infrastructure" table.
 *
 * Persisted DOM shape:
 *   <div data-b32-infra-table data-heading="…"></div>
 *
 * A block atom: the rows are read live from A2 (`participant_infrastructure`),
 * one per participant organisation, and only the 200-character "how it will
 * support the project" notes are shown — the 500-character portal description
 * stays in A2. The header cell's heading is authored here and stored on the
 * node, so it travels with the module.
 */

export const B32_INFRA_DEFAULT_HEADING =
  'Participants\u2019 critical infrastructure & how it will support the project\u2019s implementation';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    b32InfraTable: {
      insertB32InfraTable: () => ReturnType;
    };
  }
}

export const B32InfraTableNode = Node.create({
  name: 'b32InfraTable',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  defining: true,

  addAttributes() {
    return {
      heading: {
        default: B32_INFRA_DEFAULT_HEADING,
        parseHTML: (el) => el.getAttribute('data-heading') || B32_INFRA_DEFAULT_HEADING,
        renderHTML: (attrs) => ({ 'data-heading': String(attrs.heading ?? B32_INFRA_DEFAULT_HEADING) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-b32-infra-table]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-b32-infra-table': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(B32InfraTableNodeView);
  },

  addCommands() {
    return {
      insertB32InfraTable:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});

export default B32InfraTableNode;
