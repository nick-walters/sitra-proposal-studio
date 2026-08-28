/**
 * B3.2 "Access to critical infrastructure" table (prompt 138, reinstated 145).
 *
 * The table is a one-column table: one row per participant, holding ONLY that
 * participant's 200-character `project_support` notes joined by semicolons and
 * followed by the participant badge. The older 500-character portal
 * descriptions (`participant_infrastructure.description`) are deliberately NOT
 * shown here.
 *
 * A participant with no `project_support` entries produces no row; when no
 * participant has any, the table renders nothing at all.
 *
 * This module is shared by the editor NodeView and the Typst exporter so the
 * board and the PDF always agree.
 */

import { supabase } from '@/integrations/supabase/client';
import { typstString, type ConvertContext } from './htmlToTypst';

export const B32_INFRA_TABLE_KEY = 'b32-infra-table';
export const B32_INFRA_DEFAULT_CAPTION = 'Access to critical infrastructure';

export interface B32InfraSupportRow {
  participantId: string;
  number: number | null;
  shortName: string;
  /** The participant's project_support notes, in A2 order. */
  notes: string[];
}

export interface B32InfraTableData {
  rows: B32InfraSupportRow[];
  caption: string;
}

export async function fetchB32InfraTableData(proposalId: string): Promise<B32InfraTableData> {
  if (!proposalId) return { rows: [], caption: B32_INFRA_DEFAULT_CAPTION };

  const [partsR, capR] = await Promise.all([
    supabase
      .from('participants')
      .select('id, participant_number, organisation_short_name')
      .eq('proposal_id', proposalId),
    supabase
      .from('table_captions')
      .select('table_key, caption')
      .eq('proposal_id', proposalId)
      .eq('table_key', B32_INFRA_TABLE_KEY)
      .maybeSingle(),
  ]);
  if (partsR.error) throw partsR.error;

  const participants = (partsR.data || [])
    .map((p) => ({
      id: p.id as string,
      number: (p.participant_number ?? null) as number | null,
      shortName: (p.organisation_short_name ?? '') as string,
    }))
    .sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));

  const caption = (capR.data?.caption as string | undefined) || B32_INFRA_DEFAULT_CAPTION;
  if (participants.length === 0) return { rows: [], caption };

  const infraR = await supabase
    .from('participant_infrastructure')
    .select('participant_id, project_support, order_index')
    .in(
      'participant_id',
      participants.map((p) => p.id),
    );
  if (infraR.error) throw infraR.error;

  const byParticipant = new Map<string, { note: string; order: number }[]>();
  for (const item of infraR.data || []) {
    const note = String((item as { project_support: string | null }).project_support || '').trim();
    if (!note) continue;
    const list = byParticipant.get(item.participant_id) || [];
    list.push({ note, order: (item as { order_index: number | null }).order_index ?? 9999 });
    byParticipant.set(item.participant_id, list);
  }

  const rows: B32InfraSupportRow[] = [];
  for (const p of participants) {
    const list = byParticipant.get(p.id);
    if (!list || list.length === 0) continue;
    rows.push({
      participantId: p.id,
      number: p.number,
      shortName: p.shortName,
      notes: list.sort((a, b) => a.order - b.order).map((l) => l.note),
    });
  }

  return { rows, caption };
}

/** Joins a row's notes exactly as the board renders them. */
export function joinInfraNotes(notes: string[]): string {
  return notes
    .map((n) => n.replace(/[;\s]+$/, ''))
    .filter(Boolean)
    .join('; ');
}

/** Emits the one-column table in Typst; `[]` when there is nothing to show. */
export function emitB32InfraTable(
  data: B32InfraTableData | null | undefined,
  header: string,
  _ctx: ConvertContext,
): string[] {
  if (!data || data.rows.length === 0) return [];
  const lit = (s: string) => `t(${typstString(s)})`;
  const cell = (inner: string) => `table.cell(par(justify: false, ${inner}))`;

  const cells: string[] = [`table.header(${cell(`strong(${lit(header)})`)})`];
  for (const row of data.rows) {
    const label = `${row.number ?? ''}${row.number != null ? '. ' : ''}${row.shortName}`;
    const chip = `chip-pill(${typstString(label)}, black, filled: true)`;
    cells.push(cell(`${lit(joinInfraNotes(row.notes))} + h(4pt) + ${chip}`));
  }
  return [
    `he-caption(${typstString('Table 3.2.b.')}, ${lit(data.caption)})`,
    `he-authored-table((1fr,), (${cells.join(', ')},), ${data.rows.length + 1})`,
  ];
}
