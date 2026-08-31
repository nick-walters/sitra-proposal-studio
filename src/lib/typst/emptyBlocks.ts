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
  /\b(?:chip-pill|chip-run|chip-acronym|case-name-pill|wp-name-pill|he-[a-z-]+|not-converted|image|table|line|rect|polygon|figure|rotate|linebreak|bubble)\s*\(/;

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
 * Drops blank blocks from a body: the empty paragraphs the editor leaves
 * behind between modules, and any spacer left stranded at either end.
 */
export function dropBlankBlocks(blocks: string[]): string[] {
  return blocks.filter((b) => !isBlankBlock(b));
}
