import { Node, mergeAttributes } from '@tiptap/core';
import { formatParticipantLabel } from '@/lib/referenceLabels';


export interface ParticipantReferenceOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    participantReference: {
      /**
       * Insert a Participant reference inline atom node.
       * Signature preserved from the legacy ParticipantReferenceMark so
       * existing call sites (DocumentEditor cross-reference dropdown)
       * work unchanged.
       */
      insertParticipantReference: (attributes: {
        participantNumber: number;
        shortName: string;
        participantId: string;
      }) => ReturnType;
    };
  }
}

/**
 * ParticipantReferenceNode (Stage 2 migration)
 *
 * Inline atomic node replacing the legacy ParticipantReferenceMark. See
 * CaseReferenceNode/WPReferenceNode for the full migration rationale —
 * indivisible atom, attrs-driven label, no relabel guard required.
 *
 * Backward compatibility: parseHTML matches the SAME
 * `span[data-participant-reference]` shape the legacy mark produced, so
 * existing saved documents load straight into this node with no
 * migration.
 *
 * toDOM follows the WP fix: outer span carries only pill-shape styles;
 * all text-affecting styles live on the inner label-wrapper span.
 */
export const ParticipantReferenceNode = Node.create<ParticipantReferenceOptions>({
  name: 'participantReference',

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
      participantNumber: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-participant-number');
          if (raw === null || raw === '') return null;
          const n = Number(raw);
          return Number.isFinite(n) ? n : raw;
        },
        renderHTML: (attributes) => {
          if (attributes.participantNumber === null || attributes.participantNumber === undefined) {
            return {};
          }
          return { 'data-participant-number': attributes.participantNumber };
        },
      },
      shortName: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-participant-short-name'),
        renderHTML: (attributes) => {
          if (!attributes.shortName) return {};
          return { 'data-participant-short-name': attributes.shortName };
        },
      },
      participantId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-participant-id'),
        renderHTML: (attributes) => {
          if (!attributes.participantId) return {};
          return { 'data-participant-id': attributes.participantId };
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

  renderHTML({ node, HTMLAttributes }) {
    const label = formatParticipantLabel({ organisation_short_name: node.attrs.shortName });

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
          border: 1.5px solid #000000;
          padding: 0px 5px;
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
            "color: #ffffff; font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: 700; font-style: normal; line-height: 1;",
        },
        label,
      ],
    ];
  },

  addCommands() {
    return {
      insertParticipantReference:
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

export default ParticipantReferenceNode;
