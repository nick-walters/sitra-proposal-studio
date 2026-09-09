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
        includeNumber?: boolean;
        includeAbbreviation?: boolean;
      }) => ReturnType;
    };
  }
}

import { formatCaseLabel } from '@/lib/referenceLabels';
import { getCaseDisplayEntry, subscribeCaseDisplay } from '@/lib/caseDisplay';


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
      includeNumber: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-include-number') !== 'false',
        renderHTML: (attributes) => ({
          'data-include-number': attributes.includeNumber === false ? 'false' : 'true',
        }),
      },
      includeAbbreviation: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-include-abbreviation') !== 'false',
        renderHTML: (attributes) => ({
          'data-include-abbreviation': attributes.includeAbbreviation === false ? 'false' : 'true',
        }),
      },
    };
  },


  parseHTML() {
    return [
      {
        tag: 'span[data-case-reference]',
        priority: 60,
      },
      {
        tag: 'span[data-case-id]:not([data-task-id]):not([data-task-reference]):not([data-deliverable-id]):not([data-deliverable-reference]):not([data-milestone-id]):not([data-milestone-reference]):not([data-inline-reference]):not([data-ref-type])',
        priority: 60,
        getAttrs: (el) => ((el as HTMLElement).hasAttribute('data-case-reference') ? false : {}),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const caseNumber = node.attrs.caseNumber;
    const caseShortName = node.attrs.caseShortName;
    const caseType = node.attrs.caseType;
    const caseColor = node.attrs.caseColor || '#000000';
    const includeNumber = node.attrs.includeNumber !== false;
    const includeAbbreviation = node.attrs.includeAbbreviation !== false;
    const label = formatCaseLabel(
      { number: caseNumber, case_type: caseType, short_name: caseShortName },
      { includeNumber, includeAbbreviation },
    );


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
          border: 1.5px solid ${caseColor};
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
            `color: ${caseColor}; font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: 700; font-style: normal; line-height: 1;`,
        },
        label,
      ],
    ];
  },


  /**
   * On screen the badge is drawn from LIVE case data when it is available, so
   * a badge inserted before the case type's number/abbreviation switches were
   * changed still shows the current form — matching the read-only mirrors and
   * the PDF. Nothing is written back: `renderHTML` above still serialises the
   * stored attributes, so saved content is untouched. When no live entry
   * exists (map not yet loaded, or a case whose type row did not resolve) the
   * stored attributes are used exactly as before, so a badge is never blank.
   */
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      const inner = document.createElement('span');
      dom.appendChild(inner);

      const render = () => {
        const a = node.attrs as Record<string, any>;
        const live = a.caseId ? getCaseDisplayEntry(a.caseId) : undefined;

        const caseNumber = live ? live.number : a.caseNumber;
        const caseShortName = live ? live.shortName : a.caseShortName;
        const caseType = live ? live.caseType : a.caseType;
        const caseColor = (live ? live.color : a.caseColor) || '#000000';
        const includeNumber = live ? live.includeNumber : a.includeNumber !== false;
        const includeAbbreviation = live
          ? live.includeAbbreviation
          : a.includeAbbreviation !== false;

        const label = formatCaseLabel(
          { number: caseNumber, case_type: caseType, short_name: caseShortName },
          { includeNumber, includeAbbreviation },
        );

        dom.setAttribute('data-case-reference', '');
        dom.setAttribute('class', 'case-reference-badge');
        dom.setAttribute('contenteditable', 'false');
        if (a.caseId) dom.setAttribute('data-case-id', a.caseId);
        if (a.caseNumber !== null && a.caseNumber !== undefined) {
          dom.setAttribute('data-case-number', String(a.caseNumber));
        }
        if (a.caseShortName) dom.setAttribute('data-case-short-name', a.caseShortName);
        dom.setAttribute('data-case-type', a.caseType || 'case_study');
        dom.setAttribute('data-case-color', a.caseColor || '#000000');
        dom.setAttribute('data-include-number', a.includeNumber === false ? 'false' : 'true');
        dom.setAttribute(
          'data-include-abbreviation',
          a.includeAbbreviation === false ? 'false' : 'true',
        );
        dom.setAttribute(
          'style',
          `display: inline-flex; align-items: center; background-color: #ffffff; border: 1.5px solid ${caseColor}; padding: 0 0.4rem; border-radius: 9999px; white-space: nowrap; vertical-align: baseline; cursor: pointer;`,
        );
        inner.setAttribute(
          'style',
          `color: ${caseColor}; font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: 700; font-style: normal; line-height: 1;`,
        );
        inner.textContent = label;
      };

      render();
      const unsubscribe = subscribeCaseDisplay(render);

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'caseReference') return false;
          node = updatedNode;
          render();
          return true;
        },
        destroy() {
          unsubscribe();
        },
        ignoreMutation() {
          return true;
        },
      };
    };
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
