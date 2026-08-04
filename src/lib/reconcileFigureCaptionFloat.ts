/**
 * Re-sync a narrow figure caption's float to its image's float.
 *
 * The image (`img[data-float]`) and its caption (`p.figure-caption`) are two
 * top-level siblings that must float on the same side to render as one
 * width-matched column. A paste, block split or manual edit can leave the two
 * out of step (image floated, caption still centred — or the reverse), which
 * produces a broken half-floated layout.
 *
 * This load-time pass makes the IMAGE the source of truth: every caption
 * paragraph directly after an image inherits that image's float side, and
 * captions whose image is not floated are cleared back to centred/block.
 *
 * Pure and idempotent: content already in sync is returned unchanged.
 */
export function reconcileFigureCaptionFloat(html: string): string {
  if (!html || html.indexOf('figure-caption') === -1) return html;
  if (typeof DOMParser === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return html;

  let changed = false;

  const readImageFloat = (el: Element): 'left' | 'right' | null => {
    const attr = el.getAttribute('data-float');
    if (attr === 'left' || attr === 'right') return attr;
    const style = el.getAttribute('style') || '';
    const m = style.match(/(?:^|[;\s])float:\s*(left|right)/);
    return m ? (m[1] as 'left' | 'right') : null;
  };

  const captions = Array.from(root.querySelectorAll('p.figure-caption'));

  for (const caption of captions) {
    // Previous element sibling — the image this caption belongs to.
    let prev = caption.previousElementSibling;
    // The image may be wrapped (node-view markup); look one level in.
    let image: Element | null = null;
    if (prev) {
      image = prev.tagName === 'IMG' ? prev : prev.querySelector('img');
    }

    const desired = image ? readImageFloat(image) : null;
    const current = readImageFloat(caption);
    if (desired === current) continue;

    changed = true;
    const styleAttr = caption.getAttribute('style') || '';
    const base = styleAttr
      .replace(/(?:^|[;\s])float\s*:[^;]*;?/gi, ';')
      .replace(/(?:^|[;\s])clear\s*:[^;]*;?/gi, ';')
      .replace(/(?:^|[;\s])margin[^:;]*:[^;]*;?/gi, ';')
      .replace(/;+/g, '; ')
      .replace(/^\s*;\s*/, '')
      .trim();

    const widthCm = caption.getAttribute('data-max-width-cm');

    if (desired) {
      caption.setAttribute('data-float', desired);
      const margin = desired === 'left' ? 'margin: 0 1em 0.6em 0' : 'margin: 0 0 0.6em 1em';
      const width = widthCm ? `max-width: ${widthCm}cm; width: ${widthCm}cm; ` : '';
      caption.setAttribute(
        'style',
        `${base ? base + '; ' : ''}${width}float: ${desired}; clear: ${desired}; ${margin}`,
      );
    } else {
      caption.removeAttribute('data-float');
      const width = widthCm
        ? `max-width: ${widthCm}cm; margin-left: auto; margin-right: auto`
        : '';
      const next = `${base ? base + '; ' : ''}${width}`.trim();
      if (next) caption.setAttribute('style', next);
      else caption.removeAttribute('style');
    }
  }

  return changed ? root.innerHTML : html;
}
