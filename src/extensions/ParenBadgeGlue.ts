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
 * It inserts a zero-width U+2060 (WORD JOINER) widget decoration at each
 * such boundary. Decorations are view-only — saved content is never modified.
 *
 * Figure/table refs are intentionally excluded (they are plain inline and
 * wrap naturally).
 */

const BADGE_MARKS = new Set([
  'wpReference',
  'caseReference',
  'participantReference',
  'inlineReference',
]);

const WJ = '\u2060';

function hasBadgeMark(node: any): boolean {
  if (!node || !node.marks) return false;
  return node.marks.some((m: any) => BADGE_MARKS.has(m.type.name));
}

function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (!node.isTextblock) return;

    // Walk inline children of this textblock, comparing each adjacent pair.
    let offset = 0;
    const children: { node: any; relPos: number }[] = [];
    node.forEach((child: any) => {
      children.push({ node: child, relPos: offset });
      offset += child.nodeSize;
    });

    for (let i = 0; i < children.length - 1; i++) {
      const a = children[i];
      const b = children[i + 1];
      if (!a.node.isText || !b.node.isText) continue;

      const aText = a.node.text || '';
      const bText = b.node.text || '';
      if (!aText.length || !bText.length) continue;

      const aBadge = hasBadgeMark(a.node);
      const bBadge = hasBadgeMark(b.node);

      // Boundary position in document coordinates (between a and b).
      // pos is the position before the textblock; +1 enters it; +a.relPos+a.nodeSize lands at the boundary.
      const boundaryPos = pos + 1 + a.relPos + a.node.nodeSize;

      const lastChar = aText[aText.length - 1];
      const firstChar = bText[0];

      // Case 1: "(" immediately before a badge — no whitespace.
      if (!aBadge && bBadge && lastChar === '(') {
        decorations.push(
          Decoration.widget(boundaryPos, () => document.createTextNode(WJ), {
            side: -1,
            ignoreSelection: true,
            key: 'paren-glue-open',
          } as any),
        );
      }

      // Case 2: badge immediately followed by ")".
      if (aBadge && !bBadge && firstChar === ')') {
        decorations.push(
          Decoration.widget(boundaryPos, () => document.createTextNode(WJ), {
            side: 1,
            ignoreSelection: true,
            key: 'paren-glue-close',
          } as any),
        );
      }
    }
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
