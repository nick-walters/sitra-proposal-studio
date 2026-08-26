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

        props: {
          /**
           * Typing at the very end of the label — the only caret position an
           * EMPTY caption has — must be allowed, and the typed text must NOT
           * inherit the label mark (otherwise it would become part of the
           * non-editable label and be eaten by renumbering). The insertion is
           * therefore performed here with the label mark stripped.
           */
          handleTextInput(view, from, to, text) {
            const { state } = view;
            const $from = state.doc.resolve(from);
            const marks = $from.marks();
            if (!marks.some((m) => m.type === markType)) return false;
            // Strictly inside the label (marked text still follows) stays blocked.
            const after = $from.nodeAfter;
            if (after?.isText && after.marks.some((m) => m.type === markType)) return true;

            const kept = marks.filter((m) => m.type !== markType);
            const tr = state.tr.replaceWith(from, to, state.schema.text(text, kept));
            tr.setStoredMarks(kept);
            view.dispatch(tr);
            return true;
          },

          /**
           * A click anywhere on the label — including the empty caption, whose
           * whole visible content is the non-editable label plus the grey
           * placeholder — drops the caret at the first editable position, just
           * after the label, instead of leaving no selection at all.
           */
          handleClick(view, pos) {
            const { state } = view;
            const $pos = state.doc.resolve(pos);
            if (!$pos.parent.isTextblock) return false;
            let len = 0;
            let stop = false;
            $pos.parent.forEach((child) => {
              if (stop) return;
              if (child.isText && child.marks.some((m) => m.type === markType)) {
                len += child.nodeSize;
              } else {
                stop = true;
              }
            });
            if (!len) return false;
            const end = $pos.start() + len;
            if (pos >= end) return false;
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, end)));
            return true;
          },
        },


        // Prevent any text input at positions covered by this mark
        filterTransaction(tr, state) {
          // Allow non-doc-changing transactions
          if (!tr.docChanged) return true;

          // Block only insertions STRICTLY INSIDE the label run: a position
          // whose following text still carries the mark. The boundary right
          // after the label is the caption's editable caret position and must
          // stay writable, empty caption or not.
          let dominated = false;
          tr.steps.forEach((step) => {
            const stepMap = step.getMap();
            stepMap.forEach((oldStart, _oldEnd, newStart, newEnd) => {
              if (newEnd <= newStart) return;
              if (oldStart >= state.doc.content.size) return;
              const $pos = state.doc.resolve(oldStart);
              const after = $pos.nodeAfter;
              if (after?.isText && after.marks.some((m) => m.type === markType)) {
                dominated = true;
              }
            });
          });

          if (dominated) {
            // Programmatic updates (renumbering) set addToHistory: false or blockReorder
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
