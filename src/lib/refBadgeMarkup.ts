/**
 * Canonical markup for cross-reference badges, so that badges inserted into
 * plain contentEditable fields render EXACTLY like the badges rendered
 * natively in the B3.1 tables (e.g. `DeliverablePentagon` in Table 3.1.c).
 *
 * Both the inserter (`contentEditableRefBadges.ts`) and the mirror normaliser
 * (`normalizeRefBadges.ts`) build their markup here, so there is a single
 * source of truth for badge geometry.
 */

export const BADGE_SERIF = "'Times New Roman', Times, serif";

const OUTER_CLIP = 'polygon(0% 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 0% 100%)';
const INNER_CLIP = 'polygon(0% 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 0% 100%)';

function styleString(pairs: string[]): string {
  return pairs.join(';');
}

/**
 * Marks an element as an atomic, non-editable badge.
 *
 * Every badge builder MUST call this on the OUTER element and on each nested
 * presentation layer. Without `contenteditable="false"` on every layer the
 * caret can be placed inside a badge, typing is absorbed into it, and
 * Backspace walks into its decorative spans — the markup corruption this
 * guards against.
 */
export function markBadgeElement(el: Element, kind?: string): void {
  el.setAttribute('contenteditable', 'false');
  if (kind) el.setAttribute('data-badge', kind);
  else if (!el.hasAttribute('data-badge')) el.setAttribute('data-badge', '');
}

/** Marks the outer badge plus every descendant element as non-editable. */
export function markBadgeTree(el: Element, kind?: string): void {
  markBadgeElement(el, kind);
  el.querySelectorAll('*').forEach((child) => {
    child.setAttribute('contenteditable', 'false');
  });
}


/**
 * Rewrites `el` into the layered pentagon used by Table 3.1.c:
 * a relatively positioned inline-flex wrapper with two absolutely positioned
 * clipped layers (border colour + white fill) and the label on top.
 */
export function applyDeliverablePentagon(el: HTMLElement, label: string, colour: string): void {
  const trimmed = (colour || '').trim();
  const stroke = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|[a-zA-Z]+)$/.test(trimmed) ? trimmed : '#000000';
  const doc = el.ownerDocument;

  el.setAttribute(
    'style',
    styleString([
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'position:relative',
      'height:17px',
      'padding:0 10px 0 5px',
      `font-family:${BADGE_SERIF}`,
      'font-size:11pt',
      'font-weight:700',
      'font-style:normal',
      'line-height:1',
      `color:${stroke}`,
      'white-space:nowrap',
      'vertical-align:baseline',
      'user-select:none',
    ]),
  );

  el.textContent = '';

  const border = doc.createElement('span');
  border.setAttribute(
    'style',
    styleString([
      'position:absolute',
      'top:0',
      'right:0',
      'bottom:0',
      'left:0',
      `background-color:${stroke}`,
      `clip-path:${OUTER_CLIP}`,
    ]),
  );

  const fill = doc.createElement('span');
  fill.setAttribute(
    'style',
    styleString([
      'position:absolute',
      'top:1.5px',
      'bottom:1.5px',
      'left:1.5px',
      'right:2.5px',
      'background-color:#ffffff',
      `clip-path:${INNER_CLIP}`,
    ]),
  );

  const text = doc.createElement('span');
  text.setAttribute('style', styleString(['position:relative', 'z-index:1']));
  text.textContent = label;

  el.append(border, fill, text);
  markBadgeTree(el, 'deliverable');

}

/** Rewrites `el` into the black milestone chevron used by Table 3.1.d. */
export function applyMilestoneBadge(el: HTMLElement, label?: string): void {
  el.setAttribute(
    'style',
    styleString([
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'background:#000000',
      'color:#ffffff',
      `font-family:${BADGE_SERIF}`,
      'font-size:11pt',
      'font-weight:700',
      'font-style:normal',
      'line-height:18px',
      'height:18px',
      'padding:0 4px',
      'clip-path:polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
      'vertical-align:baseline',
      'white-space:nowrap',
      'user-select:none',
    ]),
  );
  if (label != null) el.textContent = label;
}

/** Reads the visible label of a badge, ignoring the decorative layers. */
export function readBadgeLabel(el: HTMLElement): string {
  const layers = Array.from(el.children) as HTMLElement[];
  const labelled = layers.find((child) => (child.textContent || '').trim().length > 0);
  return ((labelled?.textContent ?? el.textContent) || '').trim();
}
