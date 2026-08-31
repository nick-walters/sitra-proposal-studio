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
  'document-table-caption',
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
  // Atomic-badge marker (see refBadgeMarkup.markBadgeElement)
  'data-badge',
  'data-task-reference',
  'data-deliverable-reference',
  'data-deliverable-label',
  'data-deliverable-color',
  'data-milestone-reference',
  'data-task-color',
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
  // Label form chosen at insertion ("WP1" vs "WP1: Needs"). Without this the
  // load-time sanitiser strips the flag and the chip silently collapses to
  // number-only on reload.
  'data-wp-show-short-name',
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
  // Per-type B1.2 binding IDs — must survive save→sanitise→reload so the
  // reconciler can match existing units instead of re-inserting duplicates.
  'data-case-type-id',
  'data-case-type-heading-id',
  // B3.2 mirror slot binding (heading ↔ slot pairing)
  'data-b32-mirror-slot',
  'data-b32-slot-key',
  // B3.2 "Access to critical infrastructure" table atom. Without these the
  // load sanitiser strips the marker attribute, TipTap parses the stored
  // <div data-b32-infra-table> as a bare div and drops it, so the module
  // renders blank in the editor while the Typst output (which reads the
  // stored HTML directly) still shows the table.
  'data-b32-infra-table',
  'data-header',
  // B1.2 Methodologies mirror slot binding (heading ↔ slot pairing). Without
  // these the load sanitiser turns the slot div into a bare <div> (TipTap then
  // drops it) and orphans the heading, so the reconciler appends a duplicate
  // managed set on every reload.
  'data-b12-mirror-slot',
  'data-b12-slot-key',
  'data-b12-run-index',
  'data-b12-subsection-key',
  // Narrow figure sizing/float metadata. These must survive the canonical
  // load sanitiser or TipTap loses cm bounding-box mode before parsing and
  // incorrectly exposes free pixel resize controls.
  'data-max-width-cm',
  'data-narrow',
  'data-float',
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
  'max-width',
  'height',
  'max-height',
  'margin-left',
  'margin-right',
  'margin-top',
  'margin-bottom',
  'display',
  'float',
  'clear',
  'border-color',
  'fill',
  'stroke',
  'stroke-width',
  '--wp-color',
  'user-select',
]);

export const ALLOWED_TAGS = [
  // Block / inline HTML
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'span', 'a',
  'h1', 'h2', 'h3', 'h4', 'sub', 'sup',
  // `colgroup`/`col` (and the per-cell `colwidth` attr below) carry TipTap's
  // persisted table column widths — stripping them silently resets every
  // user-resized table on reload.
  'table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'blockquote',
  // Wrapper for the casesTable NodeView (B1.2)
  'div',
  // SVG (chevrons, diamonds, future inline icons)
  'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
  'ellipse', 'defs', 'use', 'title', 'desc', 'text', 'tspan',
];

export const ALLOWED_ATTR = [
  // HTML
  'class', 'style', 'href', 'target', 'rel', 'src', 'alt', 'contenteditable',
  'width', 'height', 'colspan', 'rowspan', 'colwidth',
  // SVG
  'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'points', 'transform', 'preserveAspectRatio',
  // Data attrs (whitelisted set)
  ...Array.from(ALLOWED_DATA_ATTRS),
];

/** Attributes that identify an element as an atomic cross-reference badge. */
const BADGE_MARKER_ATTRS = [
  'data-badge',
  'data-inline-reference',
  'data-wp-reference', 'data-wp-id',
  'data-task-reference', 'data-task-id',
  'data-deliverable-reference', 'data-deliverable-id',
  'data-milestone-reference', 'data-milestone-id',
  'data-participant-reference', 'data-participant-id',
  'data-case-reference', 'data-case-id',
  'data-acronym-reference',
  'data-fig-table-ref',
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
        ['draggable', 'spellcheck', 'tabindex', 'role'].includes(name)) {
      data.keepAttr = false;
      return;
    }

    // `contenteditable` is editor state everywhere EXCEPT on cross-reference
    // badges, which are atomic islands and must stay non-editable. Losing it
    // here is what lets the caret enter a badge and typing be absorbed into it.
    if (name === 'contenteditable') {
      const isBadge =
        value.toLowerCase() === 'false' &&
        !!node &&
        typeof node.hasAttribute === 'function' &&
        BADGE_MARKER_ATTRS.some((attr: string) => node.hasAttribute(attr));
      // Nested badge layers carry only `contenteditable`; their parent chain
      // is a badge, so keep the attribute whenever the value is `false` and
      // the element sits inside a badge.
      const insideBadge =
        value.toLowerCase() === 'false' &&
        !!node &&
        typeof node.closest === 'function' &&
        !!node.closest(BADGE_MARKER_ATTRS.map((a: string) => `[${a}]`).join(','));
      data.keepAttr = isBadge || insideBadge;
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
      // USE_PROFILES re-applies its default attribute profile over
      // ALLOWED_ATTR, so non-standard attrs must also be added explicitly.
      // `colwidth` is TipTap's per-cell column width — without it every
      // user-resized editor table resets on reload.
      ADD_ATTR: ['colwidth', 'contenteditable'],
    }) as string;
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute');
  }
}
