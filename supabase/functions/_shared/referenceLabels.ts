/**
 * Canonical, runtime-neutral cross-reference label formatters.
 *
 * This file lives under `supabase/functions` because the edge bundler only
 * deploys local imports from that tree. The browser re-exports this module, so
 * client and backup labels cannot drift into hand-maintained copies.
 */

const CASE_PREFIXES: Record<string, string> = {
  case_study: "CS",
  use_case: "UC",
  living_lab: "LL",
  lighthouse: "LH",
  pilot: "P",
  demonstration: "D",
  challenge: "CH",
};

export function formatWPLabel(wp: { number: number | string | null | undefined; short_name?: string | null }): string {
  return wp.short_name ? `WP${wp.number}: ${wp.short_name}` : `WP${wp.number}`;
}

/**
 * The single rule for the WP chip label form.
 *
 * A WP chip stores `data-wp-show-short-name` to record the form chosen at
 * insertion: "true" → "WP4: Piloting", anything else (including a legacy chip
 * that predates the attribute) → the BARE form "WP4". Every render path —
 * TipTap node, mirrors, PDF/DOCX (`renderRefBadges`) and the backup edge
 * function (`resolveChipLabel`) — must go through here so the surfaces cannot
 * drift apart again.
 */
export function wpShowShortName(attrValue: string | null | undefined): boolean {
  return attrValue === "true";
}

export function formatWPChipLabel(
  wp: { number: number | string | null | undefined; short_name?: string | null },
  showShortNameAttr: string | null | undefined,
): string {
  return formatWPLabel({
    number: wp.number,
    short_name: wpShowShortName(showShortNameAttr) ? wp.short_name ?? null : null,
  });
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

export function formatCaseLabel(
  c: {
    number: number | string | null | undefined;
    case_type: string | null | undefined;
    short_name?: string | null;
    custom_type_name?: string | null;
  },
  flags: { includeNumber: boolean; includeAbbreviation: boolean },
): string {
  const customPrefix = c.case_type === "other" ? (c.custom_type_name ?? "").trim().toUpperCase() : "";
  const prefix = c.case_type ? CASE_PREFIXES[c.case_type] ?? customPrefix : "";
  const abbreviation = flags.includeAbbreviation && prefix ? prefix : "";
  const number = flags.includeNumber && c.number !== null && c.number !== undefined ? String(c.number) : "";
  const combined = `${abbreviation}${number}`;
  return combined || (c.short_name ?? "").trim() || (c.number !== null && c.number !== undefined ? String(c.number) : "");
}

export function formatParticipantLabel(p: { organisation_short_name?: string | null }): string {
  return p.organisation_short_name || "Partner";
}

export function formatFigureLabel(f: { figure_number: string | number | null | undefined }): string {
  return `Figure ${f.figure_number ?? ""}`;
}

export function formatTableLabel(entry: { table_key: string; caption?: string | null }): string {
  const match = entry.table_key.match(/^table-(.+)$/i);
  return `Table ${match ? match[1] : entry.table_key}`;
}

export function formatAcronymLabel(segments: ReadonlyArray<{ text: string }>): string {
  return segments.map((segment) => segment.text).join("");
}