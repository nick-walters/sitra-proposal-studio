import { Mark } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * A TipTap mark that wraps the numbered prefix of H3 headings
 * (e.g. "1.1.1. ") and makes them non-editable.
 *
 * Uses the same cursor-clamping plugin approach as CaptionLabel.
 */
export const HeadingNumberLabel = Mark.create({
  name: 'headingNumberLabel',

  excludes: '',

  parseHTML() {
    return [{ tag: 'span[data-heading-number]' }];
  },

  renderHTML() {
    return [
      'span',
      {
        'data-heading-number': '',
        contenteditable: 'false',
        style: 'user-select: none;',
      },
      0,
    ];
  },

  addProseMirrorPlugins() {
    const markType = this.type;

    return [
      new Plugin({
        key: new PluginKey('headingNumberGuard'),

        filterTransaction(tr, state) {
          if (!tr.docChanged) return true;

          let dominated = false;
          tr.steps.forEach((step) => {
            const stepMap = step.getMap();
            stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
              if (newEnd > newStart && oldStart < state.doc.content.size) {
                const $pos = state.doc.resolve(Math.min(oldStart, state.doc.content.size - 1));
                const marks = $pos.marks();
                if (marks.some(m => m.type === markType)) {
                  dominated = true;
                }
              }
            });
          });

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
          const markTypeRef = schema.marks.headingNumberLabel;
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

        if ($from.pos <= 1) return false;

        const $prev = state.doc.resolve($from.pos - 1);
        if ($prev.marks().some((m) => m.type.name === 'headingNumberLabel')) {
          return true;
        }

        return false;
      },
      Delete: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;

        const $next = state.doc.resolve($from.pos);
        const nodeAfter = $next.nodeAfter;
        if (nodeAfter && nodeAfter.marks.some((m: any) => m.type.name === 'headingNumberLabel')) {
          return true;
        }

        return false;
      },
    };
  },
});
