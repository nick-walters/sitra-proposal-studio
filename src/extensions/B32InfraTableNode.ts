import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { B32_INFRA_DEFAULT_HEADER } from '@/lib/typst/b32InfraData';
import { B32InfraTableNodeView } from '@/components/B32InfraTableNodeView';

/**
 * b32InfraTable — block atom node holding the B3.2 "Access to critical
 * infrastructure" table (prompt 138, reinstated in prompt 145).
 *
 * Persisted DOM shape:
 *   <div data-b32-infra-table data-header="…"></div>
 *
 * The rows are NOT stored: they are fetched live from
 * `participant_infrastructure.project_support` (the 200-character notes) in A2
 * order. Only the editable header cell travels in the HTML.
 *
 * IMPORTANT — do not delete this node type. The migration that inserted
 * `<div data-b32-infra-table>` into `b32.capacity` is applied in production; if
 * this extension is missing the stored HTML parses as an unknown div and the
 * module renders as blank. `src/lib/typst/b32InfraData.ts` and
 * `src/components/B32InfraTableNodeView.tsx` are part of the same unit.
 */

// Re-exported for existing importers. Defined in `b32InfraData.ts` so this
// extension and its NodeView do not form an import cycle.
export { B32_INFRA_DEFAULT_HEADER };

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    b32InfraTable: {
      insertB32InfraTable: (attributes?: { header?: string }) => ReturnType;
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
      header: {
        default: B32_INFRA_DEFAULT_HEADER,
        parseHTML: (el) => el.getAttribute('data-header') || B32_INFRA_DEFAULT_HEADER,
        renderHTML: (attrs) => ({ 'data-header': String(attrs.header ?? B32_INFRA_DEFAULT_HEADER) }),
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
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { header: attributes?.header ?? B32_INFRA_DEFAULT_HEADER },
          }),
    };
  },
});

export default B32InfraTableNode;
