/**
 * Normalises cross-reference badge markup that was inserted into plain
 * contentEditable fields (see `contentEditableRefBadges.ts`) so that it
 * renders in the B3.1 read-only mirrors with exactly the same size and
 * style as the badges rendered natively there (e.g. Table 3.1.c).
 *
 * The source markup keeps its data-* attributes; only the presentation
 * styles are re-written, so the transform is idempotent and lossless.
 */

import { applyDeliverablePentagon, applyMilestoneBadge, readBadgeLabel } from '@/lib/refBadgeMarkup';

function resolveColour(el: HTMLElement, fallback = '#000000'): string {
  const inner = el.firstElementChild as HTMLElement | null;
  return (
    el.getAttribute('data-wp-color') ||
    el.getAttribute('data-deliverable-color') ||
    el.style.color ||
    inner?.style.color ||
    el.style.backgroundColor ||
    fallback
  );
}

/** Rebuild a deliverable pentagon to match `DeliverablePentagon` in Table 3.1.c. */
function normaliseDeliverable(el: HTMLElement) {
  const colour = resolveColour(el, '#73C92D');
  const label = el.getAttribute('data-deliverable-label') || readBadgeLabel(el);
  applyDeliverablePentagon(el, label, colour);
}

/** Rebuild a milestone badge to match `MilestoneBadge` in Table 3.1.d. */
function normaliseMilestone(el: HTMLElement) {
  applyMilestoneBadge(el, readBadgeLabel(el) || undefined);
}

const BADGE_SELECTOR =
  '[data-deliverable-reference], [data-ref-type="milestone"], [data-milestone-reference], [data-ref-type]';

/**
 * A badge insertion leaves a non-breaking space after the badge so the gap
 * survives in contentEditable. When real text follows, that nbsp must become a
 * normal space, otherwise the space cannot break and gets dragged onto the next
 * line in front of the wrapped word.
 */
function normaliseBadgeSpacing(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(BADGE_SELECTOR).forEach((badge) => {
    const next = badge.nextSibling;
    if (!next || next.nodeType !== Node.TEXT_NODE) return;
    const text = next.textContent ?? '';
    const match = /^[\u00a0 ]+/.exec(text);
    if (!match) return;
    const rest = text.slice(match[0].length);
    if (!rest.trim()) return; // trailing spacer: keep it non-breaking
    next.textContent = ' ' + rest;
  });
}

/**
 * Returns the HTML with all inline reference badges re-styled to the
 * canonical B3.1 mirror presentation. Safe on empty/plain-text input.
 */
export function normalizeRefBadges(html: string | null | undefined): string {
  const raw = (html ?? '').toString();
  if (!raw || typeof document === 'undefined') return raw;
  if (!raw.includes('data-')) return raw;

  const container = document.createElement('div');
  container.innerHTML = raw;

  container.querySelectorAll<HTMLElement>('[data-deliverable-reference]').forEach(normaliseDeliverable);
  container
    .querySelectorAll<HTMLElement>('[data-ref-type="milestone"], [data-milestone-reference]')
    .forEach(normaliseMilestone);
  normaliseBadgeSpacing(container);

  return container.innerHTML;
}
