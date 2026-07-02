/**
 * Pure label formatters for cross-references.
 *
 * These produce the exact label strings that reference node renderHTMLs
 * and the syncCrossReferences pipeline write into the document. Extracted
 * from those two call sites verbatim; behaviour-preserving.
 *
 * These are the single source of truth for reference label text. Any UI
 * that resolves a cross-ref to a display string (main editor renderHTML,
 * syncCrossReferences, plain-span resolver in later stages, export) must
 * call these — never inline the string-building.
 */

import { buildCaseLabel, getCaseTypePrefix } from './caseTypeLabels';

export function formatWPLabel(wp: {
  number: number | string | null | undefined;
  short_name?: string | null;
}): string {
  const n = wp.number;
  return wp.short_name ? `WP${n}: ${wp.short_name}` : `WP${n}`;
}

export function formatTaskLabel(t: {
  wp_number: number | string | null | undefined;
  number: number | string | null | undefined;
}): string {
  return `T${t.wp_number ?? ''}.${t.number ?? ''}`;
}

export function formatDeliverableLabel(d: {
  number: string | null | undefined;
}): string {
  return `${d.number ?? ''}`;
}

export function formatMilestoneLabel(m: {
  number: number | string | null | undefined;
}): string {
  return `MS${m.number ?? ''}`;
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
  const prefix = getCaseTypePrefix(c.case_type, c.custom_type_name);
  return buildCaseLabel({
    prefix,
    number: typeof c.number === 'string' ? Number(c.number) : c.number ?? null,
    shortName: c.short_name,
    includeNumber: flags.includeNumber,
    includeAbbreviation: flags.includeAbbreviation,
    withShortName: false,
  });
}

export function formatParticipantLabel(p: {
  organisation_short_name?: string | null;
}): string {
  return p.organisation_short_name || 'Partner';
}

export function formatFigureLabel(f: {
  figure_number: string | number | null | undefined;
}): string {
  return `Figure ${f.figure_number ?? ''}`;
}

/**
 * Format a table cross-ref label from its table_captions row.
 * Compulsory / persisted tables use a `table-{label}` key convention
 * (e.g. `table-3.1.a` → "Table 3.1.a"). Keys that don't match the
 * convention fall back to the raw key so the label remains stable.
 */
export function formatTableLabel(entry: {
  table_key: string;
  caption?: string | null;
}): string {
  const m = entry.table_key.match(/^table-(.+)$/i);
  return `Table ${m ? m[1] : entry.table_key}`;
}
