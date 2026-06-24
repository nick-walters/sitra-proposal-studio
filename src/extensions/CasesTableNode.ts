import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CasesTableNodeView } from '@/components/CasesTableNodeView';

/**
 * casesTable — block atom node holding the B1.2 cases-table.
 *
 * Stage 1: skeleton only. The node stores ONLY which case_draft ids to
 * render (and their order) plus an optional caption. The actual case
 * content is fetched live by the React NodeView (stage 2).
 *
 * Persisted DOM shape (small placeholder, not the full table):
 *   <div data-cases-table-node data-case-ids="id1,id2,..." data-caption="..."></div>
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    casesTable: {
      insertCasesTable: (attributes: { caseIds: string[]; caption?: string | null }) => ReturnType;
    };
  }
}

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const CasesTableNode = Node.create({
  name: 'casesTable',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      caseIds: {
        default: [] as string[],
        parseHTML: (el) => parseIds(el.getAttribute('data-case-ids')),
        renderHTML: (attrs) => {
          const ids: string[] = Array.isArray(attrs.caseIds) ? attrs.caseIds : [];
          return { 'data-case-ids': ids.join(',') };
        },
      },
      caption: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-caption'),
        renderHTML: (attrs) => (attrs.caption ? { 'data-caption': attrs.caption } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-cases-table-node]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-cases-table-node': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CasesTableNodeView);
  },

  addCommands() {
    return {
      insertCasesTable:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { caseIds: attributes.caseIds || [], caption: attributes.caption ?? null },
          }),
    };
  },
});

export default CasesTableNode;
