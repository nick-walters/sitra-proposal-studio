import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

/**
 * BadgeTrailingCaret
 *
 * Fixes a browser-level bug where the caret cannot be reliably placed at the
 * trailing edge of an inline atomic `contenteditable=false` reference badge.
 * When the caret sits right after such a badge — especially at the end of a
 * paragraph or directly before another badge — Chromium has no editable DOM
 * text node to host the caret, so typed letters never reach the editor and
 * Space scrolls the page.
 *
 * Strategy (keydown-insert, view-only):
 *
 * - Listen via `props.handleKeyDown` on the editor.
 * - When the ProseMirror selection is collapsed and the node IMMEDIATELY
 *   before the cursor carries any of our badge marks, AND the node after
 *   does NOT continue the same badge run, we are at the trailing edge of a
 *   badge.
 * - For a printable character or Space, we intercept and explicitly insert
 *   the character as a plain, UNMARKED text node at the model position,
 *   then move the selection past it. This bypasses the broken DOM caret.
 *
 * Notes:
 *
 * - This plugin NEVER modifies marks, never touches the saved document
 *   shape, and adds NO appendTransaction. It only inserts the exact
 *   character the user typed, as plain text, at a valid PM position.
 * - It does NOT change any reference mark's `inclusive` setting (still
 *   false). The explicit `schema.text(ch)` call carries no marks, so typed
 *   text after a badge will never inherit the badge mark and the
 *   "split-badge" family of bugs cannot regress through this code path.
 * - The plugin is view-level only; getHTML() / saved content is unaffected
 *   because we don't add decorations or document mutations beyond the user's
 *   own keystroke.
 * - Does not interfere with ParenBadgeGlue (which only adds inline
 *   decorations) or with referenceClickSelect (which only runs on click).
 */

const BADGE_MARK_NAMES = [
  'caseReference',
  'participantReference',
  'inlineReference',
  'figureTableReference',
  'headingNumberLabel',
];

// Inline atom node names treated the same way at the trailing edge.
// wpReference migrated from mark to inline atom NODE in Stage 1 pilot.
const BADGE_ATOM_NODE_NAMES = new Set([
  'wpReference',
]);

export const BadgeTrailingCaret = Extension.create({
  name: 'badgeTrailingCaret',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('badgeTrailingCaret'),
        props: {
          handleKeyDown(view, event) {
            // Ignore modifier combos (shortcuts must keep working).
            if (event.ctrlKey || event.metaKey || event.altKey) return false;

            const isSpace = event.key === ' ' || event.code === 'Space';
            // event.key length 1 covers printable ASCII + most Unicode chars
            // produced by keyboard layouts. IME composition is not key.length===1.
            const isPrintable = event.key.length === 1 && !isSpace;
            if (!isPrintable && !isSpace) return false;

            const { state } = view;
            const { selection, schema } = state;
            if (!selection.empty) return false;

            const markTypes = BADGE_MARK_NAMES
              .map((n) => schema.marks[n])
              .filter(Boolean);
            if (markTypes.length === 0) return false;

            const $from = selection.$from;
            const nodeBefore = $from.nodeBefore;
            if (!nodeBefore) return false;

            // Trailing-edge detection works for either:
            //  (a) a text node carrying one of the remaining badge marks, or
            //  (b) an inline atom badge node (wpReference, post-Stage-1).
            let trailingBadge:
              | { kind: 'mark'; markType: any }
              | { kind: 'atom'; nodeType: any }
              | null = null;

            if (nodeBefore.isText) {
              const badgeMark = nodeBefore.marks.find((m) =>
                markTypes.includes(m.type)
              );
              if (badgeMark) {
                trailingBadge = { kind: 'mark', markType: badgeMark.type };
              }
            } else if (nodeBefore.isInline && BADGE_ATOM_NODE_NAMES.has(nodeBefore.type.name)) {
              trailingBadge = { kind: 'atom', nodeType: nodeBefore.type };
            }

            if (!trailingBadge) return false;

            // If the node after continues the same badge run, the caret is
            // logically INSIDE the badge — leave it to normal handling.
            // (Atom badges can't have content "after" that continues them, so
            // this only applies to the mark case.)
            const nodeAfter = $from.nodeAfter;
            if (
              trailingBadge.kind === 'mark' &&
              nodeAfter &&
              nodeAfter.isText &&
              nodeAfter.marks.some((m) => m.type === trailingBadge!.markType)
            ) {
              return false;
            }

            const ch = isSpace ? ' ' : event.key;

            try {
              const tr = state.tr.insert($from.pos, schema.text(ch));
              tr.setSelection(
                TextSelection.create(tr.doc, $from.pos + ch.length)
              );
              tr.scrollIntoView();
              view.dispatch(tr);
            } catch {
              return false;
            }

            event.preventDefault();
            return true;

          },
        },
      }),
    ];
  },
});

export default BadgeTrailingCaret;
