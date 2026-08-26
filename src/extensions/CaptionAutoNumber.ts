import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { captionLetter } from '@/lib/cards/captionSlots';

/**
 * Where this text box sits in its section's caption sequences. The board
 * computes these by walking its blocks in document order, so the number a
 * caption shows is derived from position and can never be typed.
 */
export interface CaptionNumbering {
  /** Section number without the "B" prefix, e.g. "1.2". */
  sectionNumber: string;
  /** Index the first table caption in this text box takes. */
  tableOffset: number;
  /** Index the first figure caption in this text box takes. */
  figureOffset: number;
}

const LABEL_PATTERN = /^\s*(Figure|Table)\s+\d+(?:\.\d+)*\.[a-z]+\.[ \u00A0]?/i;

/**
 * Remove stored/legacy labels before TipTap parses a field. Labels are derived
 * from document position and rendered as widgets, so caption paragraphs contain
 * only authored description text (or are genuinely empty).
 */
export function materializeCaptionLabels(
  html: string,
  cfg: CaptionNumbering | null,
): string {
  if (!html || !cfg?.sectionNumber || typeof document === 'undefined') return html;

  const holder = document.createElement('div');
  holder.innerHTML = html;
  Array.from(holder.children).forEach((element) => {
    if (element.matches('div[data-cases-table-node]')) return;
    if (!(element instanceof HTMLParagraphElement)) return;

    const cls = element.className || '';
    const markedLabel = element.querySelector('[data-caption-label]')?.textContent ?? '';
    const match = LABEL_PATTERN.exec(markedLabel) ?? LABEL_PATTERN.exec(element.textContent ?? '');
    const kind = cls.includes('document-table-caption')
      ? 'table'
      : cls.includes('figure-caption')
        ? 'figure'
        : match?.[1].toLowerCase() === 'figure'
          ? 'figure'
          : match?.[1].toLowerCase() === 'table'
            ? 'table'
            : null;
    if (!kind) return;

    const existingLabel = element.querySelector('[data-caption-label]');
    if (existingLabel) {
      existingLabel.remove();
    } else if (match) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const firstText = walker.nextNode();
      if (firstText) firstText.textContent = (firstText.textContent ?? '').slice(match[0].length);
    }
    element.querySelectorAll('span, strong, em').forEach((node) => {
      if (!(node.textContent ?? '').length && !node.children.length) node.remove();
    });
  });

  return holder.innerHTML;
}

function isCaptionParagraph(node: PMNode): 'table' | 'figure' | null {
  if (node.type.name !== 'paragraph') return null;
  const cls = String((node.attrs as { class?: string })?.class ?? '');
  if (cls.includes('document-table-caption')) return 'table';
  if (cls.includes('figure-caption')) return 'figure';
  // Legacy captions carry no class — fall back to the marked prefix or text.
  let marked = '';
  node.forEach((child) => {
    if (marked || !child.isText) return;
    if (child.marks.some((mark) => mark.type.name === 'captionLabel')) marked = child.text ?? '';
  });
  const markedMatch = LABEL_PATTERN.exec(marked);
  if (markedMatch) return markedMatch[1].toLowerCase() === 'figure' ? 'figure' : 'table';
  const m = LABEL_PATTERN.exec(node.textContent);
  if (!m) return null;
  return m[1].toLowerCase() === 'figure' ? 'figure' : 'table';
}

/** Length, in characters, of the leading run of captionLabel-marked text. */
function markedPrefixLength(para: PMNode): number {
  let len = 0;
  let stop = false;
  para.forEach((child) => {
    if (stop) return;
    if (child.isText && child.marks.some((m) => m.type.name === 'captionLabel')) {
      len += child.text?.length ?? 0;
    } else if (len > 0 || child.isText) {
      // The first unmarked text ends the label run.
      stop = true;
    }
  });
  return len;
}

/** Remove label text from documents that enter through a non-HTML path. */
function buildTransaction(state: EditorState, cfg: CaptionNumbering | null): Transaction | null {
  if (!cfg || !cfg.sectionNumber) return null;
  const edits: { from: number; to: number }[] = [];

  state.doc.forEach((node, offset) => {
    if (node.type.name === 'casesTable') {
      // The caption lives inside the node view; it still burns a slot.
      return;
    }
    const kind = isCaptionParagraph(node);
    if (!kind) return;

    const text = node.textContent;
    const m = LABEL_PATTERN.exec(text);
    const consume = Math.max(m ? m[0].length : 0, markedPrefixLength(node));
    if (consume > 0) edits.push({ from: offset + 1, to: offset + 1 + consume });
  });

  if (!edits.length) return null;

  const tr = state.tr;
  // Apply back-to-front so earlier positions stay valid.
  for (const edit of edits.reverse()) tr.delete(edit.from, edit.to);
  tr.setMeta('addToHistory', false);
  tr.setMeta('captionAutoNumber', true);
  return tr;
}

/**
 * Keeps every table and figure caption label equal to the label its position
 * implies. The label is a view-only widget; authored document content remains
 * entirely editable and unmarked.
 */
/**
 * Grey prompt shown inside a caption whose description is still empty.
 *
 * An empty caption is otherwise a paragraph made entirely of the
 * non-editable label mark: it has no clickable text of its own, so the caret
 * cannot be placed after the label. The placeholder gives the field both a
 * visible target and a height. It is keyed ONLY on the caption being empty —
 * never on selection or focus — so it cannot linger hidden after a blur.
 */
const CAPTION_PLACEHOLDER: Record<'table' | 'figure', string> = {
  table: 'Add a table caption…',
  figure: 'Add a figure caption…',
};

function captionDecorations(state: EditorState, cfg: CaptionNumbering | null): DecorationSet {
  const decos: Decoration[] = [];
  const section = cfg?.sectionNumber.replace(/^[A-Za-z]+/, '') ?? '';
  let tableIdx = cfg?.tableOffset ?? 0;
  let figureIdx = cfg?.figureOffset ?? 0;
  state.doc.forEach((node, offset) => {
    if (node.type.name === 'casesTable') {
      tableIdx += 1;
      return;
    }
    const kind = isCaptionParagraph(node);
    if (!kind) return;
    const index = kind === 'figure' ? figureIdx++ : tableIdx++;
    if (section) {
      const label = `${kind === 'figure' ? 'Figure' : 'Table'} ${section}.${captionLetter(index)}. `;
      decos.push(Decoration.widget(offset + 1, () => {
        const span = document.createElement('span');
        span.className = 'caption-label';
        span.setAttribute('data-caption-label', '');
        span.setAttribute('contenteditable', 'false');
        span.textContent = label;
        return span;
      }, { side: -1, key: `caption-label-${offset}-${label}`, ignoreSelection: true }));
    }
    const consumed = Math.max(
      LABEL_PATTERN.exec(node.textContent)?.[0].length ?? 0,
      markedPrefixLength(node),
    );
    const description = node.textContent.slice(consumed).trim();
    if (description) return;
    decos.push(
      Decoration.node(offset, offset + node.nodeSize, {
        class: 'caption-empty',
        'data-caption-placeholder': CAPTION_PLACEHOLDER[kind],
      }),
    );
  });
  return DecorationSet.create(state.doc, decos);
}

export const CaptionAutoNumber = Extension.create<{
  getConfig: () => CaptionNumbering | null;
}>({
  name: 'captionAutoNumber',

  addOptions() {
    return { getConfig: () => null };
  },

  addStorage() {
    return { config: null as CaptionNumbering | null };
  },

  addProseMirrorPlugins() {
    const ext = this;
    const getConfig = () => {
      const cfg = ext.options.getConfig();
      ext.storage.config = cfg;
      return cfg;
    };

    return [
      new Plugin({
        key: new PluginKey('captionAutoNumber'),

        view(view) {
          // Normalise once the document is mounted, and again whenever the
          // board hands down a different offset (a block moved, or a table
          // was added above this one).
          let last = '';
          const run = () => {
            const cfg = getConfig();
            const key = cfg ? `${cfg.sectionNumber}|${cfg.tableOffset}|${cfg.figureOffset}` : '';
            if (key === last) return;
            last = key;
            const tr = buildTransaction(view.state, cfg);
            if (tr) view.dispatch(tr);
          };
          const timer = window.setTimeout(run, 0);
          return {
            update: run,
            destroy: () => window.clearTimeout(timer),
          };
        },

        appendTransaction(transactions, _oldState, newState) {
          const shouldRefresh = transactions.some(
            (tr) => tr.docChanged || tr.getMeta('captionNumberingRefresh'),
          );
          if (!shouldRefresh) return null;
          return buildTransaction(newState, getConfig());
        },
      }),

      new Plugin({
        key: new PluginKey('captionPlaceholder'),
        props: {
          decorations(state) {
            return captionDecorations(state, getConfig());
          },
        },
      }),
    ];
  },
});

export default CaptionAutoNumber;
