import { Node, mergeAttributes } from '@tiptap/core';
import { formatParticipantLabel } from '@/lib/referenceLabels';
import {
  getRefDisplayEntry,
  hasPublishedRefDisplay,
  subscribeRefDisplay,
} from '@/lib/refDisplay';
import { BROKEN_REF_STYLE, brokenRefText } from '@/extensions/InlineReferenceNode';



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
        priority: 60,
      },
      {
        tag: 'span[data-participant-id]:not([data-task-id]):not([data-task-reference]):not([data-deliverable-id]):not([data-deliverable-reference]):not([data-milestone-id]):not([data-milestone-reference]):not([data-inline-reference]):not([data-ref-type])',
        priority: 60,
        getAttrs: (el) =>
          ((el as HTMLElement).hasAttribute('data-participant-reference') ? false : {}),
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

  /**
   * On screen the badge shows the participant's CURRENT short name, so a
   * corrected or renamed organisation updates everywhere without touching the
   * document. When the participant is not in the live map (not yet loaded, or
   * removed from the consortium) the stored short name is used, so the badge
   * is never blank.
   */
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      const inner = document.createElement('span');
      dom.appendChild(inner);

      let lastKey: string | null = null;

      const render = () => {
        const a = node.attrs as Record<string, any>;
        const live = getRefDisplayEntry('participant', a.participantId);
        const shortName = live ? live.shortName : a.shortName;
        const label = formatParticipantLabel({ organisation_short_name: shortName });
        // The number is live data: after a resequence the badge must show the
        // participant's current position, not the one baked in at insertion.
        // The stored attribute is only a fallback for a participant the live
        // map does not know about, and it remains the carrier of whether this
        // particular tag has a number at all.
        const liveNumber =
          live && live.number !== null && live.number !== undefined
            ? live.number
            : a.participantNumber;

        // Broken only once participant data has arrived, the tag names a
        // participant, and that participant is absent from the live map.
        const broken =
          !!a.participantId && !live && hasPublishedRefDisplay('participant');

        const key = `${label}|${broken ? 'broken' : ''}`;
        if (key === lastKey) return;
        lastKey = key;

        dom.setAttribute('data-participant-reference', '');
        dom.setAttribute('class', 'participant-reference-badge');
        dom.setAttribute('contenteditable', 'false');
        if (a.participantId) dom.setAttribute('data-participant-id', a.participantId);
        if (a.participantNumber !== null && a.participantNumber !== undefined) {
          dom.setAttribute('data-participant-number', String(a.participantNumber));
        }
        if (a.shortName) dom.setAttribute('data-participant-short-name', a.shortName);

        if (broken) {
          const stored = formatParticipantLabel({ organisation_short_name: a.shortName });
          dom.setAttribute('class', 'inline-ref-broken inline-ref-broken-participant');
          dom.setAttribute('style', BROKEN_REF_STYLE);
          inner.setAttribute('style', BROKEN_REF_STYLE);
          inner.textContent = brokenRefText(stored, 'participant');
          return;
        }


        dom.setAttribute(
          'style',
          'display: inline-flex; align-items: center; background-color: #000000; border: 1.5px solid #000000; padding: 0px 5px; border-radius: 9999px; white-space: nowrap; vertical-align: baseline; cursor: pointer;',
        );
        inner.setAttribute(
          'style',
          "color: #ffffff; font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: 700; font-style: normal; line-height: 1;",
        );
        inner.textContent = label;
      };

      render();
      const unsubscribe = subscribeRefDisplay('participant', render);

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'participantReference') return false;
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
