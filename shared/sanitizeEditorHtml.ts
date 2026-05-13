/**
 * Canonical HTML sanitiser used by both the client (Vite/React) and
 * Supabase edge functions (Deno). Pure TypeScript, no runtime-specific
 * syntax. Imported from:
 *   - src/lib/editorContentSanitizer.ts (re-export for client)
 *   - supabase/functions/duplicate-proposal/index.ts (and any other fns)
 *
 * Uses isomorphic-dompurify which transparently uses the native browser
 * DOM in the client and a bundled jsdom in Deno/Node.
 */
import DOMPurify from 'isomorphic-dompurify';

export const ALLOWED_CLASSES = new Set<string>([
  'figure-caption',
  'table-caption',
  'he-table',
  'he-table-cell',
  'he-table-header',
  'wp-reference-badge',
  'case-reference-badge',
  'participant-reference-badge',
  'formula-result',
]);

export const ALLOWED_DATA_ATTRS = new Set<string>([
  'data-list-style',
  'data-inline-reference',
  'data-wp-reference',
  'data-case-reference',
  'data-participant-reference',
  'data-acronym-reference',
  'data-fig-table-ref',
  'data-ref-type',
  'data-ref-kind',
  'data-wp-number',
  'data-wp-short-name',
  'data-wp-color',
  'data-wp-id',
  'data-task-number',
  'data-task-id',
  'data-deliverable-number',
  'data-deliverable-id',
  'data-milestone-number',
  'data-milestone-id',
  'data-case-number',
  'data-case-short-name',
  'data-case-color',
  'data-case-id',
  'data-case-type',
  'data-participant-number',
  'data-participant-short-name',
  'data-participant-id',
  'data-figure-id',
  'data-table-key',
  'data-acronym-segments',
  'data-track-insertion',
  'data-track-deletion',
  'data-change-id',
  'data-author-id',
  'data-author-name',
  'data-author-color',
  'data-timestamp',
]);

export const STYLE_ALLOWLIST = new Set<string>([
  'text-align',
  'color',
  'font-weight',
  'font-style',
  'text-decoration',
  'vertical-align',
  'width',
  'min-width',
  'height',
  'margin-left',
  'margin-right',
  'display',
  'border-color',
  'fill',
  'stroke',
  'stroke-width',
  '--wp-color',
]);

export const ALLOWED_TAGS = [
  // Block / inline HTML
  'p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'span', 'a',
  'h1', 'h2', 'h3', 'h4', 'sub', 'sup',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'blockquote',
  // SVG (chevrons, diamonds, future inline icons)
  'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
  'ellipse', 'defs', 'use', 'title', 'desc', 'text', 'tspan',
];

export const ALLOWED_ATTR = [
  // HTML
  'class', 'style', 'href', 'target', 'rel', 'src', 'alt',
  'width', 'height', 'colspan', 'rowspan',
  // SVG
  'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'points', 'transform', 'preserveAspectRatio',
  // Data attrs (whitelisted set)
  ...Array.from(ALLOWED_DATA_ATTRS),
];

function cleanStorageSrc(src: string): string {
  const match = src.match(/\/proposal-files\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : src;
}

function cleanStyle(style: string): string {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const [property, value = ''] = part.split(':');
      const name = property.trim().toLowerCase();
      const lowerValue = value.toLowerCase();
      return (
        STYLE_ALLOWLIST.has(name) &&
        !lowerValue.includes('javascript:') &&
        !lowerValue.includes('expression(')
      );
    })
    .join('; ');
}

/**
 * Sanitises an HTML string by:
 *  - Stripping disallowed tags/attrs/classes/styles
 *  - Removing TipTap/AI residue (contenteditable, font-claude, etc.)
 *  - Preserving the proposal-specific allowlist (inline refs, he-table, captions, SVG icons)
 *
 * Safe to call in browser, Node and Deno.
 */
export function sanitizeEditorHtml(html: string): string {
  if (!html) return '';

  // First pass: DOMPurify with combined html+svg profile.
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true },
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  }) as string;

  // Second pass: post-process via a parsed DOM (works in browser + jsdom).
  const doc =
    typeof document !== 'undefined'
      ? document.implementation.createHTMLDocument('')
      : null;

  if (!doc) {
    // No DOM available at all — return DOMPurify output as-is.
    return sanitized;
  }

  const container = doc.createElement('div');
  container.innerHTML = sanitized;

  container.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (
        name.startsWith('on') ||
        ['contenteditable', 'draggable', 'spellcheck', 'tabindex', 'role'].includes(name)
      ) {
        element.removeAttribute(attr.name);
      }
      if (name.startsWith('data-') && !ALLOWED_DATA_ATTRS.has(name)) {
        element.removeAttribute(attr.name);
      }
    }

    const classList = Array.from(element.classList).filter(
      (className) => ALLOWED_CLASSES.has(className) || className.startsWith('inline-ref'),
    );
    if (classList.length) element.setAttribute('class', classList.join(' '));
    else element.removeAttribute('class');

    const cleanedStyle = cleanStyle(element.getAttribute('style') || '');
    if (cleanedStyle) element.setAttribute('style', cleanedStyle);
    else element.removeAttribute('style');

    if (element.tagName === 'IMG') {
      const src = element.getAttribute('src') || '';
      if (src.includes('/proposal-files/')) element.setAttribute('src', cleanStorageSrc(src));
    }
  });

  return container.innerHTML;
}
