import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * BadgeCaretHost
 *
 * View-only decoration plugin. For each maximal contiguous run of text sharing
 * one of the badge marks (wpReference, caseReference, participantReference,
 * inlineReference, headingNumberLabel — NOT figureTableReference), inserts a
 * zero-width EDITABLE caret-host widget immediately before the run and
 * immediately after the run. This gives Chromium an inline editable text box
 * adjacent to the contenteditable=false badge span so the caret can be drawn
 * at positions flush against the badge.
 *
 * Widgets are Decoration.widget (never serialized), so getHTML() and saved
 * content are unaffected. The ZWSP is only present in the rendered view DOM.
 *
 * Does not mutate the document, marks, or schema. Coexists with
 * BadgeTrailingCaret, ParenBadgeGlue, referenceClickSelect.
 */

const BADGE_MARK_NAMES = new Set([
  'inlineReference',
  'headingNumberLabel',
]);

// Inline atom node names that should also act as badge runs (1-node runs).
// wpReference migrated from mark to inline atom NODE in Stage 1 pilot.
// WP atom intentionally excluded: atomic nodes handle their own caret natively,
// and the zero-width host caused invisible-typed-text at line starts.
const BADGE_ATOM_NODE_NAMES = new Set<string>([]);

function getBadgeRunName(node: PMNode): string | null {
  if (node.isText) {
    for (const m of node.marks) {
      if (BADGE_MARK_NAMES.has(m.type.name)) return m.type.name;
    }
    return null;
  }
  // Inline atom nodes acting as badges.
  if (node.isInline && BADGE_ATOM_NODE_NAMES.has(node.type.name)) {
    return node.type.name;
  }
  return null;
}

function buildCaretHost(side: 'L' | 'R'): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'badge-caret-host';
  el.setAttribute('data-badge-caret-host', side);
  el.textContent = '\u200B';
  el.style.display = 'inline-block';
  el.style.minWidth = '1px';
  return el;
}

function buildDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    let runStartRelative: number | null = null;
    let runMarkName: string | null = null;
    let offset = 0;

    const flush = (endRelative: number) => {
      if (runStartRelative === null) return;
      const startPos = pos + 1 + runStartRelative;
      const endPos = pos + 1 + endRelative;
      decos.push(
        Decoration.widget(startPos, () => buildCaretHost('L'), {
          side: -1,
          key: `bch-L-${startPos}`,
          marks: [],
        }),
      );
      decos.push(
        Decoration.widget(endPos, () => buildCaretHost('R'), {
          side: 1,
          key: `bch-R-${endPos}`,
          marks: [],
        }),
      );
      runStartRelative = null;
      runMarkName = null;
    };

    node.forEach((child) => {
      const runName = getBadgeRunName(child);
      if (runName && runName === runMarkName) {
        // continue run
      } else {
        flush(offset);
        if (runName) {
          runStartRelative = offset;
          runMarkName = runName;
        }
      }
      offset += child.nodeSize;
    });
    flush(offset);

    return false; // don't descend into textblock children
  });

  return DecorationSet.create(doc, decos);
}

const pluginKey = new PluginKey<DecorationSet>('badgeCaretHost');

export const BadgeCaretHost = Extension.create({
  name: 'badgeCaretHost',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: pluginKey,
        state: {
          init: (_, state) => buildDecorations(state.doc),
          apply: (tr, old) => {
            if (!tr.docChanged) return old.map(tr.mapping, tr.doc);
            return buildDecorations(tr.doc);
          },
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

export default BadgeCaretHost;
