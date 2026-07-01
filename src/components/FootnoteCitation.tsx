import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';

interface Props {
  html: string;
}

/**
 * Renders a single footnote citation on exactly one line.
 *
 * If the rendered reference exceeds the available width, words are removed
 * from the end of the article title (the element marked with
 * `data-cite-title`) and replaced with an ellipsis until the whole reference
 * fits on a single line.
 */
export function FootnoteCitation({ html }: Props) {
  const containerRef = useRef<HTMLParagraphElement>(null);

  // Re-run the truncation logic whenever the html or container width changes.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const fit = () => {
      const titleEl = el.querySelector('[data-cite-title]') as HTMLElement | null;
      if (!titleEl) return;

      // Cache the original (untrimmed) title text on first run.
      let original = titleEl.getAttribute('data-original');
      if (original === null) {
        original = titleEl.textContent || '';
        titleEl.setAttribute('data-original', original);
      }

      // Reset to the full title before measuring.
      titleEl.textContent = original;
      if (el.scrollWidth <= el.clientWidth) return;

      // Strip any trailing period so we can re-add a clean ellipsis.
      const base = original.replace(/\.$/, '');
      const words = base.split(/\s+/);

      while (words.length > 1 && el.scrollWidth > el.clientWidth) {
        words.pop();
        titleEl.textContent = words.join(' ') + '…';
      }
    };

    fit();

    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [html]);

  const sanitized = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['em', 'strong', 'i', 'b', 'a', 'sup', 'sub', 'span'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style', 'data-cite-title', 'data-original'],
      }),
    [html]
  );

  return (
    <p
      ref={containerRef}
      className="text-[8pt] text-muted-foreground"
      style={{
        whiteSpace: 'nowrap',
        overflowX: 'hidden',
        overflowY: 'visible',
        lineHeight: 0.9,
        margin: 0,
      }}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
