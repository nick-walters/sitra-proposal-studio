/**
 * Cross-reference chips → Typst.
 *
 * The stored markup for a chip is a nest of spans carrying a baked label, a
 * baked `--wp-color` custom property and a pile of inline styles. None of that
 * is trusted here. Each chip is identified by TYPE and by the id it points at,
 * resolved against a live `RefSnapshot`, and reduced to `(label, colour,
 * weight)`. The span nesting is discarded entirely; the shape is redrawn as a
 * vector in Typst by the helpers in `typstPreamble.ts`.
 *
 * An id that does not resolve falls back to the stored label, exactly as
 * `renderRefBadges` does on screen, so a chip never disappears from the PDF.
 */

import type { RefSnapshot } from '@/lib/referenceData';
import {
  formatCaseLabel,
  formatDeliverableLabel,
  formatMilestoneLabel,
  formatParticipantLabel,
  formatTaskLabel,
  formatWPChipLabel,
} from '@/lib/referenceLabels';

export type ChipKind =
  | 'wp'
  | 'task'
  | 'deliverable'
  | 'milestone'
  | 'participant'
  | 'case'
  | 'acronym';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Live structural nodes carry chip-like attributes but are containers. */
const STRUCTURAL_ATTRS = ['data-case-block', 'data-cases-table-node', 'data-cases-table-nodeview'];

function refId(el: Element, kind: string): string | null {
  const direct = (el.getAttribute(`data-${kind}-id`) || '').trim();
  if (direct) return direct;
  const legacy = (el.getAttribute(`data-${kind}-reference`) || '').trim();
  return UUID_RE.test(legacy) ? legacy : null;
}

/** Which chip type this element is, or null when it is ordinary markup. */
export function chipKind(el: Element): ChipKind | null {
  if (STRUCTURAL_ATTRS.some((a) => el.hasAttribute(a))) return null;
  const refType = el.getAttribute('data-ref-type');
  if (refType === 'task' || refType === 'deliverable' || refType === 'milestone') {
    return refType as ChipKind;
  }
  if (el.hasAttribute('data-acronym-reference')) return 'acronym';
  if (el.hasAttribute('data-participant-reference') || el.hasAttribute('data-participant-id')) {
    return 'participant';
  }
  if (el.hasAttribute('data-task-reference') || el.hasAttribute('data-task-id')) return 'task';
  if (el.hasAttribute('data-deliverable-reference') || el.hasAttribute('data-deliverable-id')) {
    return 'deliverable';
  }
  if (el.hasAttribute('data-milestone-reference') || el.hasAttribute('data-milestone-id')) {
    return 'milestone';
  }
  if (el.hasAttribute('data-case-reference') || el.hasAttribute('data-case-id')) return 'case';
  if (el.hasAttribute('data-wp-reference') || el.hasAttribute('data-wp-id')) return 'wp';
  return null;
}

/* ─────────────────────────────── colours ───────────────────────────────── */

function clampHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

/** Normalises any stored colour form to `#rrggbb`; unparseable → fallback. */
export function toHex(value: string | null | undefined, fallback = '#000000'): string {
  const raw = (value || '').trim();
  if (!raw) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(raw);
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return `#${clampHex(parts[0])}${clampHex(parts[1])}${clampHex(parts[2])}`;
    }
  }
  return fallback;
}

/** Reads the visible label out of a chip's decorative span layers. */
function storedLabel(el: Element): string {
  return (el.textContent || '').trim();
}

/* ───────────────────────────── reduction ───────────────────────────────── */

export interface ReducedChip {
  kind: ChipKind;
  label: string;
  colour: string;
  /** Acronym chips only: coloured segments. */
  segments?: { text: string; color: string }[];
}

export function reduceChip(el: Element, kind: ChipKind, data?: RefSnapshot): ReducedChip | null {
  switch (kind) {
    case 'wp': {
      const wp = data && refId(el, 'wp') ? data.wpById.get(refId(el, 'wp')!) : undefined;
      // `data-wp-show-short-name` decides "WP4" vs "WP4: Needs"; absent → bare.
      const show = el.getAttribute('data-wp-show-short-name');
      const label = wp
        ? formatWPChipLabel(wp, show)
        : formatWPChipLabel(
            {
              number: el.getAttribute('data-wp-number') as unknown as number,
              short_name: el.getAttribute('data-wp-short-name'),
            },
            show,
          ) || storedLabel(el);
      if (!label) return null;
      return { kind, label, colour: toHex(wp?.color || el.getAttribute('data-wp-color')) };
    }
    case 'task': {
      const t = data && refId(el, 'task') ? data.taskById.get(refId(el, 'task')!) : undefined;
      const label = t ? formatTaskLabel(t) : storedLabel(el);
      if (!label) return null;
      return { kind, label, colour: toHex(t?.wp_color || el.getAttribute('data-wp-color')) };
    }
    case 'deliverable': {
      const d = data && refId(el, 'deliverable')
        ? data.deliverableById.get(refId(el, 'deliverable')!)
        : undefined;
      const label = d
        ? formatDeliverableLabel(d)
        : el.getAttribute('data-deliverable-label') || storedLabel(el);
      if (!label) return null;
      return {
        kind,
        label,
        colour: toHex(d?.wp_color || el.getAttribute('data-wp-color'), '#73c92d'),
      };
    }
    case 'milestone': {
      const m = data && refId(el, 'milestone')
        ? data.milestoneById.get(refId(el, 'milestone')!)
        : undefined;
      const label = m ? formatMilestoneLabel(m) : storedLabel(el);
      if (!label) return null;
      return { kind, label, colour: '#000000' };
    }
    case 'participant': {
      const p = data && refId(el, 'participant')
        ? data.participantById.get(refId(el, 'participant')!)
        : undefined;
      const label = p ? formatParticipantLabel(p) : storedLabel(el);
      if (!label) return null;
      return { kind, label, colour: '#000000' };
    }
    case 'case': {
      const c = data && refId(el, 'case') ? data.caseById.get(refId(el, 'case')!) : undefined;
      const label = c
        ? formatCaseLabel(c, {
            includeNumber: c.include_number,
            includeAbbreviation: c.include_abbreviation,
          })
        : storedLabel(el);
      if (!label) return null;
      return { kind, label, colour: toHex(c?.color || el.getAttribute('data-case-color')) };
    }
    case 'acronym': {
      let segments = data?.acronymSegments?.length ? data.acronymSegments : [];
      if (!segments.length) {
        try {
          segments = JSON.parse(el.getAttribute('data-acronym-segments') || '[]');
        } catch {
          segments = [];
        }
      }
      const label = storedLabel(el);
      if (!segments.length && !label) return null;
      return {
        kind,
        label,
        colour: '#000000',
        segments: segments.length ? segments : [{ text: label, color: '#000000' }],
      };
    }
    default:
      return null;
  }
}

function str(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The Typst expression that draws this chip. */
export function chipToTypst(chip: ReducedChip): string {
  switch (chip.kind) {
    case 'wp':
    case 'participant':
      return `chip-pill(${str(chip.label)}, rgb(${str(chip.colour)}), filled: true)`;
    case 'task':
    case 'case':
      return `chip-pill(${str(chip.label)}, rgb(${str(chip.colour)}), filled: false)`;
    case 'deliverable':
      return `chip-deliverable(${str(chip.label)}, rgb(${str(chip.colour)}))`;
    case 'milestone':
      return `chip-milestone(${str(chip.label)})`;
    case 'acronym': {
      const segs = (chip.segments || [])
        .map((s) => `(${str(s.text)}, ${str(toHex(s.color))})`)
        .join(', ');
      return `chip-acronym((${segs}${chip.segments && chip.segments.length === 1 ? ',' : ''}))`;
    }
    default:
      return '';
  }
}
