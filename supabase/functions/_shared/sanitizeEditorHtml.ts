/**
 * Canonical HTML sanitiser used by both the client (Vite/React) and
 * Supabase edge functions (Deno). Pure TypeScript, no runtime-specific
 * syntax. Imported from:
 *   - src/lib/editorContentSanitizer.ts (re-export for client)
 *   - supabase/functions/ (any function that needs HTML sanitisation)
 *
 * Uses isomorphic-dompurify which transparently uses the native browser
 * DOM in the client and a bundled jsdom in Deno/Node.
 */
// Bare specifier is resolved by Vite (node_modules) in the browser and by
// the per-function `deno.json` import map in the Supabase edge runtime.
// @ts-ignore — types resolved at runtime
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
  'b12-case-title-badge',
  'b12-lead-badge',
  'b12-case-title-text',
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
  'data-citation',
  'data-heading-number',
  'data-caption-label',
  'data-spacing-before',
  'data-spacing-after',
  'data-role',
  'data-case-start',
  'data-b12-cases-table',
  'data-b12-cases-block',
  'data-b12-cases-heading',
  'data-b12-cases-caption',
  'data-default-subheading',
  'data-cases-table-node',
  'data-case-ids',
  'data-caption',
  'data-b12-cases-node-caption',
  'data-b12-cases-subheading',
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
  'margin-top',
  'margin-bottom',
  'display',
  'border-color',
  'fill',
  'stroke',
  'stroke-width',
  '--wp-color',
  'user-select',
]);

export const ALLOWED_TAGS = [
  // Block / inline HTML
  'p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'span', 'a',
  'h1', 'h2', 'h3', 'h4', 'sub', 'sup',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'blockquote',
  // Wrapper for the casesTable NodeView (B1.2)
  'div',
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
 * Safe to call in browser, Node and Deno (uses isomorphic-dompurify hooks
 * so no separate DOM-traversal pass is required).
 */
export function sanitizeEditorHtml(html: string): string {
  if (!html) return '';

  // Per-call hooks (added then removed) so other DOMPurify usages aren't affected.
  const attrHook = (node: any, data: any) => {
    const name = String(data.attrName || '').toLowerCase();
    const value = String(data.attrValue ?? '');

    // Strip event handlers and editor-state attrs.
    if (name.startsWith('on') ||
        ['contenteditable', 'draggable', 'spellcheck', 'tabindex', 'role'].includes(name)) {
      data.keepAttr = false;
      return;
    }

    // Strip unknown data-* attributes.
    if (name.startsWith('data-') && !ALLOWED_DATA_ATTRS.has(name)) {
      data.keepAttr = false;
      return;
    }

    // Filter class list against allowlist (+ inline-ref* prefix).
    if (name === 'class') {
      const kept = value.split(/\s+/).filter(
        (c) => c && (ALLOWED_CLASSES.has(c) || c.startsWith('inline-ref')),
      );
      if (kept.length === 0) {
        data.keepAttr = false;
      } else {
        data.attrValue = kept.join(' ');
      }
      return;
    }

    // Filter style declarations against allowlist + strip JS payloads.
    if (name === 'style') {
      const cleaned = cleanStyle(value);
      if (!cleaned) {
        data.keepAttr = false;
      } else {
        data.attrValue = cleaned;
      }
      return;
    }

    // Rewrite img src for proposal-files storage paths.
    if (name === 'src' && node && String(node.tagName || '').toLowerCase() === 'img') {
      if (value.includes('/proposal-files/')) {
        data.attrValue = cleanStorageSrc(value);
      }
    }
  };

  DOMPurify.addHook('uponSanitizeAttribute', attrHook);
  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true, svg: true },
      ALLOWED_TAGS,
      ALLOWED_ATTR,
    }) as string;
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute');
  }
}
