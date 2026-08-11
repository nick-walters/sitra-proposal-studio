/**
 * hydrateRefBadges — re-applies cross-reference badge presentation to stored
 * rich-text HTML that is rendered OUTSIDE a TipTap editor.
 *
 * Why this is needed:
 *  - Badges are stored with their identity in `data-*` attributes and their
 *    label as text content (see `contentEditableRefBadges.ts` and the
 *    TipTap reference nodes).
 *  - The canonical save-time sanitiser (`sanitizeEditorHtml`) keeps a narrow
 *    STYLE_ALLOWLIST that does NOT include background-color, border,
 *    padding, border-radius or font-family. So a stored participant badge
 *    keeps only `color: #ffffff` — white text with no pill behind it, which
 *    reads as an empty, selectable blank space.
 *  - Inside an editor this never shows, because TipTap re-parses the data
 *    attributes into a node and regenerates the full inline styles from
 *    `renderHTML`. This helper is the same idea for read-only HTML: rebuild
 *    presentation from the data attributes.
 *
 * Idempotent and lossless: only presentation styles are (re)written.
 */

import {
  applyDeliverablePentagon,
  applyMilestoneBadge,
  readBadgeLabel,
  BADGE_SERIF,
} from '@/lib/refBadgeMarkup';

const MISSING_LABEL = '[missing reference]';

function markMissing(el: HTMLElement) {
  el.setAttribute(
    'style',
    [
      'display:inline',
      `font-family:${BADGE_SERIF}`,
      'font-style:italic',
      'color:#6b7280',
      'white-space:nowrap',
    ].join('; '),
  );
  el.textContent = MISSING_LABEL;
}

function pill(el: HTMLElement, opts: { label: string; background: string; text: string; border: string }) {
  el.setAttribute(
    'style',
    [
      'display:inline-flex',
      'align-items:center',
      `background-color: ${opts.background}`,
      `border: 1.5px solid ${opts.border}`,
      'padding:0 5px',
      'border-radius: 9999px',
      `font-family:${BADGE_SERIF}`,
      'font-size:11pt',
      'font-weight:700',
      'font-style:normal',
      'line-height:1',
      `color: ${opts.text}`,
      'white-space:nowrap',
      'vertical-align:baseline',
      'user-select:none',
    ].join('; '),
  );
  el.textContent = opts.label;
}

/** Colour retained from the stored style (`color` survives the sanitiser). */
function retainedColour(el: HTMLElement, fallback: string): string {
  const own = el.style.color;
  const inner = (el.firstElementChild as HTMLElement | null)?.style?.color;
  const candidate = (own || inner || '').trim();
  if (!candidate) return fallback;
  // White text means the colour lived on a stripped background — useless here.
  if (/^(#fff(fff)?|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i.test(candidate)) return fallback;
  return candidate;
}

function hydrateParticipant(el: HTMLElement) {
  const label =
    (el.getAttribute('data-participant-short-name') || '').trim() ||
    readBadgeLabel(el) ||
    (el.getAttribute('data-participant-number')
      ? `P${el.getAttribute('data-participant-number')}`
      : '');
  if (!label) return markMissing(el);
  pill(el, { label, background: '#000000', text: '#ffffff', border: '#000000' });
}

function hydrateWp(el: HTMLElement) {
  const colour = el.getAttribute('data-wp-color') || retainedColour(el, '#000000');
  const number = el.getAttribute('data-wp-number');
  const shortName = el.getAttribute('data-wp-short-name');
  const label =
    readBadgeLabel(el) ||
    (number ? `WP${number}${shortName ? `: ${shortName}` : ''}` : '');
  if (!label) return markMissing(el);
  pill(el, { label, background: colour, text: '#ffffff', border: colour });
}

function hydrateCase(el: HTMLElement) {
  const colour = el.getAttribute('data-case-color') || retainedColour(el, '#000000');
  const label = readBadgeLabel(el);
  if (!label) return markMissing(el);
  pill(el, { label, background: '#ffffff', text: colour, border: colour });
}

function hydrateTask(el: HTMLElement) {
  const colour =
    el.getAttribute('data-wp-color') ||
    el.getAttribute('data-task-color') ||
    retainedColour(el, '#000000');
  const label = readBadgeLabel(el);
  if (!label) return markMissing(el);
  pill(el, { label, background: '#ffffff', text: colour, border: colour });
}

function hydrateDeliverable(el: HTMLElement) {
  const label = el.getAttribute('data-deliverable-label') || readBadgeLabel(el);
  if (!label) return markMissing(el);
  const colour =
    el.getAttribute('data-wp-color') ||
    el.getAttribute('data-deliverable-color') ||
    retainedColour(el, '#73C92D');
  applyDeliverablePentagon(el, label, colour);
}

function hydrateMilestone(el: HTMLElement) {
  const label =
    readBadgeLabel(el) ||
    (el.getAttribute('data-milestone-number')
      ? `MS${el.getAttribute('data-milestone-number')}`
      : '');
  if (!label) return markMissing(el);
  applyMilestoneBadge(el, label);
}

function hydrateAcronym(el: HTMLElement) {
  const label = (el.textContent || '').trim();
  let segments: { text: string; color: string }[] = [];
  try {
    const raw = el.getAttribute('data-acronym-segments');
    if (raw) segments = JSON.parse(raw);
  } catch {
    segments = [];
  }
  if (!label && segments.length === 0) return markMissing(el);
  el.setAttribute(
    'style',
    [
      'display:inline',
      "font-family:'Arial Black', Arial, sans-serif",
      'font-weight:900',
      'font-size:inherit',
      'white-space:nowrap',
      'vertical-align:baseline',
      'user-select:none',
    ].join('; '),
  );
  if (segments.length > 0) {
    el.textContent = '';
    for (const seg of segments) {
      const s = el.ownerDocument.createElement('span');
      s.setAttribute('style', `color:${seg.color}`);
      s.textContent = seg.text;
      el.appendChild(s);
    }
  }
}

function hydrateFigTableRef(el: HTMLElement) {
  const label = (el.textContent || '').trim();
  if (!label) return markMissing(el);
  el.setAttribute(
    'style',
    [
      'font-style:italic',
      'font-weight:700',
      'white-space:nowrap',
      'vertical-align:baseline',
    ].join('; '),
  );
}

/**
 * Returns the HTML with every inline reference badge re-styled to its
 * canonical presentation. Safe on empty/plain-text input and on SSR
 * (returns the input unchanged when there is no DOM).
 */
export function hydrateRefBadges(html: string | null | undefined): string {
  const raw = (html ?? '').toString();
  if (!raw || typeof document === 'undefined') return raw;
  if (!raw.includes('data-')) return raw;

  const tpl = document.createElement('template');
  tpl.innerHTML = raw;
  const root = tpl.content;

  root.querySelectorAll<HTMLElement>('[data-participant-reference]').forEach(hydrateParticipant);
  root.querySelectorAll<HTMLElement>('[data-wp-reference]').forEach(hydrateWp);
  root.querySelectorAll<HTMLElement>('[data-case-reference]').forEach(hydrateCase);
  root
    .querySelectorAll<HTMLElement>('[data-task-reference], [data-inline-reference][data-ref-type="task"]')
    .forEach(hydrateTask);
  root
    .querySelectorAll<HTMLElement>(
      '[data-deliverable-reference], [data-inline-reference][data-ref-type="deliverable"]',
    )
    .forEach(hydrateDeliverable);
  root
    .querySelectorAll<HTMLElement>(
      '[data-milestone-reference], [data-inline-reference][data-ref-type="milestone"]',
    )
    .forEach(hydrateMilestone);
  root.querySelectorAll<HTMLElement>('[data-acronym-reference]').forEach(hydrateAcronym);
  root.querySelectorAll<HTMLElement>('[data-fig-table-ref]').forEach(hydrateFigTableRef);

  const out = document.createElement('div');
  out.appendChild(root.cloneNode(true));
  return out.innerHTML;
}

export default hydrateRefBadges;
