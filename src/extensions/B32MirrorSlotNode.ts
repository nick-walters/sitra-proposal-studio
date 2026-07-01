import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { B32MirrorSlotNodeView } from '@/components/B32MirrorSlotNodeView';

/**
 * b32MirrorSlot — block atom node holding a B3.2 mirror slot.
 *
 * Persisted DOM shape:
 *   <div data-b32-mirror-slot data-b32-slot-key="capacity|value-chain|international"></div>
 *
 * One node per slot key; the NodeView renders the read-only mirror body
 * (Stage 3a: dummy placeholder; Stage 3b: real mirrored content).
 */

export type B32SlotKey =
  | 'interdisciplinarity'
  | 'capacity'
  | 'infrastructure'
  | 'value-chain'
  | 'industrial'
  | 'international';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    b32MirrorSlot: {
      insertB32MirrorSlot: (attributes: { slotKey: B32SlotKey }) => ReturnType;
    };
  }
}

export const B32MirrorSlotNode = Node.create({
  name: 'b32MirrorSlot',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  defining: true,

  addAttributes() {
    return {
      slotKey: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-b32-slot-key'),
        renderHTML: (attrs) =>
          attrs.slotKey ? { 'data-b32-slot-key': attrs.slotKey } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-b32-mirror-slot]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-b32-mirror-slot': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(B32MirrorSlotNodeView);
  },

  addCommands() {
    return {
      insertB32MirrorSlot:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { slotKey: attributes.slotKey },
          }),
    };
  },
});

export default B32MirrorSlotNode;
