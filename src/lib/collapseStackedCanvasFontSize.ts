/**
 * Collapse stacked `<span data-canvas-pt="…">` marks left over from a
 * bug window where CanvasFontSize allowed multiple marks of its own
 * type to coexist on one run (self-exclusion was disabled via
 * `excludes: ''`). ProseMirror stored 2+ canvasFontSize marks on the
 * same text; on toDOM those render as nested spans, e.g.
 *
 *   <span data-canvas-pt="9" style="font-size: …">
 *     <span data-canvas-pt="10" style="font-size: …">
 *       <span data-canvas-pt="14" style="font-size: …">text</span>
 *     </span>
 *   </span>
 *
 * ProseMirror appends new same-type marks AFTER existing ones in the
 * mark array, and renders the mark array outer-to-inner — so the LAST
 * applied pt is the INNERMOST span. We therefore keep the innermost
 * value and strip the outer spans' pt/font-size (leaving other styles
 * / attributes intact so unrelated marks are untouched).
 *
 * Idempotent: on already-single-mark content there are no nested
 * data-canvas-pt spans and the function returns the input unchanged.
 */
export function collapseStackedCanvasFontSize(html: string): string {
  if (!html || html.indexOf('data-canvas-pt') === -1) return html;
  if (typeof DOMParser === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return html;

  const spans = Array.from(root.querySelectorAll('span[data-canvas-pt]'));
  let changed = false;

  for (const el of spans) {
    // If this span contains a descendant that also carries a canvas pt,
    // the descendant is the more-recently-applied size — strip THIS one.
    if (el.querySelector('span[data-canvas-pt]')) {
      el.removeAttribute('data-canvas-pt');
      const style = el.getAttribute('style') || '';
      const cleaned = style.replace(/font-size\s*:\s*[^;]+;?/gi, '').trim();
      if (cleaned) el.setAttribute('style', cleaned);
      else el.removeAttribute('style');
      changed = true;
    }
  }

  return changed ? root.innerHTML : html;
}
