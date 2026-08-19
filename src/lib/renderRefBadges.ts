/**
 * renderRefBadges — the single read-only rendering path for cross-reference
 * chips outside a TipTap editor (mirrors, PDF/Word export containers).
 *
 * It does two things in ONE DOM pass:
 *
 *  1. RESOLUTION. Every chip carries the id of the thing it points at. The
 *     number/colour baked into the stored markup is only a fallback. Given a
 *     `RefSnapshot` (see `referenceData.ts`) the id wins: the label is
 *     recomputed with the shared formatters in `referenceLabels.ts` — exactly
 *     the strings the editors render via `resolveReferenceJson`. An id that
 *     does NOT resolve (deleted item, chip from another proposal, no snapshot
 *     supplied) keeps its stored label, so a chip never renders blank.
 *
 *  2. PRESENTATION. The save-time sanitiser keeps a narrow style allowlist, so
 *     stored chips lose their pill/pentagon geometry. This rebuilds it from the
 *     data attributes, identically to the badges drawn natively in the B3.1
 *     tables.
 *
 * Nothing here writes to the database — resolution is render-time only.
 * Idempotent: running it twice yields the same markup.
 */

import type { RefSnapshot } from './referenceData';
import {
  formatWPLabel,
  formatTaskLabel,
  formatDeliverableLabel,
  formatMilestoneLabel,
  formatCaseLabel,
  formatParticipantLabel,
  formatFigureLabel,
  formatTableLabel,
} from './referenceLabels';

export const BADGE_SERIF = "'Times New Roman', Times, serif";

const OUTER_CLIP = 'polygon(0% 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 0% 100%)';
const INNER_CLIP = 'polygon(0% 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 0% 100%)';
const MISSING_LABEL = '[missing reference]';

function styleString(pairs: string[]): string {
  return pairs.join(';');
}

/* ────────────────────────── atomic badge marking ────────────────────────── */

/**
 * Marks an element as an atomic, non-editable badge.
 *
 * Every badge builder MUST call this on the OUTER element and on each nested
 * presentation layer. Without `contenteditable="false"` on every layer the
 * caret can be placed inside a badge, typing is absorbed into it, and
 * Backspace walks into its decorative spans.
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

/* ─────────────────────────────── geometry ──────────────────────────────── */

/**
 * Rewrites `el` into the layered pentagon used by Table 3.1.c: a relatively
 * positioned inline-flex wrapper with two absolutely positioned clipped
 * layers (border colour + white fill) and the label on top.
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
  markBadgeTree(el, 'milestone');
}

/** Reads the visible label of a badge, ignoring the decorative layers. */
export function readBadgeLabel(el: HTMLElement): string {
  const layers = Array.from(el.children) as HTMLElement[];
  const labelled = layers.find((child) => (child.textContent || '').trim().length > 0);
  return ((labelled?.textContent ?? el.textContent) || '').trim();
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
  markBadgeElement(el, 'pill');
}

function markMissing(el: HTMLElement) {
  el.setAttribute(
    'style',
    [
      'display:inline',
      `font-family:${BADGE_SERIF}`,
      'font-style:italic',
      'color:#6b7280',
      'white-space:nowrap',
      'user-select:none',
    ].join('; '),
  );
  el.textContent = MISSING_LABEL;
  markBadgeElement(el, 'missing');
}

/** Colour retained from the stored style (`color` survives the sanitiser). */
function retainedColour(el: HTMLElement, fallback: string): string {
  const own = el.style.color;
  const inner = (el.firstElementChild as HTMLElement | null)?.style?.color;
  let candidate = (own || inner || '').trim();
  if (!candidate) {
    // Deliverable pentagons keep their colour on the SVG stroke or on a
    // nested label span rather than on the wrapper itself.
    const stroke = el.querySelector('[stroke]')?.getAttribute('stroke');
    const nested = Array.from(el.querySelectorAll<HTMLElement>('[style]'))
      .map((n) => n.style.color)
      .find((c) => c && c.trim());
    candidate = (stroke || nested || '').trim();
  }
  if (!candidate) return fallback;
  // White text means the colour lived on a stripped background — useless here.
  if (/^(#fff(fff)?|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i.test(candidate)) return fallback;
  return candidate;
}

/* ───────────────────────────── id resolution ───────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads the referenced id. Modern chips carry `data-{kind}-id`; some legacy
 * chips put the id in `data-{kind}-reference` instead (that attribute is a
 * bare marker on newer markup, hence the UUID shape check).
 */
function refId(el: HTMLElement, kind: string): string | null {
  const direct = (el.getAttribute(`data-${kind}-id`) || '').trim();
  if (direct) return direct;
  const legacy = (el.getAttribute(`data-${kind}-reference`) || '').trim();
  return UUID_RE.test(legacy) ? legacy : null;
}

/** Rewrites the id-bearing `data-*` attributes so exports carry fresh values. */
function writeBack(el: HTMLElement, attrs: Record<string, string | number | null | undefined>) {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === '') continue;
    el.setAttribute(name, String(value));
  }
}

/* ───────────────────────── per-kind render functions ───────────────────── */

function renderParticipant(el: HTMLElement, data?: RefSnapshot) {
  const p = data && refId(el, 'participant') ? data.participantById.get(refId(el, 'participant')!) : undefined;
  if (p) {
    writeBack(el, {
      'data-participant-number': p.participant_number,
      'data-participant-short-name': p.organisation_short_name,
    });
  }
  const label =
    (p ? formatParticipantLabel(p) : '') ||
    (el.getAttribute('data-participant-short-name') || '').trim() ||
    readBadgeLabel(el) ||
    (el.getAttribute('data-participant-number') ? `P${el.getAttribute('data-participant-number')}` : '');
  if (!label) return markMissing(el);
  pill(el, { label, background: '#000000', text: '#ffffff', border: '#000000' });
}

function renderWp(el: HTMLElement, data?: RefSnapshot) {
  const wp = data && refId(el, 'wp') ? data.wpById.get(refId(el, 'wp')!) : undefined;
  if (wp) {
    writeBack(el, {
      'data-wp-number': wp.number,
      'data-wp-short-name': wp.short_name,
      'data-wp-color': wp.color,
    });
  }
  const colour = wp?.color || el.getAttribute('data-wp-color') || retainedColour(el, '#000000');
  const number = el.getAttribute('data-wp-number');
  const shortName = el.getAttribute('data-wp-short-name');
  const label = wp
    ? formatWPLabel(wp)
    : readBadgeLabel(el) || (number ? formatWPLabel({ number, short_name: shortName }) : '');
  if (!label) return markMissing(el);
  pill(el, { label, background: colour, text: '#ffffff', border: colour });
}

function renderCase(el: HTMLElement, data?: RefSnapshot) {
  const c = data && refId(el, 'case') ? data.caseById.get(refId(el, 'case')!) : undefined;
  if (c) {
    writeBack(el, {
      'data-case-number': c.number,
      'data-case-short-name': c.short_name,
      'data-case-color': c.color,
      'data-case-type': c.case_type,
    });
  }
  const colour = c?.color || el.getAttribute('data-case-color') || retainedColour(el, '#000000');
  const label = c
    ? formatCaseLabel(c, { includeNumber: c.include_number, includeAbbreviation: c.include_abbreviation })
    : readBadgeLabel(el);
  if (!label) return markMissing(el);
  pill(el, { label, background: '#ffffff', text: colour, border: colour });
}

function renderTask(el: HTMLElement, data?: RefSnapshot) {
  const t = data && refId(el, 'task') ? data.taskById.get(refId(el, 'task')!) : undefined;
  if (t) {
    writeBack(el, {
      'data-task-number': t.number,
      'data-wp-number': t.wp_number,
      'data-task-label': formatTaskLabel(t),
      'data-wp-color': t.wp_color,
    });
  }
  const colour =
    t?.wp_color ||
    el.getAttribute('data-wp-color') ||
    el.getAttribute('data-task-color') ||
    retainedColour(el, '#000000');
  const label = t ? formatTaskLabel(t) : readBadgeLabel(el);
  if (!label) return markMissing(el);
  pill(el, { label, background: '#ffffff', text: colour, border: colour });
}

function renderDeliverable(el: HTMLElement, data?: RefSnapshot) {
  const d = data && refId(el, 'deliverable') ? data.deliverableById.get(refId(el, 'deliverable')!) : undefined;
  if (d) {
    writeBack(el, {
      'data-deliverable-label': formatDeliverableLabel(d),
      'data-wp-color': d.wp_color,
    });
  }
  const label = d
    ? formatDeliverableLabel(d)
    : el.getAttribute('data-deliverable-label') || readBadgeLabel(el);
  if (!label) return markMissing(el);
  const colour =
    d?.wp_color ||
    el.getAttribute('data-wp-color') ||
    el.getAttribute('data-deliverable-color') ||
    retainedColour(el, '#73C92D');
  applyDeliverablePentagon(el, label, colour);
}

function renderMilestone(el: HTMLElement, data?: RefSnapshot) {
  const m = data && refId(el, 'milestone') ? data.milestoneById.get(refId(el, 'milestone')!) : undefined;
  if (m) writeBack(el, { 'data-milestone-number': m.number });
  const label = m
    ? formatMilestoneLabel(m)
    : readBadgeLabel(el) ||
      (el.getAttribute('data-milestone-number') ? `MS${el.getAttribute('data-milestone-number')}` : '');
  if (!label) return markMissing(el);
  applyMilestoneBadge(el, label);
}

function renderAcronym(el: HTMLElement, data?: RefSnapshot) {
  const label = (el.textContent || '').trim();
  let segments: { text: string; color: string }[] = [];
  if (data?.acronymSegments.length) {
    segments = data.acronymSegments;
  } else {
    try {
      const raw = el.getAttribute('data-acronym-segments');
      if (raw) segments = JSON.parse(raw);
    } catch {
      segments = [];
    }
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
  markBadgeTree(el, 'acronym');
}

function renderFigTableRef(el: HTMLElement, data?: RefSnapshot) {
  const figureId = (el.getAttribute('data-figure-id') || '').trim();
  const tableKey = (el.getAttribute('data-table-key') || '').trim();
  let label = (el.textContent || '').trim();
  if (data && figureId) {
    const f = data.figureById.get(figureId);
    if (f) label = formatFigureLabel(f);
  } else if (data && tableKey && data.tableCaptionMap.has(tableKey)) {
    label = formatTableLabel({ table_key: tableKey, caption: data.tableCaptionMap.get(tableKey) });
  }
  if (!label) return markMissing(el);
  el.textContent = label;
  el.setAttribute(
    'style',
    [
      'font-style:italic',
      'font-weight:700',
      'white-space:nowrap',
      'vertical-align:baseline',
      'user-select:none',
    ].join('; '),
  );
  markBadgeElement(el, 'fig-table');
}

/* ────────────────────────── badge spacing hygiene ──────────────────────── */

const SPACING_SELECTOR =
  '[data-deliverable-reference], [data-ref-type="milestone"], [data-milestone-reference], [data-ref-type]';

/**
 * A badge insertion leaves a non-breaking space after the badge so the gap
 * survives in contentEditable. When real text follows, that nbsp must become a
 * normal space, otherwise the space cannot break and gets dragged onto the
 * next line in front of the wrapped word.
 */
function normaliseBadgeSpacing(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(SPACING_SELECTOR).forEach((badge) => {
    const next = badge.nextSibling;
    if (!next || next.nodeType !== 3 /* TEXT_NODE */) return;
    const text = next.textContent ?? '';
    const match = /^[\u00a0 ]+/.exec(text);
    if (!match) return;
    const rest = text.slice(match[0].length);
    if (!rest.trim()) return; // trailing spacer: keep it non-breaking
    next.textContent = ' ' + rest;
  });
}

/* ─────────────────────────────── entry points ──────────────────────────── */

// `data-*-id` variants cover badges inserted into plain fields (WP drafts),
// which carry only the identity attribute.
const NOT_OTHER = ':not([data-task-id]):not([data-deliverable-id]):not([data-milestone-id])';

/**
 * Resolves and re-styles every cross-reference chip inside `root`, in place.
 * Pass the snapshot once per render pass — never fetch per chip.
 */
export function resolveRefBadgesInDom(root: ParentNode, data?: RefSnapshot): void {
  root
    .querySelectorAll<HTMLElement>('[data-participant-reference], [data-participant-id]')
    .forEach((el) => renderParticipant(el, data));
  root
    .querySelectorAll<HTMLElement>(`[data-wp-reference], [data-wp-id]${NOT_OTHER}:not([data-ref-type])`)
    .forEach((el) => renderWp(el, data));
  root
    .querySelectorAll<HTMLElement>('[data-case-reference], [data-case-id]')
    .forEach((el) => renderCase(el, data));
  root
    .querySelectorAll<HTMLElement>(
      '[data-task-reference], [data-task-id], [data-inline-reference][data-ref-type="task"]',
    )
    .forEach((el) => renderTask(el, data));
  root
    .querySelectorAll<HTMLElement>(
      '[data-deliverable-reference], [data-deliverable-id], [data-inline-reference][data-ref-type="deliverable"]',
    )
    .forEach((el) => renderDeliverable(el, data));
  root
    .querySelectorAll<HTMLElement>(
      '[data-milestone-reference], [data-milestone-id], [data-inline-reference][data-ref-type="milestone"]',
    )
    .forEach((el) => renderMilestone(el, data));
  root
    .querySelectorAll<HTMLElement>('[data-acronym-reference]')
    .forEach((el) => renderAcronym(el, data));
  root
    .querySelectorAll<HTMLElement>('[data-fig-table-ref]')
    .forEach((el) => renderFigTableRef(el, data));

  normaliseBadgeSpacing(root);
}

/**
 * Returns `html` with every cross-reference chip resolved against `data` and
 * re-styled. Safe on empty/plain-text input and on SSR (returns the input
 * unchanged when there is no DOM).
 */
export function renderRefBadges(html: string | null | undefined, data?: RefSnapshot): string {
  const raw = (html ?? '').toString();
  if (!raw || typeof document === 'undefined') return raw;
  if (!raw.includes('data-')) return raw;

  const tpl = document.createElement('template');
  tpl.innerHTML = raw;
  resolveRefBadgesInDom(tpl.content, data);

  const out = document.createElement('div');
  out.appendChild(tpl.content.cloneNode(true));
  return out.innerHTML;
}

export default renderRefBadges;
