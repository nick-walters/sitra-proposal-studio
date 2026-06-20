import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * ParenBadgeGlue
 *
 * View-only ProseMirror plugin that prevents a line break between a typed
 * "(" or ")" and an immediately-adjacent reference badge (wpReference,
 * caseReference, participantReference, inlineReference).
 *
 * Mechanism: wraps the "(" + badge (and/or badge + ")") range in an inline
 * decoration carrying `white-space: nowrap`. Because badges are atomic
 * display:inline-flex boxes, a nowrap container is required to suppress the
 * break opportunity at the box edge — a zero-width word-joiner is not
 * reliable in that situation.
 *
 * Decorations are view-only: saved HTML is never modified. Figure/table
 * references are intentionally excluded.
 */

const BADGE_MARKS = new Set([
  'wpReference',
  'caseReference',
  'participantReference',
  'inlineReference',
]);

function hasBadgeMark(node: any): boolean {
  if (!node || !node.marks) return false;
  return node.marks.some((m: any) => BADGE_MARKS.has(m.type.name));
}

function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];
  const NOWRAP = { style: 'white-space: nowrap' } as any;

  doc.descendants((node: any, pos: number) => {
    if (!node.isTextblock) return;

    // Collect inline children with their relative offsets inside this textblock.
    const children: { node: any; relPos: number }[] = [];
    let offset = 0;
    node.forEach((child: any) => {
      children.push({ node: child, relPos: offset });
      offset += child.nodeSize;
    });

    // Group contiguous badge-marked text children into runs.
    // A "run" is a maximal sequence of adjacent text nodes that all carry a badge mark.
    const i = 0;
    let idx = 0;
    while (idx < children.length) {
      const c = children[idx];
      if (!c.node.isText || !hasBadgeMark(c.node)) {
        idx++;
        continue;
      }
      const runStartIdx = idx;
      let runEndIdx = idx;
      while (
        runEndIdx + 1 < children.length &&
        children[runEndIdx + 1].node.isText &&
        hasBadgeMark(children[runEndIdx + 1].node)
      ) {
        runEndIdx++;
      }

      const runStart = children[runStartIdx];
      const runEnd = children[runEndIdx];
      // Absolute doc positions for this badge run.
      // pos = position before the textblock; +1 enters it.
      const badgeStartAbs = pos + 1 + runStart.relPos;
      const badgeEndAbs = pos + 1 + runEnd.relPos + runEnd.node.nodeSize;

      // OPENING case: preceding sibling is text, no whitespace, ends with "(".
      if (runStartIdx > 0) {
        const prev = children[runStartIdx - 1];
        if (prev.node.isText && !hasBadgeMark(prev.node)) {
          const prevText: string = prev.node.text || '';
          if (prevText.length && prevText[prevText.length - 1] === '(') {
            const parenPos = pos + 1 + prev.relPos + (prevText.length - 1);
            decorations.push(Decoration.inline(parenPos, badgeEndAbs, NOWRAP));
          }
        }
      }

      // CLOSING case: following sibling is text, no whitespace, starts with ")".
      if (runEndIdx + 1 < children.length) {
        const next = children[runEndIdx + 1];
        if (next.node.isText && !hasBadgeMark(next.node)) {
          const nextText: string = next.node.text || '';
          if (nextText.length && nextText[0] === ')') {
            const parenEndPos = pos + 1 + next.relPos + 1;
            decorations.push(Decoration.inline(badgeStartAbs, parenEndPos, NOWRAP));
          }
        }
      }

      idx = runEndIdx + 1;
    }
    // no-op reference to silence unused-var lint
    void i;
  });

  return DecorationSet.create(doc, decorations);
}

export const ParenBadgeGlue = Extension.create({
  name: 'parenBadgeGlue',

  addProseMirrorPlugins() {
    const key = new PluginKey('parenBadgeGlue');
    return [
      new Plugin({
        key,
        state: {
          init: (_, { doc }) => buildDecorations(doc),
          apply(tr, oldSet) {
            if (!tr.docChanged) return oldSet;
            return buildDecorations(tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

export default ParenBadgeGlue;
