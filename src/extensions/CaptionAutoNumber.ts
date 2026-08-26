import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
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
 * Materialise derived labels before TipTap parses a field for the first time.
 *
 * Most captions already carry a populated captionLabel mark. Migrated module
 * captions can instead contain only the canonical paragraph class and their
 * description. Seeding those labels here makes the first editor paint
 * deterministic; CaptionAutoNumber continues to own subsequent renumbering.
 */
export function materializeCaptionLabels(
  html: string,
  cfg: CaptionNumbering | null,
): string {
  if (!html || !cfg?.sectionNumber || typeof document === 'undefined') return html;

  const holder = document.createElement('div');
  holder.innerHTML = html;
  const section = cfg.sectionNumber.replace(/^[A-Za-z]+/, '');
  let tableIdx = cfg.tableOffset;
  let figureIdx = cfg.figureOffset;

  Array.from(holder.children).forEach((element) => {
    if (element.matches('div[data-cases-table-node]')) {
      tableIdx += 1;
      return;
    }
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

    const index = kind === 'figure' ? figureIdx++ : tableIdx++;
    const desired = `${kind === 'figure' ? 'Figure' : 'Table'} ${section}.${captionLetter(index)}. `;
    const existingLabel = element.querySelector('[data-caption-label]');
    if (existingLabel) {
      existingLabel.textContent = desired;
      return;
    }

    if (match) {
      const firstText = element.firstChild;
      if (firstText?.nodeType === Node.TEXT_NODE) {
        firstText.textContent = (firstText.textContent ?? '').slice(match[0].length);
      }
    }
    const label = document.createElement('span');
    label.setAttribute('data-caption-label', '');
    label.textContent = desired;
    element.prepend(label);
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

function buildTransaction(state: EditorState, cfg: CaptionNumbering | null): Transaction | null {
  if (!cfg || !cfg.sectionNumber) return null;
  const markType = state.schema.marks.captionLabel;
  if (!markType) return null;
  const section = cfg.sectionNumber.replace(/^[A-Za-z]+/, '');

  let tableIdx = cfg.tableOffset;
  let figureIdx = cfg.figureOffset;

  const edits: { from: number; to: number; text: string }[] = [];

  state.doc.forEach((node, offset) => {
    if (node.type.name === 'casesTable') {
      // The caption lives inside the node view; it still burns a slot.
      tableIdx += 1;
      return;
    }
    const kind = isCaptionParagraph(node);
    const diagnosticCaption = /(?:Starting\s*&\s*target technology readiness levels|Advances beyond the state of the art)/i.test(node.textContent);
    if (diagnosticCaption) {
      console.info('[caption-diagnostic] extension caption test', {
        text: node.textContent,
        kind,
        className: String((node.attrs as { class?: string })?.class ?? ''),
        config: cfg,
      });
    }
    if (!kind) return;

    const index = kind === 'figure' ? figureIdx++ : tableIdx++;
    const desired = `${kind === 'figure' ? 'Figure' : 'Table'} ${section}.${captionLetter(index)}. `;

    const text = node.textContent;
    const m = LABEL_PATTERN.exec(text);
    const consume = Math.max(m ? m[0].length : 0, markedPrefixLength(node));
    if (diagnosticCaption) {
      console.info('[caption-diagnostic] extension label decision', {
        text,
        existingTextLabel: m?.[0] ?? null,
        existingMarkedLength: markedPrefixLength(node),
        desired,
        action: text.slice(0, consume) === desired ? 'none' : consume > 0 ? 'replace' : 'insert',
      });
    }
    if (text.slice(0, consume) === desired) return;

    const from = offset + 1;
    edits.push({ from, to: from + consume, text: desired });
  });

  if (!edits.length) return null;

  const tr = state.tr;
  // Apply back-to-front so earlier positions stay valid.
  for (const edit of edits.reverse()) {
    const node = state.schema.text(edit.text, [markType.create()]);
    if (edit.to > edit.from) tr.replaceWith(edit.from, edit.to, node);
    else tr.insert(edit.from, node);
  }
  tr.setMeta('addToHistory', false);
  tr.setMeta('captionAutoNumber', true);
  return tr;
}

/**
 * Keeps every table and figure caption label in the document equal to the
 * label its position implies. The label text carries the `captionLabel` mark,
 * which renders it non-editable and blocks typing inside it — only the
 * caption text after the label can be edited.
 */
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
    ];
  },
});

export default CaptionAutoNumber;
