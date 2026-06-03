/**
 * Converts visual badges and cross-references to plain styled text for Word export.
 * Word can't render CSS clip-path, complex inline-flex, or SVG.
 */
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

      const wpColor =
        span.style.getPropertyValue('--wp-color') ||
        span.getAttribute('data-wp-color') ||
        span.style.borderColor ||
        '#000';

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

      if (isWP || isTask || isDeliverable) {
        span.setAttribute(
          'style',
          `font-weight: bold; color: ${wpColor}; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
        );
        span.className = '';
      } else if (isParticipant || isCase || isAcronym || isFigTable) {
        span.setAttribute(
          'style',
          `font-weight: bold; color: #000; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
        );
        span.className = '';
      } else {
        span.setAttribute(
          'style',
          `font-weight: bold; color: #000; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
        );
        span.className = '';
      }
    });

  // 2. B3.1 deliverable badges (clip-path chevrons)
  container.querySelectorAll('[style*="clip-path"]').forEach((el) => {
    const parent = el.closest('td') || el.parentElement;
    if (!parent) return;
    const textEl = parent.querySelector('[contenteditable], span:not([style*="clip-path"])');
    const text = textEl?.textContent?.trim() || el.textContent?.trim() || '';
    if (text && el.parentElement) {
      const replacement = document.createElement('span');
      replacement.setAttribute(
        'style',
        `font-weight: bold; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
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
    const bgColor = span.style.backgroundColor || '#000';
    span.setAttribute(
      'style',
      `font-weight: bold; color: ${bgColor}; font-family: 'Times New Roman', Times, serif; font-size: 11pt;`
    );
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
}
