/**
 * Strips editor-only UI elements from a cloned DOM container for Word export.
 * NOT used by PDF export (which uses print CSS to hide these).
 */
export function scrubDomForExport(container: HTMLElement): void {
  const removeSelectors = [
    '.cursor-col-resize',
    '[class*="cursor-col-resize"]',
    '[class*="GripVertical"]',
    '[data-grip]',
    'svg.lucide-grip-vertical',
    '.print\\:hidden',
    '[class*="print:hidden"]',
    '.sr-only',
    '[class*="sr-only"]',
    '[data-radix-select-icon]',
    'svg.lucide-chevron-down',
    'svg.lucide-chevron-up',
    '[id*="DndDescribedBy"]',
    '[id*="DndLiveRegion"]',
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[data-comment-anchor]',
    '[data-commentable]',
  ];

  for (const selector of removeSelectors) {
    try {
      container.querySelectorAll(selector).forEach((el) => el.remove());
    } catch {
      /* skip invalid selectors */
    }
  }

  container.querySelectorAll('[contenteditable]').forEach((el) => {
    el.removeAttribute('contenteditable');
  });

  container.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
    if (el.tagName === 'SPAN' && !el.textContent?.trim()) el.remove();
  });

  container.querySelectorAll('table.he-table, table[class*="he-table"]').forEach((tbl) => {
    const t = tbl as HTMLElement;
    const style = t.getAttribute('style') || '';
    const cleaned = style.replace(/min-width:\s*\d+px;?/gi, '');
    t.setAttribute('style', cleaned + '; width: 100%;');
  });

  container.querySelectorAll('table').forEach((tbl) => {
    const t = tbl as HTMLElement;
    t.style.borderCollapse = 'collapse';
    t.style.width = '100%';
    tbl.querySelectorAll('th').forEach((th) => {
      const h = th as HTMLElement;
      h.style.borderBottom = '1.5px solid #000';
      h.style.padding = '3pt 5pt';
      h.style.fontWeight = 'bold';
      h.style.textAlign = 'left';
    });
    tbl.querySelectorAll('td').forEach((td) => {
      const c = td as HTMLElement;
      c.style.borderBottom = '0.5px solid #ccc';
      c.style.padding = '3pt 5pt';
      c.style.verticalAlign = 'top';
    });
  });

  // Word's HTML renderer handles CSS floats poorly, so floated (narrow)
  // figures degrade gracefully to a normal centred block: strip the float
  // metadata and inline float/clear styling from the image wrapper, the
  // image itself and its paired caption.
  container
    .querySelectorAll('[data-float="left"], [data-float="right"]')
    .forEach((node) => {
      const el = node as HTMLElement;
      el.removeAttribute('data-float');
      el.style.removeProperty('float');
      el.style.removeProperty('clear');
      el.style.removeProperty('cssFloat');
      const style = el.getAttribute('style') || '';
      const cleaned = style
        .replace(/(^|;)\s*(float|clear)\s*:[^;]*/gi, '$1')
        .replace(/;{2,}/g, ';')
        .replace(/^;\s*/, '');
      if (cleaned.trim()) el.setAttribute('style', cleaned);
      else el.removeAttribute('style');
      el.style.setProperty('margin-left', 'auto');
      el.style.setProperty('margin-right', 'auto');
      el.style.setProperty('text-align', 'center');
    });
}

