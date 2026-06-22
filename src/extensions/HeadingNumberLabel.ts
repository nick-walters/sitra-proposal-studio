import { Mark } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Build a DecorationSet of zero-width inline widgets placed immediately after
 * each headingNumberLabel-marked text run. View-only: never enters the saved
 * document and never round-trips through getHTML().
 */
function buildHeadingTailDecorations(doc: any, markType: any): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    if (!markType.isInSet(node.marks)) return;
    const labelTo = pos + node.nodeSize;
    decos.push(
      Decoration.widget(
        labelTo,
        () => {
          const span = document.createElement('span');
          span.setAttribute('data-heading-number-tail', '');
          span.setAttribute('aria-hidden', 'true');
          span.textContent = '\u200B';
          return span;
        },
        { side: 1, key: `heading-number-tail@${labelTo}`, ignoreSelection: false } as any,
      ),
    );
  });
  return DecorationSet.create(doc, decos);
}


/**
 * A TipTap mark that wraps the numbered prefix of H3 headings
 * (e.g. "1.1.1. ") and makes them non-editable.
 *
 * Uses the same cursor-clamping plugin approach as CaptionLabel.
 */
export const HeadingNumberLabel = Mark.create({
  name: 'headingNumberLabel',

  excludes: '',

  inclusive: false,

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
        key: new PluginKey('headingNumberTrailingCaretWidget'),
        // View-only decoration: provides a tiny zero-width DOM caret target
        // immediately after each headingNumberLabel-marked text run, so the
        // browser can host a DOM caret at that PM position. Never inserted
        // into the document; never serialized into getHTML(). Rebuilt on
        // docChanged only (same pattern as ParenBadgeGlue).
        state: {
          init(_, { doc }) {
            return buildHeadingTailDecorations(doc, markType);
          },
          apply(tr, old) {
            if (!tr.docChanged) return old;
            return buildHeadingTailDecorations(tr.doc, markType);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),

      new Plugin({
        key: new PluginKey('headingNumberGuard'),

        filterTransaction(tr, state) {
          if (!tr.docChanged) return true;

          let dominated = false;
          tr.steps.forEach((step) => {
            const stepMap = step.getMap();
            stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
              if (newEnd > newStart && oldStart < state.doc.content.size) {
                // Determine if the edit position is STRICTLY INSIDE a
                // headingNumberLabel run, versus exactly at its trailing
                // boundary (where typed heading text should be allowed).
                //
                // A position is interior to the marked run when BOTH:
                //   - the node immediately before (nodeBefore) carries the mark
                //   - AND the node at the position (nodeAfter) also carries
                //     the mark (i.e. we're between two marked characters, or
                //     equivalently, replacing characters within the marked text)
                //
                // At the trailing boundary (labelTo), nodeBefore is marked but
                // nodeAfter is either unmarked text, a different node, or null
                // (end of heading) — that is a pure insertion AFTER the label
                // and must be allowed.
                //
                // Pure insertions (oldStart === oldEnd) are only blocked when
                // strictly interior. Replacements that overlap the marked run
                // (oldEnd > oldStart and the start sits inside the run) are
                // also blocked.
                const $pos = state.doc.resolve(Math.min(oldStart, state.doc.content.size));
                const nodeBefore = $pos.nodeBefore;
                const nodeAfter = $pos.nodeAfter;
                const beforeMarked = !!nodeBefore && nodeBefore.isText && markType.isInSet(nodeBefore.marks);
                const afterMarked = !!nodeAfter && nodeAfter.isText && !!markType.isInSet(nodeAfter.marks);

                if (oldEnd > oldStart) {
                  // Replacement/deletion that starts inside the marked text.
                  if (beforeMarked && afterMarked) {
                    dominated = true;
                  } else if (afterMarked) {
                    // Range begins exactly on the first character of the label.
                    dominated = true;
                  }
                } else {
                  // Pure insertion: only block when strictly interior.
                  if (beforeMarked && afterMarked) {
                    dominated = true;
                  }
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
