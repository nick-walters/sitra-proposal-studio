/**
 * Normalises cross-reference badge markup that was inserted into plain
 * contentEditable fields (see `contentEditableRefBadges.ts`) so that it
 * renders in the B3.1 read-only mirrors with exactly the same size and
 * style as the badges rendered natively there (e.g. Table 3.1.c).
 *
 * The source markup keeps its data-* attributes; only the presentation
 * styles are re-written, so the transform is idempotent and lossless.
 */

const SERIF = "'Times New Roman', Times, serif";

function resolveColour(el: HTMLElement, fallback = '#000000'): string {
  const inner = el.firstElementChild as HTMLElement | null;
  return (
    el.getAttribute('data-wp-color') ||
    inner?.style.color ||
    el.style.backgroundColor ||
    el.style.color ||
    fallback
  );
}

/** Rebuild a deliverable pentagon to match `DeliverablePentagon` in B31TablesEditor. */
function normaliseDeliverable(el: HTMLElement) {
  const colour = resolveColour(el, '#73C92D');
  const label = (el.textContent || '').trim();

  el.setAttribute(
    'style',
    [
      'display:inline-block',
      `background:${colour}`,
      'padding:1.5px 2.5px 1.5px 1.5px',
      'clip-path:polygon(0% 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 0% 100%)',
      'vertical-align:baseline',
      'white-space:nowrap',
    ].join(';'),
  );

  el.textContent = '';
  const inner = el.ownerDocument.createElement('span');
  inner.textContent = label;
  inner.setAttribute(
    'style',
    [
      'display:inline-block',
      'background:#ffffff',
      `color:${colour}`,
      'padding:0 9px 0 4px',
      'clip-path:polygon(0% 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 0% 100%)',
      `font-family:${SERIF}`,
      'font-size:11pt',
      'font-weight:700',
      'font-style:normal',
      'line-height:14px',
      'white-space:nowrap',
    ].join(';'),
  );
  el.appendChild(inner);
}

/** Rebuild a milestone badge to match `MilestoneBadge` in B31TablesEditor. */
function normaliseMilestone(el: HTMLElement) {
  el.setAttribute(
    'style',
    [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'background:#000000',
      'color:#ffffff',
      `font-family:${SERIF}`,
      'font-size:11pt',
      'font-weight:700',
      'line-height:18px',
      'height:18px',
      'padding:0 4px',
      'clip-path:polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
      'vertical-align:baseline',
      'white-space:nowrap',
    ].join(';'),
  );
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

  return container.innerHTML;
}
