import { Node, Extension, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { B12MirrorSlotNodeView } from '@/components/B12MirrorSlotNodeView';

/**
 * b12MirrorSlot — block atom node holding a B1.2 Methodologies mirror slot.
 *
 * Persisted DOM shape:
 *   <div data-b12-mirror-slot data-b12-slot-key="concepts|methodologies|…"></div>
 *
 * Keys are methodology_subsections.key values. Typed as a plain string
 * (not a closed union) because coordinators may add subsections later.
 */

export type B12SlotKey = string;

/** Keys shipped by default (informational — the node accepts any string). */
export const DEFAULT_B12_SLOT_KEYS = [
  'concepts',
  'methodologies',
  'linked_activities',
  'interdisciplinarity',
  'ssh',
  'gender',
  'open_science',
] as const;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    b12MirrorSlot: {
      insertB12MirrorSlot: (attributes: { slotKey: B12SlotKey }) => ReturnType;
    };
  }
}

export const B12MirrorSlotNode = Node.create({
  name: 'b12MirrorSlot',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  defining: true,

  addAttributes() {
    return {
      slotKey: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-b12-slot-key'),
        renderHTML: (attrs) =>
          attrs.slotKey ? { 'data-b12-slot-key': attrs.slotKey } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-b12-mirror-slot]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-b12-mirror-slot': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(B12MirrorSlotNodeView);
  },

  addCommands() {
    return {
      insertB12MirrorSlot:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { slotKey: attributes.slotKey },
          }),
    };
  },
});

/**
 * Adds data-b12-subsection-key to headings so the B1.2 reconciler can bind a
 * managed heading to its methodology subsection.
 */
export const B12HeadingSubsectionKey = Extension.create({
  name: 'b12HeadingSubsectionKey',
  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          'data-b12-subsection-key': {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute('data-b12-subsection-key'),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes['data-b12-subsection-key']
                ? { 'data-b12-subsection-key': attributes['data-b12-subsection-key'] }
                : {},
          },
        },
      },
    ];
  },
});

export default B12MirrorSlotNode;
