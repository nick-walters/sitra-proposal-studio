import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, Selection } from '@tiptap/pm/state';
import type { Mark, ResolvedPos } from '@tiptap/pm/model';

/**
 * BadgeArrowNav
 *
 * Arrow-key caret navigation across inline atomic badge runs
 * (contenteditable=false reference chips). Without help, Chromium can't
 * place the caret on the far side of such a run via Left/Right arrows —
 * the caret disappears at the boundary. This plugin detects that
 * adjacency and moves the collapsed selection past the entire badge run
 * in a single arrow press, landing on a valid editable caret position
 * via Selection.near.
 *
 * Selection-only: this extension NEVER modifies document content,
 * marks, or decorations. It only dispatches selection transactions.
 *
 * Cooperates with:
 *  - BadgeTrailingCaret: handles printable typing right after a badge.
 *    Arrow-nav only moves the caret; it never inserts text or selects
 *    the badge as a node.
 *  - referenceClickSelect: arrow keys don't fire on click.
 *  - ParenBadgeGlue: decoration-only, unaffected.
 */

const BADGE_MARK_NAMES = [
  'wpReference',
  'caseReference',
  'participantReference',
  'inlineReference',
  'figureTableReference',
  'headingNumberLabel',
];

function sameBadgeMark(a: Mark, b: Mark): boolean {
  if (a.type !== b.type) return false;
  // Same mark type AND same identifying attributes => same logical run.
  // ProseMirror's Mark.eq compares type + attrs.
  return a.eq(b);
}

/**
 * Walk forward from $pos, skipping over any contiguous run of text nodes
 * that all carry the given badge mark (eq). Returns the document position
 * immediately AFTER the last node in that run, within the same parent.
 */
function endOfBadgeRunForward($pos: ResolvedPos, badge: Mark): number {
  const parent = $pos.parent;
  const offsetInParent = $pos.parentOffset;
  let pos = $pos.pos;
  let scanned = 0;
  parent.forEach((child, offset) => {
    if (offset < offsetInParent) {
      scanned = offset + child.nodeSize;
      return;
    }
    if (offset < scanned) return;
    const hasBadge =
      child.isText && child.marks.some((m) => sameBadgeMark(m, badge));
    if (hasBadge) {
      pos = $pos.start() + offset + child.nodeSize;
      scanned = offset + child.nodeSize;
    }
  });
  // Simpler: iterate manually starting at $pos.
  return pos;
}

/**
 * Walk backward from $pos, skipping a contiguous run carrying the badge
 * mark, returning the position immediately BEFORE the first node in run.
 */
function startOfBadgeRunBackward($pos: ResolvedPos, badge: Mark): number {
  return $pos.pos; // placeholder; real logic below in plugin
}

export const BadgeArrowNav = Extension.create({
  name: 'badgeArrowNav',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('badgeArrowNav'),
        props: {
          handleKeyDown(view, event) {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
              return false;
            }
            // Let shift-extend, word/line jumps fall through to PM/browser.
            if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
              return false;
            }

            const { state } = view;
            const { selection, schema, doc } = state;
            if (!selection.empty) return false;

            const markTypes = BADGE_MARK_NAMES
              .map((n) => schema.marks[n])
              .filter(Boolean);
            if (markTypes.length === 0) return false;

            const $from = selection.$from;

            if (event.key === 'ArrowRight') {
              // Are we immediately BEFORE a badge run?
              const nodeAfter = $from.nodeAfter;
              if (!nodeAfter || !nodeAfter.isText) return false;
              const badge = nodeAfter.marks.find((m) =>
                markTypes.includes(m.type)
              );
              if (!badge) return false;

              // Skip the contiguous run of text nodes sharing this mark
              // within the same parent.
              const parent = $from.parent;
              const parentStart = $from.start();
              let offset = $from.parentOffset;
              while (offset < parent.content.size) {
                const child = parent.maybeChild(parent.childCount === 0 ? 0 : indexAt(parent, offset));
                if (!child) break;
                const childStart = startOfChild(parent, child);
                if (offset !== childStart) break; // shouldn't happen at boundary
                const hasBadge =
                  child.isText && child.marks.some((m) => sameBadgeMark(m, badge));
                if (!hasBadge) break;
                offset = childStart + child.nodeSize;
              }
              const targetPos = parentStart + offset;
              try {
                const tr = state.tr.setSelection(
                  Selection.near(doc.resolve(targetPos), 1)
                );
                tr.scrollIntoView();
                view.dispatch(tr);
              } catch {
                return false;
              }
              event.preventDefault();
              return true;
            }

            // ArrowLeft: are we immediately AFTER a badge run?
            const nodeBefore = $from.nodeBefore;
            if (!nodeBefore || !nodeBefore.isText) return false;
            const badge = nodeBefore.marks.find((m) =>
              markTypes.includes(m.type)
            );
            if (!badge) return false;

            const parent = $from.parent;
            const parentStart = $from.start();
            let offset = $from.parentOffset;
            while (offset > 0) {
              const idx = indexAt(parent, offset - 1);
              const child = parent.child(idx);
              const childStart = startOfChild(parent, child);
              const hasBadge =
                child.isText && child.marks.some((m) => sameBadgeMark(m, badge));
              if (!hasBadge) break;
              offset = childStart;
              if (offset === 0) break;
            }
            const targetPos = parentStart + offset;
            try {
              const tr = state.tr.setSelection(
                Selection.near(doc.resolve(targetPos), -1)
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

// --- helpers ---------------------------------------------------------------

/** Index of the child in `parent` that contains the given offset. */
function indexAt(parent: any, offset: number): number {
  let acc = 0;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const next = acc + child.nodeSize;
    if (offset < next) return i;
    acc = next;
  }
  return parent.childCount - 1;
}

/** Offset (within parent) at which `child` begins. */
function startOfChild(parent: any, child: any): number {
  let acc = 0;
  for (let i = 0; i < parent.childCount; i++) {
    const c = parent.child(i);
    if (c === child) return acc;
    acc += c.nodeSize;
  }
  return acc;
}

export default BadgeArrowNav;
