/**
 * Cross-reference resolution for server-side rendering (the nightly backup
 * DOCX engine).
 *
 * The browser resolves chips against a live snapshot before rendering
 * (`src/lib/renderRefBadges.ts` + `src/lib/referenceLabels.ts`). The backup
 * edge function must produce the SAME label strings, otherwise a backup can
 * disagree with the app about what "D5.4" is.
 *
 * This module is deliberately dependency-free and DOM-free:
 *   - the edge function supplies the parsed attributes,
 *   - the browser test-suite imports the formatters directly and asserts they
 *     are character-identical to `src/lib/referenceLabels.ts`.
 *
 * Rule, identical to the client: a chip id that resolves always wins; an id
 * that does not resolve returns null so the caller keeps the stored label.
 */

import {
  formatAcronymLabel,
  formatCaseLabel,
  formatDeliverableLabel,
  formatFigureLabel,
  formatMilestoneLabel,
  formatParticipantLabel,
  formatTableLabel,
  formatTaskLabel,
  formatWPLabel,
  formatWPChipLabel,
} from "./referenceLabels.ts";

export {
  formatAcronymLabel,
  formatCaseLabel,
  formatDeliverableLabel,
  formatFigureLabel,
  formatMilestoneLabel,
  formatParticipantLabel,
  formatTableLabel,
  formatTaskLabel,
  formatWPLabel,
  formatWPChipLabel,
};

/* ─────────────────────────────── snapshot ──────────────────────────────── */

export interface RefSnapshotServer {
  wpById: Map<string, { id: string; number: number; short_name: string | null }>;
  taskById: Map<string, { id: string; number: number; wp_number: number }>;
  /** `number` is the pre-composed "D{wp}.{n}", matching the client snapshot. */
  deliverableById: Map<string, { id: string; number: string }>;
  milestoneById: Map<string, { id: string; number: number }>;
  caseById: Map<string, {
    id: string;
    number: number;
    case_type: string;
    short_name: string | null;
    custom_type_name: string | null;
    include_number: boolean;
    include_abbreviation: boolean;
  }>;
  participantById: Map<string, { id: string; organisation_short_name: string | null }>;
  figureById: Map<string, { id: string; figure_number: string }>;
  tableCaptionKeys: Set<string>;
  acronymSegments: { text: string; color: string }[];
  /** Internal `ref_key` -> derived display number, from `citationNumbering.ts`. */
  citationNumbers: Map<number, number>;
}

export function emptySnapshot(): RefSnapshotServer {
  return {
    wpById: new Map(),
    taskById: new Map(),
    deliverableById: new Map(),
    milestoneById: new Map(),
    caseById: new Map(),
    participantById: new Map(),
    figureById: new Map(),
    tableCaptionKeys: new Set(),
    acronymSegments: [],
    citationNumbers: new Map(),
  };
}

/* ───────────────────────────── chip resolution ─────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOf(attrs: Record<string, string>, kind: string): string | null {
  const direct = (attrs[`data-${kind}-id`] || "").trim();
  if (direct) return direct;
  const legacy = (attrs[`data-${kind}-reference`] || "").trim();
  return UUID_RE.test(legacy) ? legacy : null;
}

/**
 * Returns the resolved label for a chip, or null when the chip carries no
 * resolvable id (caller keeps the stored text).
 */
export function resolveChipLabel(
  attrs: Record<string, string>,
  snap: RefSnapshotServer,
): string | null {
  const deliverableId = idOf(attrs, "deliverable");
  if (deliverableId) {
    const d = snap.deliverableById.get(deliverableId);
    return d ? formatDeliverableLabel(d) : null;
  }

  const taskId = idOf(attrs, "task");
  if (taskId) {
    const t = snap.taskById.get(taskId);
    return t ? formatTaskLabel(t) : null;
  }

  const milestoneId = idOf(attrs, "milestone");
  if (milestoneId) {
    const m = snap.milestoneById.get(milestoneId);
    return m ? formatMilestoneLabel(m) : null;
  }

  const wpId = idOf(attrs, "wp");
  if (wpId) {
    const wp = snap.wpById.get(wpId);
    // The short-name form is opt-in per chip; legacy chips carry no attribute
    // and stay bare, matching the editor.
    return wp ? formatWPChipLabel(wp, attrs["data-wp-show-short-name"]) : null;
  }

  const caseId = idOf(attrs, "case");
  if (caseId) {
    const c = snap.caseById.get(caseId);
    return c ? formatCaseLabel(c, {
      includeNumber: c.include_number,
      includeAbbreviation: c.include_abbreviation,
    }) : null;
  }

  const participantId = idOf(attrs, "participant");
  if (participantId) {
    const p = snap.participantById.get(participantId);
    return p ? formatParticipantLabel(p) : null;
  }

  if (attrs["data-fig-table-ref"] !== undefined) {
    const figureId = (attrs["data-figure-id"] || "").trim();
    if (figureId) {
      const f = snap.figureById.get(figureId);
      return f ? formatFigureLabel(f) : null;
    }
    const tableKey = (attrs["data-table-key"] || "").trim();
    if (tableKey && snap.tableCaptionKeys.has(tableKey)) {
      return formatTableLabel({ table_key: tableKey });
    }
  }

  if (attrs["data-acronym-reference"] !== undefined && snap.acronymSegments.length > 0) {
    return formatAcronymLabel(snap.acronymSegments);
  }

  return null;
}

/** True when the element's attributes mark it as a cross-reference chip. */
export function isRefChip(attrs: Record<string, string>): boolean {
  return Object.keys(attrs).some((k) =>
    /^data-(wp|task|deliverable|milestone|participant|case|acronym)-(id|reference)$/.test(k)
  ) || attrs["data-fig-table-ref"] !== undefined;
}

/* ────────────────────────────── citations ──────────────────────────────── */

/**
 * Resolves a `data-citation` internal id to the number a reader sees.
 * Returns null when the ref_key is unknown or cited only from hidden or
 * binned content, so the caller keeps whatever text was stored.
 */
export function resolveCitationNumber(
  attrs: Record<string, string>,
  snap: RefSnapshotServer,
): string | null {
  const raw = (attrs["data-citation"] || "").trim();
  if (!raw) return null;
  const refKey = Number.parseInt(raw, 10);
  if (!Number.isFinite(refKey)) return null;
  const display = snap.citationNumbers.get(refKey);
  return display == null ? null : String(display);
}
