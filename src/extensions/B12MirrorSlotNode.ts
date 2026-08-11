import { Node, Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
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
  selectable: false,
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

  addProseMirrorPlugins() {
    const nodeName = this.name;

    const collectSlotKeys = (doc: PMNode): Map<string, number> => {
      const counts = new Map<string, number>();
      doc.descendants((node) => {
        if (node.type.name === nodeName) {
          const key = String(node.attrs.slotKey ?? '');
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return false;
        }
        return true;
      });
      return counts;
    };

    return [
      new Plugin({
        key: new PluginKey('b12MirrorSlotGuard'),
        filterTransaction: (tr) => {
          // Only doc-changing transactions can remove a slot.
          if (!tr.docChanged) return true;
          // Reconciler-owned transactions are always allowed.
          if (tr.getMeta('b12MirrorManaged')) return true;

          const before = collectSlotKeys(tr.before);
          if (before.size === 0) return true;
          const after = collectSlotKeys(tr.doc);

          for (const [key, count] of before) {
            if ((after.get(key) ?? 0) < count) return false; // silent reject
          }
          return true;
        },
      }),
    ];
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
