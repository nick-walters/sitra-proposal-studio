import { Node, mergeAttributes } from '@tiptap/core';

export interface CaseReferenceOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    caseReference: {
      /**
       * Insert a Case reference inline atom node.
       * Signature preserved from the legacy CaseReferenceMark so existing
       * call sites (DocumentEditor cross-reference dropdown) work unchanged.
       */
      insertCaseReference: (attributes: {
        caseNumber: number;
        caseShortName: string;
        caseColor: string;
        caseId: string;
        caseType: string;
      }) => ReturnType;
    };
  }
}

import { getCaseTypePrefix } from '@/lib/caseTypeLabels';

/**
 * CaseReferenceNode (Stage 2 migration)
 *
 * Inline atomic node replacing the legacy CaseReferenceMark. The badge is
 * structurally indivisible: the caret cannot enter it, arrow keys step over
 * it as one unit, Backspace/Delete removes it atomically. The displayed
 * label is recomputed from attrs on every render — there is no editable
 * text inside the node — so no relabel guard or text-merge logic is
 * required.
 *
 * Backward compatibility: parseHTML matches the SAME `span[data-case-reference]`
 * shape the legacy mark produced, so existing saved documents load straight
 * into this node with no data migration. The atom discards children on
 * parse, so the inner mark-era text is dropped and the label is rebuilt
 * from attrs.
 *
 * toDOM follows the WP fix: OUTER span carries ONLY pill-shape styles
 * plus data attrs / class / contenteditable=false. ALL text-affecting
 * styles (color, font, weight, line-height) live on an INNER wrapper span
 * around the label, so adjacent typed text cannot inherit any of them.
 */
export const CaseReferenceNode = Node.create<CaseReferenceOptions>({
  name: 'caseReference',

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
      caseNumber: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-case-number');
          if (raw === null || raw === '') return null;
          const n = Number(raw);
          return Number.isFinite(n) ? n : raw;
        },
        renderHTML: (attributes) => {
          if (attributes.caseNumber === null || attributes.caseNumber === undefined) {
            return {};
          }
          return { 'data-case-number': attributes.caseNumber };
        },
      },
      caseShortName: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-case-short-name'),
        renderHTML: (attributes) => {
          if (!attributes.caseShortName) return {};
          return { 'data-case-short-name': attributes.caseShortName };
        },
      },
      caseColor: {
        default: '#000000',
        parseHTML: (element) => element.getAttribute('data-case-color') || '#000000',
        renderHTML: (attributes) => {
          return { 'data-case-color': attributes.caseColor || '#000000' };
        },
      },
      caseId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-case-id'),
        renderHTML: (attributes) => {
          if (!attributes.caseId) return {};
          return { 'data-case-id': attributes.caseId };
        },
      },
      caseType: {
        default: 'case_study',
        parseHTML: (element) => element.getAttribute('data-case-type') || 'case_study',
        renderHTML: (attributes) => {
          return { 'data-case-type': attributes.caseType || 'case_study' };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-case-reference]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const caseNumber = node.attrs.caseNumber;
    const caseShortName = node.attrs.caseShortName;
    const caseType = node.attrs.caseType;
    const prefix = getCaseTypePrefix(caseType);
    const label = prefix
      ? `${prefix}${caseNumber}`
      : (caseShortName || `${caseNumber}`);

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-case-reference': '',
        'class': 'case-reference-badge',
        'contenteditable': 'false',
        'style': `
          display: inline-flex;
          align-items: center;
          background-color: #ffffff;
          border: 1.5px solid #000000;
          padding: 0 0.4rem;
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
            "color: #000000; font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: 700; font-style: normal; line-height: 1;",
        },
        label,
      ],
    ];
  },

  addCommands() {
    return {
      insertCaseReference:
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

export default CaseReferenceNode;
