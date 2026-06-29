import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CasesTableNodeView } from '@/components/CasesTableNodeView';

/**
 * casesTable — block atom node holding the B1.2 cases-table.
 *
 * Persisted DOM shape:
 *   <div
 *     data-cases-table-node
 *     data-case-type-id="<proposal_case_types.id>"   (new — per-type table)
 *     data-case-ids="id1,id2,..."                    (legacy, unused)
 *     data-caption="..."                              (legacy, unused)
 *   ></div>
 *
 * When data-case-type-id is set the NodeView shows ONLY that type's cases
 * and renders its own caption. When absent (legacy placeholder) it falls
 * back to showing every case for the proposal.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    casesTable: {
      insertCasesTable: (attributes: {
        caseIds?: string[];
        caption?: string | null;
        caseTypeId?: string | null;
      }) => ReturnType;
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
          return ids.length ? { 'data-case-ids': ids.join(',') } : {};
        },
      },
      caption: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-caption'),
        renderHTML: (attrs) => (attrs.caption ? { 'data-caption': attrs.caption } : {}),
      },
      caseTypeId: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-case-type-id'),
        renderHTML: (attrs) => (attrs.caseTypeId ? { 'data-case-type-id': attrs.caseTypeId } : {}),
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
            attrs: {
              caseIds: attributes.caseIds || [],
              caption: attributes.caption ?? null,
              caseTypeId: attributes.caseTypeId ?? null,
            },
          }),
    };
  },
});

export default CasesTableNode;
