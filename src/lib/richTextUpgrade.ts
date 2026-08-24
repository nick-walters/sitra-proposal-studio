import DOMPurify from 'dompurify';
import { CROSS_REF_RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';

/**
 * Helpers for fields whose stored format changed from a plain string to HTML.
 *
 * No data migration is run: existing plain strings are upgraded lazily, on
 * read. `ensureRichHtml` escapes and wraps them so they render EXACTLY as
 * before, and the first save from the converted editor rewrites the row in
 * HTML. That keeps old and new rows readable side by side for ever, and
 * avoids a bulk write over live proposals.
 */

/** Cheap test for "this value already contains markup". */
export function looksLikeHtml(value: string): boolean {
  return /<[a-zA-Z][\s\S]*>/.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Plain string → paragraph HTML, preserving blank-line paragraph breaks. */
export function plainTextToHtml(value: string): string {
  const text = String(value ?? '');
  if (!text.trim()) return '';
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Value as HTML, upgrading legacy plain strings on the fly. */
export function ensureRichHtml(value: string | null | undefined): string {
  const text = String(value ?? '');
  if (!text) return '';
  return looksLikeHtml(text) ? text : plainTextToHtml(text);
}

/** Sanitised HTML for read-only display of a converted field. */
export function displayRichHtml(value: string | null | undefined): string {
  const html = ensureRichHtml(value);
  return html ? DOMPurify.sanitize(html, CROSS_REF_RICH_TEXT_CONFIG) : '';
}

/**
 * Collapse an editor's HTML to a single line — used by title fields, where
 * Enter is blocked but a paste can still deliver several paragraphs.
 */
export function collapseToSingleLineHtml(html: string): string {
  return html
    .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s{2,}/g, ' ');
}
