/**
 * B3.2 "Access to critical infrastructure" table for Typst.
 *
 * The table is a TipTap ATOM node — the stored HTML is an empty
 * `<div data-b32-infra-table data-heading="…">` and the rows are read live
 * from A2. This module re-issues the NodeView's query as a plain async call
 * and emits the same one-column table: the participant's 200-character
 * "how it will support the project" notes, semicolon-separated, followed by
 * the participant badge. Participants with no such note have no row.
 */

import { supabase } from '@/integrations/supabase/client';
import { typstString, type ConvertContext } from './htmlToTypst';

export interface B32InfraRow {
  text: string;
  badgeLabel: string;
}

export interface B32InfraTypstData {
  rows: B32InfraRow[];
}

const lit = (s: string) => `t(${typstString(s)})`;

export async function fetchB32InfraTypstData(proposalId: string): Promise<B32InfraTypstData> {
  const partsR = await supabase
    .from('participants')
    .select('id, participant_number, organisation_short_name, organisation_name')
    .eq('proposal_id', proposalId)
    .order('participant_number', { ascending: true });
  const participants = partsR.data || [];
  if (participants.length === 0) return { rows: [] };

  const infraR = await supabase
    .from('participant_infrastructure')
    .select('participant_id, project_support, order_index')
    .in(
      'participant_id',
      participants.map((p) => p.id),
    )
    .order('order_index', { ascending: true });

  const byParticipant = new Map<string, string[]>();
  for (const item of (infraR.data || []) as {
    participant_id: string;
    project_support: string | null;
  }[]) {
    const text = (item.project_support || '').trim().replace(/[;.\s]+$/, '');
    if (!text) continue;
    const list = byParticipant.get(item.participant_id) || [];
    list.push(text);
    byParticipant.set(item.participant_id, list);
  }

  const rows: B32InfraRow[] = [];
  for (const p of participants) {
    const notes = byParticipant.get(p.id) || [];
    if (notes.length === 0) continue;
    const short = p.organisation_short_name || p.organisation_name || '';
    rows.push({
      text: notes.join('; '),
      badgeLabel: `${p.participant_number != null ? `${p.participant_number}. ` : ''}${short}`.trim(),
    });
  }
  return { rows };
}

/** `captionLabel` is the full position-derived label, e.g. "Table 3.2.b.". */
export function emitB32InfraTable(
  data: B32InfraTypstData,
  heading: string,
  captionLabel: string | null,
  _ctx: ConvertContext,
): string[] {
  if (!data.rows.length) return [];
  const out: string[] = [];
  if (captionLabel) {
    out.push(`he-caption(${typstString(captionLabel)}, ${lit('Access to critical infrastructure')})`);
  }
  const cells = [
    `table.header(table.cell(par(justify: false, strong(${lit(heading)}))))`,
    ...data.rows.map(
      (r) =>
        `table.cell(par(justify: false, ${lit(r.text)} + t(" ") + chip-pill(${typstString(
          r.badgeLabel,
        )}, black, filled: true)))`,
    ),
  ];
  out.push(`he-authored-table((1fr,), (${cells.join(', ')},), ${data.rows.length + 1})`);
  return out;
}
