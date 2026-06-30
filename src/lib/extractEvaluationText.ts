/**
 * Walks a prepared export-container DOM (the same one used for PDF/Word) and
 * emits machine-readable structured markdown for the evaluation pipeline.
 *
 * IMPORTANT: callers must pass a CLONE of the prepared container so the
 * visual export keeps its real figures/images. `replaceFiguresWithText` is
 * meant to run on that clone before extraction (see PanelEvaluator).
 *
 * Output rules
 * ─────────────
 * - Headings: prefer [data-section-name] attribute (keeps "B3.1" labels);
 *   fall back to the element's text. H1 → "# ", H2 → "## ", H3 → "### ",
 *   H4 → "#### ".
 * - Tables: emit GitHub-style pipe tables (header row from <thead> or
 *   first <tr>). Cells use innerText so cross-ref bubbles / badges /
 *   participant chips are preserved as readable text.
 * - Lists: "- " for <ul>, "1. " incremental for <ol>; nested lists indent
 *   two spaces per level.
 * - Paragraphs: blank-line separated.
 * - Figure summaries (data-figure-summary) are preserved verbatim.
 * - Script/style/interactive chrome is skipped.
 */

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'BUTTON',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'SVG',
]);

const HEADING_PREFIX: Record<string, string> = {
  H1: '# ',
  H2: '## ',
  H3: '### ',
  H4: '#### ',
  H5: '##### ',
  H6: '###### ',
};

function cellText(cell: HTMLElement): string {
  const txt = (cell.innerText || cell.textContent || '')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
  return txt;
}

function renderTable(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
  if (rows.length === 0) return '';

  // Identify header row
  const theadRow = table.querySelector('thead tr') as HTMLTableRowElement | null;
  const headerRow = theadRow || rows[0];
  const bodyRows = rows.filter((r) => r !== headerRow);

  const headers = Array.from(headerRow.querySelectorAll('th, td')).map((c) =>
    cellText(c as HTMLElement),
  );
  if (headers.length === 0) return '';

  const out: string[] = [];
  out.push(`| ${headers.join(' | ')} |`);
  out.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of bodyRows) {
    const cells = Array.from(row.querySelectorAll('th, td')).map((c) =>
      cellText(c as HTMLElement),
    );
    // Pad / trim to header length
    while (cells.length < headers.length) cells.push('');
    if (cells.length > headers.length) cells.length = headers.length;
    out.push(`| ${cells.join(' | ')} |`);
  }
  return out.join('\n');
}

function renderList(list: HTMLElement, depth: number): string {
  const ordered = list.tagName === 'OL';
  const items = Array.from(list.children).filter((c) => c.tagName === 'LI') as HTMLElement[];
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  items.forEach((li, idx) => {
    // Take direct text, but recurse for nested lists.
    const nested: string[] = [];
    const cloned = li.cloneNode(true) as HTMLElement;
    // Pull out nested lists for separate rendering, then strip from clone.
    const nestedLists = Array.from(cloned.querySelectorAll(':scope > ul, :scope > ol')) as HTMLElement[];
    nestedLists.forEach((nl) => nl.remove());
    const text = (cloned.innerText || cloned.textContent || '').replace(/\s+/g, ' ').trim();
    const marker = ordered ? `${idx + 1}.` : '-';
    if (text) lines.push(`${indent}${marker} ${text}`);
    Array.from(li.querySelectorAll(':scope > ul, :scope > ol')).forEach((nl) => {
      nested.push(renderList(nl as HTMLElement, depth + 1));
    });
    if (nested.length) lines.push(nested.join('\n'));
  });
  return lines.join('\n');
}

function walk(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent || '').replace(/\s+/g, ' ');
    if (t.trim()) out.push(t.trim());
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  if (SKIP_TAGS.has(el.tagName)) return;
  // Hidden elements (display:none) — skip.
  if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return;
  const tag = el.tagName;

  // Headings
  if (HEADING_PREFIX[tag]) {
    const labelAttr = el.getAttribute('data-section-name');
    const text = labelAttr || (el.innerText || el.textContent || '').trim();
    if (text) out.push('\n' + HEADING_PREFIX[tag] + text + '\n');
    return;
  }

  // Tables
  if (tag === 'TABLE') {
    // Figure-summary <p> may have replaced the chart, but plain tables stay.
    const rendered = renderTable(el as HTMLTableElement);
    if (rendered) out.push('\n' + rendered + '\n');
    return;
  }

  // Lists
  if (tag === 'UL' || tag === 'OL') {
    const rendered = renderList(el, 0);
    if (rendered) out.push('\n' + rendered + '\n');
    return;
  }

  // Figure summary paragraphs — preserve their text verbatim.
  if (tag === 'P' && el.hasAttribute('data-figure-summary')) {
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) out.push('\n' + text + '\n');
    return;
  }

  // Block-ish elements that should produce a paragraph break.
  const isBlock =
    tag === 'P' ||
    tag === 'DIV' ||
    tag === 'SECTION' ||
    tag === 'ARTICLE' ||
    tag === 'FIGURE' ||
    tag === 'BLOCKQUOTE' ||
    tag === 'PRE';

  if (isBlock) {
    // Render block as a single line of inline text when its children are inline.
    const hasBlockChild = Array.from(el.children).some(
      (c) =>
        ['P', 'DIV', 'UL', 'OL', 'TABLE', 'SECTION', 'ARTICLE', 'FIGURE', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(
          c.tagName,
        ),
    );
    if (!hasBlockChild) {
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) out.push('\n' + text + '\n');
      return;
    }
    // Otherwise recurse so children produce their own blocks.
    for (const child of Array.from(el.childNodes)) walk(child, out);
    return;
  }

  // BR / inline → recurse and rely on parent to wrap.
  for (const child of Array.from(el.childNodes)) walk(child, out);
}

/**
 * Extract structured markdown from the export container clone.
 */
export function extractEvaluationText(container: HTMLElement): string {
  const out: string[] = [];
  walk(container, out);
  // Collapse 3+ blank lines, trim.
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
