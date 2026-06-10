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

        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged)) return null;

          const changedRanges: { from: number; to: number }[] = [];
          transactions.forEach(tr => {
            tr.steps.forEach(step => {
              const map = step.getMap();
              map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                changedRanges.push({ from: newStart, to: newEnd });
              });
            });
          });

          if (changedRanges.length === 0) return null;

          const { doc, schema, selection } = newState;
          const markTypeRef = schema.marks.captionLabel;
          if (!markTypeRef) return null;

          let needsClamp = false;
          let labelFrom = -1;
          let labelTo = -1;

          for (const range of changedRanges) {
            const from = Math.max(0, range.from - 5);
            const to = Math.min(doc.content.size, range.to + 5);

            doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText) return;
              const mark = markTypeRef.isInSet(node.marks);
              if (mark) {
                needsClamp = true;
                if (labelFrom === -1 || pos < labelFrom) labelFrom = pos;
                if (pos + node.nodeSize > labelTo) labelTo = pos + node.nodeSize;
              }
            });

            if (needsClamp) break;
          }

          if (!needsClamp) return null;

          const cursorPos = selection.$from.pos;
          if (cursorPos < labelFrom || cursorPos > labelTo) return null;

          const tr = newState.tr;
          tr.setSelection(TextSelection.create(doc, labelTo));
          tr.setMeta('addToHistory', false);
          return tr;
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
