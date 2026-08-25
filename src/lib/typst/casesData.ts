/**
 * B1.2 cases ("pilots") tables for Typst.
 *
 * The cases table is a TipTap ATOM node — the stored HTML is an empty
 * `<div data-cases-table-node data-case-type-id="…">` and every visible row is
 * fetched and rendered by `CasesTableNodeView` at display time. The Typst
 * converter walks the stored HTML, so the atom used to convert to nothing and
 * the table was missing from the preview entirely.
 *
 * This module re-issues the NodeView's own queries as plain async calls and
 * emits the same layout in Typst: case chip + lead participant on one line,
 * the title, a 2pt rule, then each subsection as a bold-italic run-in heading
 * followed by its body, separated by hairlines.
 */

import { supabase } from '@/integrations/supabase/client';
import { getCaseTypePrefix, buildCaseLabel, getCaseTypeLabel } from '@/lib/caseTypeLabels';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { htmlToTypstBlocks, typstString, type ConvertContext } from './htmlToTypst';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TypstCaseSubsection {
  heading: string;
  bodyHtml: string;
}

export interface TypstCase {
  id: string;
  chipLabel: string;
  colour: string;
  title: string;
  leadLabel: string | null;
  subsections: TypstCaseSubsection[];
}

export interface TypstCasesType {
  id: string;
  captionText: string;
  cases: TypstCase[];
}

export interface CasesTypstData {
  /** Keyed by `proposal_case_types.id`; `''` holds every case (legacy nodes). */
  byType: Map<string, TypstCasesType>;
}

const lit = (s: string) => `t(${typstString(s)})`;

function hasText(html: string | null | undefined): boolean {
  return !!htmlToPlainText((html || '').toString()).replace(/\u00a0/g, ' ').trim();
}

function subsectionsOf(row: any, templates: any[]): TypstCaseSubsection[] {
  const out: TypstCaseSubsection[] = [];
  const seen = new Set<string>();
  const builtins = [
    { key: 'background', heading: row.heading_background, fallback: 'Background', body: row.background_context },
    { key: 'stakeholders', heading: row.heading_stakeholders, fallback: 'Key stakeholders', body: row.key_stakeholders },
    { key: 'solutions', heading: row.heading_solutions, fallback: 'Proposed solutions', body: row.proposed_solutions },
    { key: 'outcomes', heading: row.heading_outcomes, fallback: 'Expected outcomes', body: row.expected_outcomes },
    { key: 'replicability', heading: row.heading_replicability, fallback: 'Replicability', body: row.replicability },
  ];
  const push = (key: string, heading: string, body: string | null | undefined) => {
    if (seen.has(key) || !hasText(body)) return;
    seen.add(key);
    out.push({ heading, bodyHtml: String(body) });
  };

  const json = (row.subsection_content || null) as Record<string, any> | null;
  const ordered = templates
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((t) => t.key as string);

  for (const key of ordered) {
    const tpl = templates.find((t) => t.key === key);
    const builtin = builtins.find((b) => b.key === key);
    const fallbackHeading = builtin?.heading || builtin?.fallback || '';
    const entry = json ? json[key] : null;
    if (entry != null) {
      const body = typeof entry === 'string' ? entry : entry.body || '';
      const heading =
        (typeof entry === 'string' ? '' : entry.heading) || tpl?.heading || fallbackHeading || key;
      push(key, heading, body);
      continue;
    }
    if (builtin) push(key, builtin.heading || tpl?.heading || builtin.fallback, builtin.body);
  }
  for (const b of builtins) push(b.key, b.heading || b.fallback, b.body);
  if (json) {
    for (const key of Object.keys(json)) {
      const entry = json[key];
      if (entry == null) continue;
      const tpl = templates.find((t) => t.key === key);
      const body = typeof entry === 'string' ? entry : entry.body || '';
      const heading = (typeof entry === 'string' ? '' : entry.heading) || tpl?.heading || key;
      push(key, heading, body);
    }
  }
  return out;
}

/** Fetches every case, grouped by type, exactly as the NodeView shows them. */
export async function fetchCasesTypstData(proposalId: string): Promise<CasesTypstData> {
  const [casesRes, tplRes, partsRes, typesRes] = await Promise.all([
    supabase
      .from('case_drafts')
      .select(
        'id, number, short_name, title, case_type, case_type_id, custom_type_name, color, lead_participant_id, order_index, subsection_content, background_context, proposed_solutions, expected_outcomes, replicability, key_stakeholders, heading_background, heading_solutions, heading_outcomes, heading_replicability, heading_stakeholders',
      )
      .eq('proposal_id', proposalId)
      .order('order_index', { ascending: true, nullsFirst: false })
      .order('number', { ascending: true }),
    supabase
      .from('case_subsection_templates')
      .select('id, key, heading, order_index, is_default')
      .eq('proposal_id', proposalId)
      .order('order_index'),
    supabase
      .from('participants')
      .select('id, participant_number, organisation_short_name, organisation_name')
      .eq('proposal_id', proposalId)
      .order('participant_number'),
    supabase
      .from('proposal_case_types')
      .select('id, include_number, include_abbreviation, outline_color, type_code, custom_type_name, caption_text')
      .eq('proposal_id', proposalId),
  ]);

  const cases = (casesRes.data || []) as any[];
  const templates = (tplRes.data || []) as any[];
  const participants = (partsRes.data || []) as any[];
  const types = (typesRes.data || []) as any[];
  const typeById = new Map(types.map((t) => [t.id as string, t]));

  const project = (row: any): TypstCase => {
    const type = row.case_type_id ? typeById.get(row.case_type_id) : undefined;
    const lead = participants.find((p) => p.id === row.lead_participant_id);
    return {
      id: row.id,
      chipLabel: buildCaseLabel({
        prefix: getCaseTypePrefix(row.case_type),
        number: row.number,
        shortName: row.short_name,
        includeNumber: type?.include_number !== false,
        includeAbbreviation: type?.include_abbreviation !== false,
        withShortName: false,
      }),
      colour: type?.outline_color || row.color || '#000000',
      title: (row.title || '').trim(),
      leadLabel: lead
        ? `${lead.participant_number != null ? `${lead.participant_number}. ` : ''}${
            lead.organisation_short_name || lead.organisation_name || ''
          }`
        : null,
      subsections: subsectionsOf(row, templates),
    };
  };

  const byType = new Map<string, TypstCasesType>();
  byType.set('', { id: '', captionText: 'Case descriptions', cases: cases.map(project) });
  for (const type of types) {
    const singular = getCaseTypeLabel(type.type_code, type.custom_type_name, { plural: false });
    byType.set(type.id, {
      id: type.id,
      captionText: (type.caption_text || '').trim() || `${singular} descriptions`,
      cases: cases.filter((c) => c.case_type_id === type.id).map(project),
    });
  }
  return { byType };
}

const RULE = (weight: string) =>
  `block(width: he-table-width, above: 4pt, below: 4pt, line(length: 100%, stroke: ${weight} + black))`;

/**
 * One case type's table. `caption` is already the full "Table 1.2.a." label
 * (the caller owns the position-derived sequence).
 */
export function emitCasesTable(
  data: CasesTypstData,
  caseTypeId: string | null,
  captionLabel: string | null,
  ctx: ConvertContext,
): string[] {
  const group = data.byType.get(caseTypeId || '');
  if (!group || !group.cases.length) return [];

  const out: string[] = [];
  if (captionLabel) {
    out.push(`he-caption(${typstString(captionLabel)}, ${lit(group.captionText)})`);
  }

  for (const c of group.cases) {
    const chip = `chip-pill(${typstString(c.chipLabel)}, rgb(${typstString(c.colour)}))`;
    const lead = c.leadLabel
      ? `chip-pill(${typstString(c.leadLabel)}, black, filled: true)`
      : lit('');
    out.push(
      `block(width: he-table-width, above: 6pt, below: 2pt, grid(columns: (1fr, auto), align: (left + horizon, right + horizon), ${chip}, ${lead}))`,
    );
    if (c.title) out.push(`par(justify: false, strong(${lit(c.title)}))`);
    out.push(RULE('2pt'));

    c.subsections.forEach((s, index) => {
      const heading = s.heading.trim();
      const blocks = htmlToTypstBlocks(s.bodyHtml, ctx);
      if (heading) {
        out.push(`par(justify: false, strong(emph(${lit(`${heading}:`)})))`);
      }
      out.push(...blocks);
      out.push(RULE(index === c.subsections.length - 1 ? '2pt' : '0.5pt'));
    });
  }
  return out;
}
