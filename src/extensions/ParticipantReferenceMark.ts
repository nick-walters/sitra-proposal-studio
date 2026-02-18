import { Mark, mergeAttributes } from '@tiptap/core';
import { handleRefMarkDeletion } from './deleteRefMarkHelper';

export interface ParticipantReferenceOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    participantReference: {
      /**
       * Set a participant reference mark
       */
      setParticipantReference: (attributes: {
        participantNumber: number;
        shortName: string;
        participantId: string;
      }) => ReturnType;
      /**
       * Toggle a participant reference mark
       */
      toggleParticipantReference: (attributes: {
        participantNumber: number;
        shortName: string;
        participantId: string;
      }) => ReturnType;
      /**
       * Unset a participant reference mark
       */
      unsetParticipantReference: () => ReturnType;
      /**
       * Insert a participant reference with content
       */
      insertParticipantReference: (attributes: {
        participantNumber: number;
        shortName: string;
        participantId: string;
      }) => ReturnType;
    };
  }
}

export const ParticipantReferenceMark = Mark.create<ParticipantReferenceOptions>({
  name: 'participantReference',

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
      participantNumber: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-participant-number'),
        renderHTML: (attributes) => {
          if (!attributes.participantNumber) {
            return {};
          }
          return {
            'data-participant-number': attributes.participantNumber,
          };
        },
      },
      shortName: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-participant-short-name'),
        renderHTML: (attributes) => {
          if (!attributes.shortName) {
            return {};
          }
          return {
            'data-participant-short-name': attributes.shortName,
          };
        },
      },
      participantId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-participant-id'),
        renderHTML: (attributes) => {
          if (!attributes.participantId) {
            return {};
          }
          return {
            'data-participant-id': attributes.participantId,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-participant-reference]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const shortName = HTMLAttributes['data-participant-short-name'];

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-participant-reference': '',
        'class': 'participant-reference-badge',
        'contenteditable': 'false',
      'style': `
          display: inline-flex;
          align-items: center;
          background-color: #000000;
          color: #ffffff;
          border: 1.5px solid #000000;
          padding: 0px 5px;
          border-radius: 9999px;
          font-family: 'Times New Roman', Times, serif;
          font-size: 11pt;
          font-weight: 700;
          font-style: italic;
          line-height: 1;
          white-space: nowrap;
          vertical-align: baseline;
          cursor: pointer;
        `,
      }),
      0, // Use 0 to render the actual text content, not duplicate it
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
      setParticipantReference:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      toggleParticipantReference:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      unsetParticipantReference:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
      insertParticipantReference:
        (attributes) =>
        ({ chain }) => {
          const label = attributes.shortName || 'Partner';
          return chain()
            .insertContent({
              type: 'text',
              text: label,
              marks: [
                {
                  type: 'participantReference',
                  attrs: attributes,
                },
              ],
            })
            .run();
        },
    };
  },
});

export default ParticipantReferenceMark;
