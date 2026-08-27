import { supabase } from '@/integrations/supabase/client';

/**
 * Case (pilot) draft subsections now live as real rows in
 * `case_draft_subsections`, one per (case, key). The legacy
 * `case_drafts.subsection_content` jsonb map is kept for one release as a
 * READ-ONLY fallback for any case that has no rows yet.
 *
 * Readers use {@link overlaySubsectionContent} so the existing rendering code
 * (which speaks the jsonb shape) keeps working while the authoritative source
 * is the new table.
 */

export interface CaseSubsectionRow {
  id: string;
  case_id: string;
  proposal_id: string;
  subsection_key: string;
  content_html: string;
  heading: string;
  version: number;
  order_index: number;
}

/** Jsonb-shaped entry, as the legacy map stored it. */
export interface SubsectionEntry {
  heading: string;
  body: string;
}

export type SubsectionMap = Record<string, SubsectionEntry>;

/** Reads the raw body out of a legacy jsonb entry (string OR {heading, body}). */
export function entryBody(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') return String((entry as any).body ?? '');
  return '';
}

/** Reads the heading out of a legacy jsonb entry, if it carried one. */
export function entryHeading(entry: unknown): string {
  if (entry && typeof entry === 'object') return String((entry as any).heading ?? '');
  return '';
}

/** Fetches every subsection row of a proposal, grouped by case id. */
export async function fetchCaseSubsectionsByCase(
  proposalId: string,
): Promise<Map<string, SubsectionMap>> {
  const { data, error } = await (supabase as any)
    .from('case_draft_subsections')
    .select('id, case_id, proposal_id, subsection_key, content_html, heading, version, order_index')
    .eq('proposal_id', proposalId)
    .order('order_index');
  if (error) throw error;
  return groupSubsectionRows((data ?? []) as CaseSubsectionRow[]);
}

/** Fetches the subsection rows of a single case. */
export async function fetchCaseSubsections(caseId: string): Promise<CaseSubsectionRow[]> {
  const { data, error } = await (supabase as any)
    .from('case_draft_subsections')
    .select('id, case_id, proposal_id, subsection_key, content_html, heading, version, order_index')
    .eq('case_id', caseId)
    .order('order_index');
  if (error) throw error;
  return (data ?? []) as CaseSubsectionRow[];
}

export function groupSubsectionRows(rows: CaseSubsectionRow[]): Map<string, SubsectionMap> {
  const byCase = new Map<string, SubsectionMap>();
  for (const r of rows) {
    const map = byCase.get(r.case_id) ?? {};
    map[r.subsection_key] = { heading: r.heading ?? '', body: r.content_html ?? '' };
    byCase.set(r.case_id, map);
  }
  return byCase;
}

/** Turns a case's rows into the jsonb-shaped map the renderers expect. */
export function rowsToSubsectionMap(rows: CaseSubsectionRow[]): SubsectionMap {
  const map: SubsectionMap = {};
  for (const r of rows) map[r.subsection_key] = { heading: r.heading ?? '', body: r.content_html ?? '' };
  return map;
}

/**
 * Replaces each case row's `subsection_content` with the authoritative rows.
 * Cases with no rows keep their legacy jsonb (read-only fallback).
 */
export function overlaySubsectionContent<T extends { id: string; subsection_content?: unknown }>(
  cases: T[],
  byCase: Map<string, SubsectionMap>,
): T[] {
  return cases.map((c) => {
    const rows = byCase.get(c.id);
    if (!rows || Object.keys(rows).length === 0) return c;
    return { ...c, subsection_content: rows };
  });
}
