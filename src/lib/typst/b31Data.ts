/**
 * B3.1 (and B1.2 linked activities) source data, PROJECTED AFRESH for Typst.
 *
 * The on-screen tables are React mirror components fed by `useB31SectionData`,
 * a hook. Typst is compiled outside React and cannot consume a hook or a JSX
 * tree, so this module re-issues the SAME queries as plain async calls and
 * returns plain data. Everything here is a re-projection, not a re-use:
 *
 *  - work packages, tasks, deliverables, effort  → `wp_drafts` + children
 *    (identical select list to `useB31SectionData`)
 *  - milestones / risks                          → `proposal_milestones` /
 *    `proposal_risks` + their `_wps` junction tables (authored relational
 *    blocks, not source-fed)
 *  - cost justifications                         → `budget_rows` +
 *    `budget_cost_justification_items`, with the same per-category grouping
 *    and the same 15%-of-personnel equipment rule
 *  - linked activities                           → `methodology_linked_activities`
 *  - captions                                    → `table_captions` (user
 *    overrides) falling back to the component defaults
 *  - Pert / Gantt                                → `figures` rows for caption
 *    and number only; the drawings themselves are rasterised from the DOM
 *    (see `typstFigures.ts`)
 *
 * The one thing NOT re-derived is table lettering: `nextLabel()` in
 * `B31SectionContent.tsx` assigns g/h/i at render time depending on which cost
 * blocks are present, and that logic is mirrored in `letterForCostTables`.
 */

import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { fetchPertChartData, type PertChartData } from './pertTypst';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TypstParticipant {
  id: string;
  organisation_name: string;
  organisation_short_name: string | null;
  participant_number: number | null;
}

export interface TypstTask {
  id: string;
  number: number;
  title: string | null;
  description: string | null;
  lead_participant_id: string | null;
  start_month: number | null;
  end_month: number | null;
  participantIds: string[];
}

export interface TypstDeliverable {
  id: string;
  wpNumber: number;
  wpColor: string;
  number: number;
  title: string | null;
  type: string | null;
  dissemination_level: string | null;
  responsible_participant_id: string | null;
  due_month: number | null;
}

export interface TypstWP {
  id: string;
  number: number;
  title: string | null;
  short_name: string | null;
  color: string;
  lead_participant_id: string | null;
  objectives: string | null;
  description_before_tasks: string | null;
  manual_duration: string | null;
  tasks: TypstTask[];
  deliverables: TypstDeliverable[];
  effort: { participant_id: string; person_months: number }[];
}

export interface TypstMilestone {
  id: string;
  number: number;
  title: string | null;
  due_month: number | null;
  means_of_verification: string | null;
  wpNumbers: number[];
  wpColors: string[];
  /** WP number flagged `is_primary` for this milestone, if any. */
  primaryWpNumber?: number | null;
}

export interface TypstRisk {
  id: string;
  number: number;
  title: string | null;
  likelihood: string | null;
  severity: string | null;
  mitigation: string | null;
  wpNumbers: number[];
  wpColors: string[];
}

export interface TypstCostEntry {
  participantId: string;
  items: { amount: number; justification: string }[];
  totalCost: number;
}

export interface TypstCostBlock {
  categoryLabel: string;
  participants: TypstCostEntry[];
}

export interface TypstLinkedActivity {
  id: string;
  acronym: string | null;
  instrument_code: string | null;
  instrument_custom: string | null;
  duration_start: number | null;
  duration_end: number | null;
  link_description_html: string | null;
  responsible_participant_id: string | null;
}

export interface TypstFigureMeta {
  id: string;
  figure_number: string;
  figure_type: string;
  title: string | null;
  caption: string | null;
}

export interface B31TypstData {
  participants: TypstParticipant[];
  wps: TypstWP[];
  deliverables: TypstDeliverable[];
  milestones: TypstMilestone[];
  risks: TypstRisk[];
  subcontracting: TypstCostEntry[];
  purchaseBlocks: TypstCostBlock[];
  otherBlocks: TypstCostBlock[];
  linkedActivities: TypstLinkedActivity[];
  pertFigure: TypstFigureMeta | null;
  ganttFigure: TypstFigureMeta | null;
  /**
   * The Pert chart's own drawing data. Present whenever a Pert figure row
   * exists, so the chart is emitted natively and no longer depends on the
   * block being expanded on screen.
   */
  pertChart: PertChartData | null;
  /** `table_captions.table_key` → caption text (user overrides only). */
  captions: Record<string, string>;
  /** `table_column_widths.table_key` → stored pixel widths. */
  columnWidths: Record<string, number[]>;
  /** `table_column_headers.table_key` → { columnIndex: header } overrides. */
  columnHeaders: Record<string, Record<string, string>>;
}

const COST_CATEGORIES = [
  'subcontracting',
  'equipment',
  'travel',
  'other_goods',
  'fstp',
  'internally_invoiced',
] as const;

function groupCosts(
  budgetRows: any[],
  justItems: any[],
  category: string,
): TypstCostEntry[] {
  const out: TypstCostEntry[] = [];
  for (const row of budgetRows) {
    const items = justItems
      .filter((i) => i.budget_row_id === row.id && i.category === category)
      .map((i) => ({ amount: Number(i.amount) || 0, justification: i.justification || '' }));
    const totalCost = items.reduce((s, i) => s + i.amount, 0);
    if (totalCost <= 0 || items.length === 0) continue;
    out.push({ participantId: row.participant_id, items, totalCost });
  }
  return out;
}

export async function fetchB31TypstData(proposalId: string): Promise<B31TypstData> {
  const [
    { data: participantRows },
    { data: wpRows },
    { data: figureRows },
    { data: proposalRow },
    { data: captionRows },
    { data: widthRows },
    { data: headerRows },
    { data: activityRows },

  ] = await Promise.all([
    supabase
      .from('participants')
      .select('id, organisation_name, organisation_short_name, participant_number')
      .eq('proposal_id', proposalId)
      .order('participant_number'),
    supabase
      .from('wp_drafts')
      .select(
        `id, number, title, short_name, lead_participant_id, color, objectives,
         description_before_tasks, manual_duration,
         tasks:wp_draft_tasks(
           id, number, title, description, lead_participant_id, start_month, end_month, order_index,
           participants:wp_draft_task_participants(participant_id)
         ),
         deliverables:wp_draft_deliverables(
           id, number, title, type, dissemination_level, responsible_participant_id,
           due_month, order_index
         ),
         wp_effort:wp_draft_effort(participant_id, person_months)`,
      )
      .eq('proposal_id', proposalId)
      .order('number'),
    supabase
      .from('figures')
      .select('id, figure_number, figure_type, title, caption, content')
      .eq('proposal_id', proposalId)
      .in('figure_type', ['pert', 'gantt']),
    supabase
      .from('proposals')
      .select(
        'b31_show_purchase_costs, b31_show_other_direct_costs, b31_show_travel_justification, ' +
          'b31_show_equipment_justification, b31_show_all_equipment_justification, b31_show_other_goods_justification, ' +
          'b31_show_fstp_justification, b31_show_internally_invoiced_justification',
      )
      .eq('id', proposalId)
      .maybeSingle(),
    supabase.from('table_captions').select('table_key, caption').eq('proposal_id', proposalId),
    supabase
      .from('table_column_widths')
      .select('table_key, column_widths')
      .eq('proposal_id', proposalId),
    (supabase as any)
      .from('table_column_headers')
      .select('table_key, headers')
      .eq('proposal_id', proposalId),
    supabase
      .from('methodology_linked_activities')
      .select(
        'id, acronym, instrument_code, instrument_custom, duration_start, duration_end, ' +
          'link_description_html, responsible_participant_id, order_index',
      )
      .eq('proposal_id', proposalId)
      .order('order_index'),
  ]);

  const wps: TypstWP[] = ((wpRows as any[]) || []).map((wp: any) => {
    const color: string =
      wp.color || DEFAULT_WP_COLORS[(wp.number - 1) % DEFAULT_WP_COLORS.length];
    return {
      id: wp.id,
      number: wp.number,
      title: wp.title,
      short_name: wp.short_name,
      color,
      lead_participant_id: wp.lead_participant_id,
      objectives: wp.objectives,
      description_before_tasks: wp.description_before_tasks,
      manual_duration: wp.manual_duration,
      tasks: ((wp.tasks as any[]) || [])
        .slice()
        .sort((a, b) => (a.order_index ?? a.number) - (b.order_index ?? b.number))
        .map((t: any) => ({
          id: t.id,
          number: t.number,
          title: t.title,
          description: t.description,
          lead_participant_id: t.lead_participant_id,
          start_month: t.start_month,
          end_month: t.end_month,
          participantIds: ((t.participants as any[]) || []).map((p) => p.participant_id),
        })),
      deliverables: ((wp.deliverables as any[]) || [])
        .slice()
        .sort((a, b) => (a.order_index ?? a.number) - (b.order_index ?? b.number))
        .map((d: any) => ({
          id: d.id,
          wpNumber: wp.number,
          wpColor: color,
          number: d.number,
          title: d.title,
          type: d.type,
          dissemination_level: d.dissemination_level,
          responsible_participant_id: d.responsible_participant_id,
          due_month: d.due_month,
        })),
      effort: ((wp.wp_effort as any[]) || []).map((e: any) => ({
        participant_id: e.participant_id,
        person_months: Number(e.person_months) || 0,
      })),
    };
  });

  const wpById = new Map(wps.map((w) => [w.id, w]));
  const wpIds = wps.map((w) => w.id);

  /* ── milestones and risks (authored relational rows) ── */
  const [{ data: milestoneRows }, { data: milestoneWpRows }, { data: riskRows }, { data: riskWpRows }] =
    await Promise.all([
      supabase
        .from('proposal_milestones')
        .select('id, number, title, due_month, means_of_verification, order_index')
        .eq('proposal_id', proposalId)
        .order('number'),
      supabase.from('proposal_milestone_wps').select('milestone_id, wp_draft_id'),
      supabase
        .from('proposal_risks')
        .select('id, number, title, likelihood, severity, mitigation, order_index, created_at')
        .eq('proposal_id', proposalId)
        .order('order_index')
        .order('created_at'),
      supabase.from('proposal_risk_wps').select('risk_id, wp_draft_id'),
    ]);

  const linkedWps = (rows: any[], key: string, id: string) => {
    const ids = (rows || []).filter((r) => r[key] === id).map((r) => r.wp_draft_id);
    const linked = ids.map((wid: string) => wpById.get(wid)).filter(Boolean) as TypstWP[];
    linked.sort((a, b) => a.number - b.number);
    return linked;
  };

  const milestones: TypstMilestone[] = ((milestoneRows as any[]) || [])
    .map((m: any) => {
      const linked = linkedWps((milestoneWpRows as any[]) || [], 'milestone_id', m.id);
      return {
        id: m.id,
        number: m.number,
        title: m.title,
        due_month: m.due_month,
        means_of_verification: m.means_of_verification,
        wpNumbers: linked.map((w) => w.number),
        wpColors: linked.map((w) => w.color),
      };
    })
    // Same display order as the mirror: due month, then first linked WP, then id.
    .sort(
      (a, b) =>
        (a.due_month ?? 9999) - (b.due_month ?? 9999) ||
        (a.wpNumbers[0] ?? 9999) - (b.wpNumbers[0] ?? 9999) ||
        a.id.localeCompare(b.id),
    );

  const risks: TypstRisk[] = ((riskRows as any[]) || []).map((r: any) => {
    const linked = linkedWps((riskWpRows as any[]) || [], 'risk_id', r.id);
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      likelihood: r.likelihood,
      severity: r.severity,
      mitigation: r.mitigation,
      wpNumbers: linked.map((w) => w.number),
      wpColors: linked.map((w) => w.color),
    };
  });

  /* ── cost justifications ── */
  const { data: budgetRows } = await supabase
    .from('budget_rows')
    .select('id, participant_id, personnel_costs, pm_rate')
    .eq('proposal_id', proposalId);

  let justItems: any[] = [];
  const rowIds = ((budgetRows as any[]) || []).map((r) => r.id);
  if (rowIds.length) {
    const { data } = await supabase
      .from('budget_cost_justification_items')
      .select('*')
      .in('budget_row_id', rowIds)
      .in('category', COST_CATEGORIES as unknown as string[])
      .order('order_index');
    justItems = data || [];
  }

  // Person-month totals per participant, for the 15% equipment rule.
  const pmTotals = new Map<string, number>();
  for (const wp of wps) {
    for (const e of wp.effort) {
      pmTotals.set(e.participant_id, (pmTotals.get(e.participant_id) || 0) + e.person_months);
    }
  }

  const rows = (budgetRows as any[]) || [];
  const subcontracting = groupCosts(rows, justItems, 'subcontracting');
  const travel = groupCosts(rows, justItems, 'travel');
  const otherGoods = groupCosts(rows, justItems, 'other_goods');
  const fstp = groupCosts(rows, justItems, 'fstp');
  const internallyInvoiced = groupCosts(rows, justItems, 'internally_invoiced');

  const toggles: any = proposalRow || {};
  const equipmentAll = !!toggles.b31_show_all_equipment_justification;
  const equipment = groupCosts(rows, justItems, 'equipment').filter((entry) => {
    if (equipmentAll) return true;
    const row = rows.find((r) => r.participant_id === entry.participantId);
    const pmRate = row?.pm_rate != null ? Number(row.pm_rate) : 0;
    const totalPMs = pmTotals.get(entry.participantId) || 0;
    const personnelCosts =
      pmRate > 0 ? Math.round(pmRate * totalPMs) : Number(row?.personnel_costs) || 0;
    return personnelCosts > 0 && entry.totalCost > personnelCosts * 0.15;
  });

  const purchaseBlocks: TypstCostBlock[] = [];
  if (toggles.b31_show_purchase_costs && toggles.b31_show_travel_justification && travel.length) {
    purchaseBlocks.push({ categoryLabel: 'Travel', participants: travel });
  }
  if (equipment.length && (toggles.b31_show_purchase_costs || equipment.length > 0)) {
    // The board forces the equipment block on when any participant is above the
    // 15% threshold, regardless of the purchase-costs toggle.
    purchaseBlocks.push({ categoryLabel: 'Equipment', participants: equipment });
  }
  if (
    toggles.b31_show_purchase_costs &&
    toggles.b31_show_other_goods_justification &&
    otherGoods.length
  ) {
    purchaseBlocks.push({ categoryLabel: 'Other', participants: otherGoods });
  }

  const otherBlocks: TypstCostBlock[] = [];
  if (toggles.b31_show_other_direct_costs && toggles.b31_show_fstp_justification && fstp.length) {
    otherBlocks.push({ categoryLabel: 'FSTP', participants: fstp });
  }
  if (
    toggles.b31_show_other_direct_costs &&
    toggles.b31_show_internally_invoiced_justification &&
    internallyInvoiced.length
  ) {
    otherBlocks.push({ categoryLabel: 'Internally invoiced', participants: internallyInvoiced });
  }

  const figures = (figureRows as any[]) || [];
  const pertFigureRow = figures.find((f) => f.figure_type === 'pert') || null;
  const pertChart = pertFigureRow
    ? await fetchPertChartData(
        proposalId,
        pertFigureRow.content as Record<string, unknown> | null,
        wps.map((w) => ({ id: w.id, number: w.number, short_name: w.short_name, color: w.color })),
      )
    : null;
  const captions: Record<string, string> = {};
  for (const row of (captionRows as any[]) || []) {
    if (row.caption) captions[row.table_key] = row.caption;
  }

  const columnWidths: Record<string, number[]> = {};
  for (const row of ((widthRows as any[]) || [])) {
    const list = Array.isArray(row.column_widths)
      ? (row.column_widths as unknown[]).filter(
          (w): w is number => typeof w === 'number' && Number.isFinite(w) && w > 0,
        )
      : [];
    if (list.length) columnWidths[row.table_key] = list;
  }

  const columnHeaders: Record<string, Record<string, string>> = {};
  for (const row of ((headerRows as any[]) || [])) {
    if (row.headers && typeof row.headers === 'object' && !Array.isArray(row.headers)) {
      columnHeaders[row.table_key] = row.headers as Record<string, string>;
    }
  }

  const deliverables = wps.flatMap((w) => w.deliverables);

  return {
    participants: ((participantRows as any[]) || []) as TypstParticipant[],
    wps,
    deliverables,
    milestones,
    risks,
    subcontracting,
    purchaseBlocks,
    otherBlocks,
    linkedActivities: ((activityRows as any[]) || []) as TypstLinkedActivity[],
    columnWidths,
    columnHeaders,
    pertFigure: pertFigureRow,
    pertChart,
    ganttFigure: figures.find((f) => f.figure_type === 'gantt') || null,
    captions,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
