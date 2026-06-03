import { Mark } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

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

        appendTransaction(_transactions, _oldState, _newState) {
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
