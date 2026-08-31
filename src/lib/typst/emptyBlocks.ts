/**
 * EMPTY CONTENT IS NEVER PRINTED.
 *
 * `SILENT_WHEN_EMPTY` in `sectionToTypst.ts` covers ONE case only: a
 * SOURCE-FED block whose emitter returned no rows (B3.1's cost tables, the
 * reference lists, the linked activities). It cannot reach anything else,
 * because everything else is authored content — a module heading, a case
 * entry, a mirrored participant paragraph, a cost line — and the converter had
 * no way to ask whether the Typst it had just produced actually puts ink on
 * the page. An empty `<p>` converts to `par(justify: false, t(""))`, which is
 * a perfectly valid block that prints a blank line; enough of them print a
 * blank region, and a heading followed only by those prints a heading with
 * nothing under it.
 *
 * These helpers answer that question, so every emitter can drop a heading,
 * entry or row that would otherwise print empty.
 */

/**
 * Calls that put ink on the page regardless of the literals they contain:
 * chips, rules, images, tables, figures, captions and the visible
 * "not converted" note.
 */
const DRAWING =
  /\b(?:chip-pill|chip-pill-crown|chip-pill-primary|chip-run|chip-acronym|case-name-pill|wp-name-pill|he-[a-z-]+|not-converted|image|table|line|rect|polygon|figure|rotate|linebreak|bubble)\s*\(/;

/** Every `t("…")` literal in the expression, unescaped. */
function literals(expr: string): string[] {
  const found = expr.match(/t\("(?:[^"\\]|\\.)*"\)/g) || [];
  return found.map((raw) => raw.slice(3, -2).replace(/\\(.)/g, '$1'));
}

/** True when the emitted Typst expression would print nothing visible. */
export function isBlankBlock(expr: string): boolean {
  const s = (expr || '').trim();
  if (!s) return true;
  // Bare vertical spacers are furniture, not content.
  if (/^v\(/.test(s)) return true;
  if (DRAWING.test(s)) return false;
  return !literals(s).some((text) => text.replace(/\u00a0/g, ' ').trim().length > 0);
}

/** True when at least one block in the list prints something. */
export function hasVisibleBlocks(blocks: string[]): boolean {
  return blocks.some((b) => !isBlankBlock(b));
}

/**
 * Trims a body: blank blocks at either end go entirely (they are the empty
 * paragraphs the editor leaves behind above and below a module), and a RUN of
 * blank blocks in the middle collapses to a single blank line — a deliberate
 * blank line between two paragraphs is kept, a stack of eleven that pushed the
 * next heading two-thirds of a page down is not.
 */
export function dropBlankBlocks(blocks: string[]): string[] {
  const out: string[] = [];
  let pendingBlank = false;
  for (const b of blocks) {
    if (isBlankBlock(b)) {
      if (out.length) pendingBlank = true;
      continue;
    }
    if (pendingBlank) out.push('par(justify: false, t(""))');
    pendingBlank = false;
    out.push(b);
  }
  return out;
}

/**
 * True when a fragment of stored HTML would put ink on the page: any text, or
 * any atom that draws (a chip, an image, a table, a figure, a mirror slot).
 * Used where the heading and the body are emitted as ONE run-in paragraph, so
 * the heading's own literal cannot be used to judge the body.
 */
const INK_SELECTOR =
  'img, table, hr, svg, [data-cases-table-node], [data-b32-mirror-slot], [data-b32-infra-table],' +
  ' [data-wp-reference], [data-task-reference], [data-deliverable-reference], [data-milestone-reference],' +
  ' [data-case-reference], [data-participant-reference], [data-acronym-reference], [data-citation]';

export function htmlHasInk(html: string | null | undefined): boolean {
  const raw = (html ?? '').toString();
  if (!raw.trim()) return false;
  if (typeof document === 'undefined') return raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
  const tpl = document.createElement('template');
  tpl.innerHTML = raw;
  const text = (tpl.content.textContent || '').replace(/\u00a0/g, ' ').trim();
  if (text.length > 0) return true;
  return !!tpl.content.querySelector(INK_SELECTOR);
}
