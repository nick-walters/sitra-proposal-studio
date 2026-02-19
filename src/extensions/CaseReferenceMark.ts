import { Mark, mergeAttributes } from '@tiptap/core';
import { handleRefMarkDeletion } from './deleteRefMarkHelper';

export interface CaseReferenceOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    caseReference: {
      /**
       * Set a Case reference mark
       */
      setCaseReference: (attributes: {
        caseNumber: number;
        caseShortName: string;
        caseColor: string;
        caseId: string;
        caseType: string;
      }) => ReturnType;
      /**
       * Toggle a Case reference mark
       */
      toggleCaseReference: (attributes: {
        caseNumber: number;
        caseShortName: string;
        caseColor: string;
        caseId: string;
        caseType: string;
      }) => ReturnType;
      /**
       * Unset a Case reference mark
       */
      unsetCaseReference: () => ReturnType;
      /**
       * Insert a Case reference with content
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

// Get display prefix based on case type
function getCasePrefix(caseType: string): string {
  switch (caseType) {
    case 'case_study': return 'CS';
    case 'use_case': return 'UC';
    case 'living_lab': return 'LL';
    case 'pilot': return 'P';
    case 'demonstration': return 'D';
    default: return 'C';
  }
}

export const CaseReferenceMark = Mark.create<CaseReferenceOptions>({
  name: 'caseReference',

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
      caseNumber: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-case-number'),
        renderHTML: (attributes) => {
          if (!attributes.caseNumber) {
            return {};
          }
          return {
            'data-case-number': attributes.caseNumber,
          };
        },
      },
      caseShortName: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-case-short-name'),
        renderHTML: (attributes) => {
          if (!attributes.caseShortName) {
            return {};
          }
          return {
            'data-case-short-name': attributes.caseShortName,
          };
        },
      },
      caseColor: {
        default: '#7C3AED',
        parseHTML: (element) => element.getAttribute('data-case-color'),
        renderHTML: (attributes) => {
          return {
            'data-case-color': attributes.caseColor,
          };
        },
      },
      caseId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-case-id'),
        renderHTML: (attributes) => {
          if (!attributes.caseId) {
            return {};
          }
          return {
            'data-case-id': attributes.caseId,
          };
        },
      },
      caseType: {
        default: 'case_study',
        parseHTML: (element) => element.getAttribute('data-case-type'),
        renderHTML: (attributes) => {
          return {
            'data-case-type': attributes.caseType,
          };
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

  renderHTML({ HTMLAttributes }) {
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
          color: #000000;
          border: 1.5px solid #000000;
          padding: 0 0.4rem;
          border-radius: 9999px;
          font-family: 'Times New Roman', Times, serif;
          font-size: 11pt;
          font-weight: 700;
          font-style: normal;
          line-height: 1;
          white-space: nowrap;
          vertical-align: baseline;
          cursor: pointer;
        `,
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

  addCommands() {
    return {
      setCaseReference:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      toggleCaseReference:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      unsetCaseReference:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
      insertCaseReference:
        (attributes) =>
        ({ chain }) => {
          const prefix = getCasePrefix(attributes.caseType);
          const label = `${prefix}${attributes.caseNumber}`;
          return chain()
            .insertContent({
              type: 'text',
              text: label,
              marks: [
                {
                  type: 'caseReference',
                  attrs: attributes,
                },
              ],
            })
            .run();
        },
    };
  },
});

export default CaseReferenceMark;
