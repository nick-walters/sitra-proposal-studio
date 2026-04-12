import { Mark } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

/**
 * A TipTap mark that wraps caption labels (e.g. "Table 1.2.a. ")
 * and renders them as non-editable, non-selectable spans.
 *
 * Uses a ProseMirror plugin to enforce cursor clamping — the cursor
 * is pushed to the first position AFTER the mark whenever it lands inside.
 */
export const CaptionLabel = Mark.create({
  name: 'captionLabel',

  excludes: '',

  parseHTML() {
    return [{ tag: 'span[data-caption-label]' }];
  },

  renderHTML() {
    return [
      'span',
      {
        'data-caption-label': '',
        contenteditable: 'false',
        style: 'user-select: none; font-weight: bold; font-style: italic;',
      },
      0,
    ];
  },

  addProseMirrorPlugins() {
    const markType = this.type;

    return [
      new Plugin({
        key: new PluginKey('captionLabelGuard'),

        // Prevent any text input at positions covered by this mark
        filterTransaction(tr, state) {
          // Allow non-doc-changing transactions
          if (!tr.docChanged) return true;

          // Check each step — if it inserts text at a position inside a captionLabel mark, block it
          let dominated = false;
          tr.steps.forEach((step, i) => {
            const stepMap = step.getMap();
            stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
              // If this step added content, check if the insertion point had captionLabel
              if (newEnd > newStart) {
                // Resolve in the old doc
                if (oldStart < state.doc.content.size) {
                  const $pos = state.doc.resolve(Math.min(oldStart, state.doc.content.size - 1));
                  const marks = $pos.marks();
                  if (marks.some(m => m.type === markType)) {
                    dominated = true;
                  }
                  // Also check the position just before (for typing at mark boundary)
                  if (oldStart > 0) {
                    const $before = state.doc.resolve(oldStart);
                    // Check marks at oldStart - if cursor is right after the last char of the mark
                    const nodeAfter = $before.nodeAfter;
                    if (!nodeAfter) {
                      const marksAt = $before.marks();
                      if (marksAt.some(m => m.type === markType)) {
                        dominated = true;
                      }
                    }
                  }
                }
              }
            });
          });

          // Allow renumbering and non-history (programmatic) edits through
          if (dominated && !tr.getMeta('addToHistory') === false && !tr.getMeta('blockReorder')) {
            // Only block user-initiated typing, not programmatic changes
          }
          // Actually, we should only block if the transaction is a plain user input
          // Programmatic updates (renumbering) set addToHistory: false or blockReorder
          if (dominated) {
            const isProgram = tr.getMeta('addToHistory') === false || tr.getMeta('blockReorder');
            if (!isProgram) return false;
          }

          return true;
        },

        appendTransaction(transactions, oldState, newState) {
          // Clamp cursor: if the selection is inside a captionLabel mark, push it after
          const { selection } = newState;
          if (!(selection instanceof TextSelection)) return null;
          if (!selection.empty) return null;

          const $pos = selection.$from;
          const marks = $pos.marks();
          const inside = marks.some(m => m.type === markType);

          if (!inside) {
            // Also check: if cursor is between chars that both have captionLabel
            if ($pos.pos > 0) {
              const before = newState.doc.resolve($pos.pos - 1);
              const beforeMarks = before.marks ? before.marks() : [];
              // Not inside — do nothing
              if (!beforeMarks.some(m => m.type === markType)) return null;
              // Cursor is right after the mark — that's fine
              return null;
            }
            return null;
          }

          // Find the end of the captionLabel mark region in this text block
          const parent = $pos.parent;
          const parentStart = $pos.start();
          let endOfMark = parentStart;

          parent.forEach((child, offset) => {
            const childStart = parentStart + offset;
            const childEnd = childStart + child.nodeSize;
            if (child.marks.some((m: any) => m.type === markType)) {
              if (childEnd > endOfMark) endOfMark = childEnd;
            }
          });

          if (endOfMark > $pos.pos) {
            const tr = newState.tr.setSelection(
              TextSelection.create(newState.doc, endOfMark)
            );
            tr.setMeta('addToHistory', false);
            return tr;
          }

          return null;
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;

        const posBefore = $from.pos;
        if (posBefore <= 1) return false;

        const $prev = state.doc.resolve(posBefore - 1);
        const marks = $prev.marks();
        if (marks.some((m) => m.type.name === 'captionLabel')) {
          return true; // Block
        }

        return false;
      },
      Delete: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;

        // Check if char after cursor has captionLabel
        const posAfter = $from.pos;
        if (posAfter >= state.doc.content.size) return false;

        const $next = state.doc.resolve(posAfter);
        const nodeAfter = $next.nodeAfter;
        if (nodeAfter && nodeAfter.marks.some((m: any) => m.type.name === 'captionLabel')) {
          return true;
        }

        return false;
      },
    };
  },
});
