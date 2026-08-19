/**
 * Converts visual badges and cross-references to plain styled text for Word export.
 * Word can't render CSS clip-path, complex inline-flex, or SVG.
 */

/** True for white / near-white / unset colours, which are illegible on Word's white page. */
function isWhiteish(colour: string): boolean {
  const c = colour.trim().toLowerCase();
  if (!c) return true;
  if (c === '#fff' || c === '#ffffff' || c === 'white' || c === 'transparent') return true;
  const m = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) {
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return r > 240 && g > 240 && b > 240;
  }
  return false;
}

/**
 * The work-package colour for a chip: taken from the chip itself or the nearest
 * ancestor carrying it. Word supports no CSS custom properties, so every colour
 * must end up as a literal before export.
 */
function wpColourOf(el: HTMLElement): string | null {
  let node: HTMLElement | null = el;
  while (node) {
    const attr = node.getAttribute?.('data-wp-color');
    if (attr && !isWhiteish(attr)) return attr;
    const varColour = node.style?.getPropertyValue('--wp-color');
    if (varColour && !isWhiteish(varColour)) return varColour.trim();
    node = node.parentElement;
  }
  return null;
}

/** Replaces `var(--wp-color, …)` in any descendant style with a literal colour. */
function expandColourVars(root: HTMLElement): void {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[style*="var("]'))];
  nodes.forEach((node) => {
    const style = node.getAttribute('style');
    if (!style || !style.includes('var(')) return;
    const literal = wpColourOf(node) || '#000';
    node.setAttribute(
      'style',
      style.replace(/var\(\s*--wp-color\s*(?:,[^)]*)?\)/g, literal).replace(/var\([^)]*\)/g, literal),
    );
  });
}

export function convertBadgesForWord(container: HTMLElement): void {

  // 1. Inline reference badges
  container
    .querySelectorAll(
      '.inline-ref, [data-inline-reference], [data-wp-reference], [data-case-reference], [data-participant-reference], [data-acronym-reference], [data-fig-table-ref]'
    )
    .forEach((el) => {
      const span = el as HTMLElement;
      const text = span.textContent?.trim() || '';
      if (!text) {
        span.remove();
        return;
      }

      const rawWpColor =
        span.style.getPropertyValue('--wp-color') ||
        span.getAttribute('data-wp-color') ||
        span.style.borderColor ||
        '';
      // Never let a chip end up white on Word's white page.
      const wpColor = isWhiteish(rawWpColor)
        ? wpColourOf(span) || '#000'
        : rawWpColor.trim();


      const isWP =
        span.classList.contains('inline-ref-wp') || span.hasAttribute('data-wp-reference');
      const isTask =
        span.classList.contains('inline-ref-task') ||
        (span.hasAttribute('data-inline-reference') && !!text.match(/^T\d/));
      const isDeliverable =
        span.classList.contains('inline-ref-deliverable') ||
        (span.hasAttribute('data-inline-reference') && !!text.match(/^D\d/));
      const isParticipant =
        span.classList.contains('inline-ref-participant') ||
        span.hasAttribute('data-participant-reference');
      const isCase =
        span.classList.contains('inline-ref-case') || span.hasAttribute('data-case-reference');
      const isAcronym = span.hasAttribute('data-acronym-reference');
      const isFigTable = span.hasAttribute('data-fig-table-ref');

      const colour = isWP || isTask || isDeliverable ? wpColor : '#000';
      void isParticipant;
      void isCase;
      void isAcronym;
      void isFigTable;
      span.setAttribute(
        'style',
        `font-weight: bold; color: ${colour}; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
      );
      span.className = '';
      // Inner pill parts carry their own colours (often white text on a coloured
      // pill, or `var(--wp-color)`), which would render invisibly in Word.
      span.querySelectorAll<HTMLElement>('[style], [class]').forEach((child) => {
        child.className = '';
        child.setAttribute(
          'style',
          `font-weight: bold; color: ${colour}; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
        );
      });
    });


  // 2. B3.1 deliverable badges (clip-path chevrons)
  container.querySelectorAll('[style*="clip-path"]').forEach((el) => {
    const parent = el.closest('td') || el.parentElement;
    if (!parent) return;
    const textEl = parent.querySelector('[contenteditable], span:not([style*="clip-path"])');
    const text = textEl?.textContent?.trim() || el.textContent?.trim() || '';
    if (text && el.parentElement) {
      const replacement = document.createElement('span');
      const chevronColour = wpColourOf(el as HTMLElement) || '#000';
      replacement.setAttribute(
        'style',
        `font-weight: bold; color: ${chevronColour}; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
      );
      replacement.textContent = text;
      const outerBadge =
        el.parentElement?.closest('span[style*="inline-flex"]') || el.parentElement;
      if (outerBadge?.parentElement) {
        outerBadge.parentElement.replaceChild(replacement, outerBadge);
      }
    }
  });

  // 3. Remaining SVGs (milestone triangles, etc.)
  container.querySelectorAll('svg').forEach((svg) => {
    const parent = svg.parentElement;
    if (!parent) return;
    const text = parent.textContent?.trim() || '';
    if (text) {
      const replacement = document.createElement('span');
      replacement.setAttribute(
        'style',
        `font-weight: bold; color: #000; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
      );
      replacement.textContent = text;
      parent.replaceWith(replacement);
    } else {
      svg.remove();
    }
  });

  // 4. WPBubble-style pill spans
  container.querySelectorAll('span[style*="border-radius: 9999px"]').forEach((el) => {
    const span = el as HTMLElement;
    const text = span.textContent?.trim() || '';
    if (!text) return;
    // A pill is either coloured background + white text (use the background) or
    // white background + coloured text (use the text colour). Picking the
    // background blindly exported white-on-white chips.
    const bgColor = span.style.backgroundColor || '';
    const fgColor = span.style.color || '';
    const colour = !isWhiteish(bgColor)
      ? bgColor
      : !isWhiteish(fgColor)
        ? fgColor
        : wpColourOf(span) || '#000';
    span.setAttribute(
      'style',
      `font-weight: bold; color: ${colour}; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
    );
    span.querySelectorAll<HTMLElement>('[style], [class]').forEach((child) => {
      child.className = '';
      child.setAttribute(
        'style',
        `font-weight: bold; color: ${colour}; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
      );
    });
  });


  // 5. Flatten inline-flex containers
  container.querySelectorAll('span.inline-flex, [class*="inline-flex"]').forEach((el) => {
    const flex = el as HTMLElement;
    flex.style.display = 'inline';
    const children = Array.from(flex.children);
    children.forEach((child, i) => {
      if (i > 0) {
        const space = document.createTextNode(' ');
        child.parentNode?.insertBefore(space, child);
      }
    });
  });

  // 6. Risk badges (L/M/H)
  container.querySelectorAll('span[style*="border-radius: 9999px"]').forEach((el) => {
    const span = el as HTMLElement;
    const text = span.textContent?.trim() || '';
    if (!text || !['L', 'M', 'H'].includes(text)) return;
    const textColor = span.style.color || '#000';
    span.setAttribute(
      'style',
      `font-weight: bold; color: ${textColor}; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
    );
  });

  // 7. Citations — convert superscript citation numbers to proper Word superscript
  // Citations in the editor are <span style="vertical-align: super; font-size: 0.75em; ...">N</span>
  container.querySelectorAll('span[style*="vertical-align: super"]').forEach((el) => {
    const span = el as HTMLElement;
    const text = span.textContent?.trim() || '';
    if (!text) return;

    // Replace with a <sup> tag which Word understands natively
    const sup = document.createElement('sup');
    sup.setAttribute('style', 'font-family: "Times New Roman", Times, serif; font-size: 9pt;');
    sup.textContent = text;
    span.replaceWith(sup);
  });

  // 8. Footnotes at bottom of section — ensure 8pt font
  // Footnotes are rendered in .document-page-footer or in a div with text-[8pt] class
  container.querySelectorAll('p[class*="text-[8pt]"], .footnote-text').forEach((el) => {
    const p = el as HTMLElement;
    p.setAttribute('style', (p.getAttribute('style') || '') + '; font-size: 8pt; font-family: "Times New Roman", Times, serif;');
  });

  // 9. Word understands no CSS custom properties: expand any survivors and make
  // sure nothing was left white-on-white.
  expandColourVars(container);
  container.querySelectorAll<HTMLElement>('[style*="color"]').forEach((el) => {
    const colour = el.style.color;
    if (!colour || !isWhiteish(colour)) return;
    if (!el.textContent?.trim()) return;
    // White text is fine when something behind it is dark; only rescue text
    // that would land on Word's white page.
    let node: HTMLElement | null = el;
    while (node && node !== container) {
      if (!isWhiteish(node.style.backgroundColor || '')) return;
      node = node.parentElement;
    }
    el.style.color = wpColourOf(el) || '#000';
  });
}
