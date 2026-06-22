import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

const REF_MARK_NAMES = ['wpReference', 'caseReference', 'participantReference', 'inlineReference'];

function buildGlueDecorations(doc: PMNode): DecorationSet {
  const schema = doc.type.schema;
  const markTypes = REF_MARK_NAMES.map((n) => schema.marks[n]).filter(Boolean);
  if (markTypes.length === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const isBadge = node.marks.some((m) => markTypes.indexOf(m.type) !== -1);
    if (!isBadge) return;

    const badgeFrom = pos;
    const badgeTo = pos + node.nodeSize;
    let start = badgeFrom;
    let end = badgeTo;

    // Character immediately before the badge, within the same text block
    const $from = doc.resolve(badgeFrom);
    if ($from.parentOffset > 0) {
      const charBefore = doc.textBetween(badgeFrom - 1, badgeFrom);
      if (charBefore === '(') start = badgeFrom - 1;
    }

    // Character immediately after the badge, within the same text block
    const $to = doc.resolve(badgeTo);
    if ($to.parentOffset < $to.parent.content.size) {
      const charAfter = doc.textBetween(badgeTo, badgeTo + 1);
      if (charAfter === ')') end = badgeTo + 1;
    }

    if (start < badgeFrom || end > badgeTo) {
      decorations.push(Decoration.inline(start, end, { style: 'white-space: nowrap;' }));
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const ParenBadgeGlue = Extension.create({
  name: 'parenBadgeGlue',

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('parenBadgeGlue');
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: (_config, state) => buildGlueDecorations(state.doc),
          apply: (tr, oldDeco) => (tr.docChanged ? buildGlueDecorations(tr.doc) : oldDeco),
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state);
          },
        },
      }),
    ];
  },
});

export default ParenBadgeGlue;
