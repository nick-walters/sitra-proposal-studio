import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

// Remaining badge MARK names (wpReference/caseReference/participantReference/
// inlineReference all migrated to inline atom NODEs in Stages 1–3).
const REF_MARK_NAMES: string[] = [];
// Inline atom NODE names that should also get paren-glue.
const REF_ATOM_NODE_NAMES = new Set([
  'wpReference',
  'caseReference',
  'participantReference',
  'inlineReference',
]);

function buildGlueDecorations(doc: PMNode): DecorationSet {
  const schema = doc.type.schema;
  const markTypes = REF_MARK_NAMES.map((n) => schema.marks[n]).filter(Boolean);

  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    // Detect badge: either a text node with a ref mark, or an inline atom ref node.
    let isBadge = false;
    if (node.isText) {
      isBadge = node.marks.some((m) => markTypes.indexOf(m.type) !== -1);
    } else if (node.isInline && REF_ATOM_NODE_NAMES.has(node.type.name)) {
      isBadge = true;
    }
    if (!isBadge) return;

    const badgeFrom = pos;
    const badgeTo = pos + node.nodeSize;
    let start = badgeFrom;
    let end = badgeTo;

    // Character immediately before the badge, within the same text block.
    // Round AND square opening brackets are glued, so neither can be left
    // dangling at the end of the previous line.
    const $from = doc.resolve(badgeFrom);
    if ($from.parentOffset > 0) {
      const charBefore = doc.textBetween(badgeFrom - 1, badgeFrom);
      if (charBefore === '(' || charBefore === '[') start = badgeFrom - 1;
    }

    // Character immediately after the badge, within the same text block.
    // A closing round/square bracket is glued as before; so is a plain SPACE,
    // so that the space can never be carried to the head of the next line,
    // where it read as a stray indent after a wrapped chip.
    const $to = doc.resolve(badgeTo);
    if ($to.parentOffset < $to.parent.content.size) {
      const charAfter = doc.textBetween(badgeTo, badgeTo + 1);
      if (charAfter === ')' || charAfter === ']' || charAfter === ' ') end = badgeTo + 1;
    }


    if (start < badgeFrom || end > badgeTo) {
      decorations.push(Decoration.inline(start, end, { style: 'white-space: nowrap;' }));
    }
  });


  return DecorationSet.create(doc, decorations);
}

/**
 * Turns the single plain space that follows a chip into a non-breaking space.
 *
 * The nowrap DECORATION cannot do this on its own: an inline decoration that
 * spans an atom node and its neighbouring text is applied to each part
 * separately (the atom's own DOM element gets the style, the text gets its
 * own span), so the break opportunity BETWEEN them survives. Rewriting the
 * character removes the opportunity outright, and — unlike a decoration — it
 * is stored, so every static/mirror/export render inherits it too.
 */
function glueTrailingSpaces(newState: any) {
  const { doc, tr } = newState;
  let changed = false;
  doc.descendants((node: PMNode, pos: number) => {
    if (!(node.isInline && REF_ATOM_NODE_NAMES.has(node.type.name))) return;
    const after = pos + node.nodeSize;
    const $after = doc.resolve(after);
    if ($after.parentOffset >= $after.parent.content.size) return;
    const next = doc.textBetween(after, Math.min(after + 1, $after.end()));
    if (next !== ' ') return;
    tr.insertText('\u00a0', after, after + 1);
    changed = true;
  });
  return changed ? tr : null;
}

export const ParenBadgeGlue = Extension.create({
  name: 'parenBadgeGlue',

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('parenBadgeGlue');
    return [
      new Plugin({
        key: pluginKey,
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          return glueTrailingSpaces(newState);
        },
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
