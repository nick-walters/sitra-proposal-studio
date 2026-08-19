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

/* ───────────────────────────── label formatters ─────────────────────────── */

export function formatWPLabel(wp: { number: number | string | null | undefined; short_name?: string | null }): string {
  const n = wp.number;
  return wp.short_name ? `WP${n}: ${wp.short_name}` : `WP${n}`;
}

export function formatTaskLabel(t: {
  wp_number: number | string | null | undefined;
  number: number | string | null | undefined;
}): string {
  return `T${t.wp_number ?? ""}.${t.number ?? ""}`;
}

export function formatDeliverableLabel(d: { number: string | null | undefined }): string {
  return `${d.number ?? ""}`;
}

export function formatMilestoneLabel(m: { number: number | string | null | undefined }): string {
  return `MS${m.number ?? ""}`;
}

export function formatParticipantLabel(p: { organisation_short_name?: string | null }): string {
  return p.organisation_short_name || "Partner";
}

export function formatFigureLabel(f: { figure_number: string | number | null | undefined }): string {
  return `Figure ${f.figure_number ?? ""}`;
}

export function formatTableLabel(entry: { table_key: string }): string {
  const m = entry.table_key.match(/^table-(.+)$/i);
  return `Table ${m ? m[1] : entry.table_key}`;
}

/* ─────────────────────────────── snapshot ──────────────────────────────── */

export interface RefSnapshotServer {
  wpById: Map<string, { id: string; number: number; short_name: string | null }>;
  taskById: Map<string, { id: string; number: number; wp_number: number }>;
  /** `number` is the pre-composed "D{wp}.{n}", matching the client snapshot. */
  deliverableById: Map<string, { id: string; number: string }>;
  milestoneById: Map<string, { id: string; number: number }>;
  participantById: Map<string, { id: string; organisation_short_name: string | null }>;
  figureById: Map<string, { id: string; figure_number: string }>;
  tableCaptionKeys: Set<string>;
}

export function emptySnapshot(): RefSnapshotServer {
  return {
    wpById: new Map(),
    taskById: new Map(),
    deliverableById: new Map(),
    milestoneById: new Map(),
    participantById: new Map(),
    figureById: new Map(),
    tableCaptionKeys: new Set(),
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
    return wp ? formatWPLabel(wp) : null;
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

  return null;
}

/** True when the element's attributes mark it as a cross-reference chip. */
export function isRefChip(attrs: Record<string, string>): boolean {
  return Object.keys(attrs).some((k) =>
    /^data-(wp|task|deliverable|milestone|participant|case|acronym)-(id|reference)$/.test(k)
  ) || attrs["data-fig-table-ref"] !== undefined;
}
