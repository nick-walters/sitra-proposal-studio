import { Node, Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
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
      insertB12MirrorSlot: (attributes: {
        slotKey: B12SlotKey;
        runIndex?: number | null;
      }) => ReturnType;
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
      /**
       * Index of the methodology run this slot renders (0-based). Only slots
       * with slotKey 'methodologies' carry it; all others leave it null.
       */
      runIndex: {
        default: null as number | null,
        parseHTML: (el) => {
          const raw = el.getAttribute('data-b12-run-index');
          if (raw == null || raw === '') return null;
          const n = parseInt(raw, 10);
          return Number.isFinite(n) ? n : null;
        },
        renderHTML: (attrs) =>
          attrs.runIndex === null || attrs.runIndex === undefined
            ? {}
            : { 'data-b12-run-index': String(attrs.runIndex) },
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
            attrs: {
              slotKey: attributes.slotKey,
              runIndex: attributes.runIndex ?? null,
            },
          }),
    };
  },

  addProseMirrorPlugins() {
    const nodeName = this.name;

    /**
     * Identity of a slot for guard purposes: methodologies slots are compared
     * by the (slotKey, runIndex) PAIR so that adding/removing a run is seen
     * correctly, while other slots are compared by slotKey alone.
     */
    const slotIdentity = (node: PMNode): string => {
      const key = String(node.attrs.slotKey ?? '');
      if (key === 'methodologies') {
        return `${key}#${node.attrs.runIndex ?? ''}`;
      }
      return key;
    };

    const collectSlotKeys = (doc: PMNode): Map<string, number> => {
      const counts = new Map<string, number>();
      doc.descendants((node) => {
        if (node.type.name === nodeName) {
          const id = slotIdentity(node);
          counts.set(id, (counts.get(id) ?? 0) + 1);
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

  addProseMirrorPlugins() {
    /** Map of subsection key -> concatenated text content of managed headings. */
    const collectManagedHeadings = (doc: PMNode): Map<string, string> => {
      const map = new Map<string, string>();
      doc.descendants((node) => {
        if (node.type.name === 'heading') {
          const key = node.attrs?.['data-b12-subsection-key'];
          if (typeof key === 'string' && key.length > 0) {
            // Multiple headings sharing a key are concatenated, so removing one
            // of them still registers as a change.
            map.set(key, (map.get(key) ?? '') + '\u0000' + node.textContent);
          }
          return false;
        }
        return true;
      });
      return map;
    };

    return [
      new Plugin({
        key: new PluginKey('b12ManagedHeadingGuard'),
        props: {
          decorations: (state) => {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'heading') {
                const key = node.attrs?.['data-b12-subsection-key'];
                if (typeof key === 'string' && key.length > 0) {
                  decos.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      contenteditable: 'false',
                      class: 'b12-managed-heading',
                    }),
                  );
                }
                return false;
              }
              return true;
            });
            return decos.length ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
          },
        },
        filterTransaction: (tr) => {
          if (!tr.docChanged) return true;
          if (tr.getMeta('b12MirrorManaged')) return true;

          const before = collectManagedHeadings(tr.before);
          if (before.size === 0) return true;
          const after = collectManagedHeadings(tr.doc);

          for (const [key, text] of before) {
            // Covers edits, deletions and merges: a removed heading yields
            // undefined, a merged/typed-over one yields different text.
            if (after.get(key) !== text) return false;
          }
          return true;
        },
      }),
    ];
  },
});


export default B12MirrorSlotNode;
