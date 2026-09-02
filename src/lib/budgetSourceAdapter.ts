/**
 * ONE source of budget-derived B3.1 inputs, dispatching on `proposals.budget_type`.
 *
 * Both the editor (`useB31SectionData`, `useB31CostPresence`) and the Typst PDF
 * path (`lib/typst/b31Data.ts`) call this module, so the two can never disagree.
 *
 *  - 'traditional': reads exactly what the consumers read before — `budget_rows`,
 *    `budget_cost_justification_items` and `wp_draft_effort`.
 *  - 'lump_sum': reads the `ls_*` tables and NEVER `wp_draft_effort`. Every
 *    derived figure comes from `src/lib/lumpSumFigures.ts`.
 */

import { supabase } from '@/integrations/supabase/client';
import { computeBudgetRow } from '@/lib/budgetCompute';
import type { LumpSumEffort, LumpSumRole, LumpSumWorkPackage } from '@/hooks/useLumpSumPersonnel';
import type { LumpSumCostItem } from '@/hooks/useLumpSumCosts';
import type { DepreciationItem } from '@/hooks/useLumpSumDepreciation';
import {
  buildWpInputs,
  computeWpTotals,
  personMonthsForRoles,
  equipmentAndPersonnelTotals,
  roundCents,
} from '@/lib/lumpSumFigures';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A single justification line. The work-package fields are OPTIONAL: traditional
 * proposals leave them undefined and render exactly as before; lump-sum items
 * populate them so the tables can draw a WP badge.
 */
export interface B31JustificationItem {
  amount: number;
  justification: string;
  wpNumber?: number | null;
  wpShortName?: string | null;
  wpColor?: string | null;
}

export interface BudgetCostEntry {
  participantId: string;
  items: B31JustificationItem[];
  totalCost: number;
}

export type BudgetCategory =
  | 'subcontracting'
  | 'equipment'
  | 'travel'
  | 'other_goods'
  | 'fstp'
  | 'internally_invoiced';

export interface BudgetSourceData {
  budgetType: 'traditional' | 'lump_sum';
  isLumpSum: boolean;
  /** wp_draft_id → effort rows. Only populated for lump-sum proposals. */
  effortByWp: Record<string, { participant_id: string; person_months: number }[]>;
  /** participant_id → total person-months (lump sum: from ls_*; traditional: wp_draft_effort). */
  pmTotals: Record<string, number>;
  /** participant_id → personnel cost used by the 15 % equipment rule. */
  personnelCosts: Record<string, number>;
  categories: Record<BudgetCategory, BudgetCostEntry[]>;
  presence: {
    subcontracting: boolean;
    travel: boolean;
    equipment: boolean;
    equipmentAboveThreshold: boolean;
    equipmentBelowThreshold: boolean;
    otherGoods: boolean;
    fstp: boolean;
    internallyInvoiced: boolean;
  };
}

const EMPTY_CATEGORIES = (): Record<BudgetCategory, BudgetCostEntry[]> => ({
  subcontracting: [],
  equipment: [],
  travel: [],
  other_goods: [],
  fstp: [],
  internally_invoiced: [],
});

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Which justification category a lump-sum cost line belongs to. */
function categoryForCostLine(costLine: string): BudgetCategory | null {
  if (costLine === 'B.1') return 'subcontracting';
  if (costLine === 'C.1') return 'travel';
  if (costLine.startsWith('C.2')) return 'equipment';
  if (costLine.startsWith('C.3')) return 'other_goods';
  if (costLine === 'D.1') return 'fstp';
  if (costLine === 'D.2') return 'internally_invoiced';
  return null;
}

function entriesFrom(
  byParticipant: Map<string, B31JustificationItem[]>,
): BudgetCostEntry[] {
  const out: BudgetCostEntry[] = [];
  for (const [participantId, items] of byParticipant) {
    const totalCost = items.reduce((s, i) => s + i.amount, 0);
    out.push({ participantId, items, totalCost });
  }
  return out;
}

/* ───────────────────────────── traditional ───────────────────────────── */

async function fetchTraditional(proposalId: string): Promise<BudgetSourceData> {
  const { data: rows, error: rowsError } = await supabase
    .from('budget_rows')
    .select(
      'id, participant_id, personnel_costs, pm_rate, subcontracting_costs, purchase_travel, ' +
        'purchase_equipment, purchase_other_goods, financial_support_third_parties, internally_invoiced',
    )
    .eq('proposal_id', proposalId);
  if (rowsError) throw rowsError;

  const rowIds = ((rows as any[]) || []).map((r) => r.id);
  let items: any[] = [];
  if (rowIds.length) {
    const { data, error } = await supabase
      .from('budget_cost_justification_items')
      .select('*')
      .in('budget_row_id', rowIds)
      .order('order_index');
    if (error) throw error;
    items = data || [];
  }

  const { data: effortData } = await supabase
    .from('wp_draft_effort')
    .select('participant_id, person_months, wp_draft_id, wp_drafts!inner(proposal_id)')
    .eq('wp_drafts.proposal_id', proposalId);
  const effortByWp: Record<string, { participant_id: string; person_months: number }[]> = {};
  for (const effort of (effortData as any[]) || []) {
    const rowsForWp = effortByWp[effort.wp_draft_id] ?? [];
    rowsForWp.push({ participant_id: effort.participant_id, person_months: num(effort.person_months) });
    effortByWp[effort.wp_draft_id] = rowsForWp;
  }

  const pmTotals: Record<string, number> = {};
  for (const e of (effortData as any[]) || []) {
    pmTotals[e.participant_id] = (pmTotals[e.participant_id] || 0) + num(e.person_months);
  }

  const categories = EMPTY_CATEGORIES();
  const personnelCosts: Record<string, number> = {};
  for (const row of ((rows as any[]) || [])) {
    const pmRate = row.pm_rate != null ? Number(row.pm_rate) : 0;
    const totalPM = pmTotals[row.participant_id] || 0;
    personnelCosts[row.participant_id] =
      pmRate > 0 ? Math.round(pmRate * totalPM) : num(row.personnel_costs);

    (Object.keys(categories) as BudgetCategory[]).forEach((category) => {
      const catItems: B31JustificationItem[] = items
        .filter((i: any) => i.budget_row_id === row.id && i.category === category)
        .map((i: any) => ({ amount: num(i.amount), justification: i.justification || '' }));
      const totalCost = catItems.reduce((s, i) => s + i.amount, 0);
      if (totalCost <= 0 || catItems.length === 0) return;
      categories[category].push({
        participantId: row.participant_id,
        items: catItems,
        totalCost,
      });
    });
  }

  // Presence: a category counts when any participant has an itemised entry OR a
  // top-level column total, exactly as before.
  const colTotal = (col: string) => ((rows as any[]) || []).some((r: any) => num(r[col]) > 0);
  const hasItem = (cat: string) =>
    items.some((i: any) => i.category === cat && num(i.amount) > 0);
  const has = (cat: string, col: string) => hasItem(cat) || colTotal(col);

  let equipmentAboveThreshold = false;
  let equipmentBelowThreshold = false;
  for (const row of ((rows as any[]) || [])) {
    const itemTotal = items
      .filter((i: any) => i.budget_row_id === row.id && i.category === 'equipment')
      .reduce((s: number, i: any) => s + num(i.amount), 0);
    const totalEquip = itemTotal > 0 ? itemTotal : num(row.purchase_equipment);
    if (totalEquip <= 0) continue;
    const personnel = personnelCosts[row.participant_id] || 0;
    if (personnel > 0 && totalEquip > personnel * 0.15) equipmentAboveThreshold = true;
    else equipmentBelowThreshold = true;
  }

  return {
    budgetType: 'traditional',
    isLumpSum: false,
    effortByWp,
    pmTotals,
    personnelCosts,
    categories,
    presence: {
      subcontracting: has('subcontracting', 'subcontracting_costs'),
      travel: has('travel', 'purchase_travel'),
      equipment: has('equipment', 'purchase_equipment'),
      equipmentAboveThreshold,
      equipmentBelowThreshold,
      otherGoods: has('other_goods', 'purchase_other_goods'),
      fstp: has('fstp', 'financial_support_third_parties'),
      internallyInvoiced: has('internally_invoiced', 'internally_invoiced'),
    },
  };
}

/* ────────────────────────────── lump sum ─────────────────────────────── */

async function fetchLumpSum(proposalId: string): Promise<BudgetSourceData> {
  const [wpResult, roleResult, effortResult, budgetResult, costResult, deprResult] =
    await Promise.all([
      supabase
        .from('wp_drafts')
        .select('id, number, short_name, title, color')
        .eq('proposal_id', proposalId)
        .order('number'),
      supabase
        .from('ls_personnel_roles')
        .select('id, proposal_id, participant_id, cost_line, role_name, he_category, pm_rate, order_index')
        .eq('proposal_id', proposalId),
      supabase
        .from('ls_personnel_effort')
        .select('id, role_id, wp_draft_id, person_months')
        .eq('proposal_id', proposalId),
      supabase
        .from('ls_participant_budget')
        .select('id, participant_id, a4_unit_cost, is_locked')
        .eq('proposal_id', proposalId),
      supabase
        .from('ls_cost_items')
        .select('id, proposal_id, participant_id, wp_draft_id, cost_line, quantity, unit_cost, amount, justification, order_index')
        .eq('proposal_id', proposalId)
        .order('order_index'),
      supabase
        .from('ls_depreciation_items')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index'),
    ]);
  const failure = [wpResult, roleResult, effortResult, budgetResult, costResult, deprResult]
    .find((r) => r.error);
  if (failure?.error) throw failure.error;

  const workPackages = ((wpResult.data as any[]) || []) as LumpSumWorkPackage[];
  const roles = ((roleResult.data as any[]) || []) as LumpSumRole[];
  const efforts = ((effortResult.data as any[]) || []) as LumpSumEffort[];
  const budgets = ((budgetResult.data as any[]) || []) as { participant_id: string; a4_unit_cost: number | null }[];
  const costItems = ((costResult.data as any[]) || []) as LumpSumCostItem[];
  const depreciation = ((deprResult.data as any[]) || []) as DepreciationItem[];

  const wpById = new Map(workPackages.map((wp) => [wp.id, wp]));
  const participantIds = Array.from(
    new Set([
      ...roles.map((r) => r.participant_id),
      ...costItems.map((i) => i.participant_id),
      ...depreciation.map((i) => i.participant_id),
    ]),
  );

  /* staff effort — person-months per participant per work package */
  const effortByWp: Record<string, { participant_id: string; person_months: number }[]> = {};
  const pmTotals: Record<string, number> = {};
  for (const wp of workPackages) {
    const rows: { participant_id: string; person_months: number }[] = [];
    for (const participantId of participantIds) {
      const pRoles = roles.filter(
        (r) => r.participant_id === participantId && /^A\.[1-4]$/.test(r.cost_line),
      );
      if (!pRoles.length) continue;
      const pm = personMonthsForRoles(pRoles, efforts, workPackages, wp.id);
      if (pm) rows.push({ participant_id: participantId, person_months: pm });
    }
    effortByWp[wp.id] = rows;
    for (const row of rows) {
      pmTotals[row.participant_id] = (pmTotals[row.participant_id] || 0) + row.person_months;
    }
  }

  /* cost justifications */
  const categories = EMPTY_CATEGORIES();
  const buckets = new Map<BudgetCategory, Map<string, B31JustificationItem[]>>();
  const push = (category: BudgetCategory, participantId: string, item: B31JustificationItem) => {
    if (!buckets.has(category)) buckets.set(category, new Map());
    const map = buckets.get(category);
    if (!map) return;
    map.set(participantId, [...(map.get(participantId) ?? []), item]);
  };

  for (const item of costItems) {
    const category = categoryForCostLine(item.cost_line);
    if (!category) continue;
    const amount = num(item.amount);
    const justification = item.justification || '';
    if (amount === 0 && !justification.trim()) continue;
    const wp = wpById.get(item.wp_draft_id);
    push(category, item.participant_id, {
      amount,
      justification,
      wpNumber: wp?.number ?? null,
      wpShortName: wp?.short_name ?? wp?.title ?? null,
      wpColor: wp?.color ?? null,
    });
  }

  // A depreciation investment mirrored into C.2 is an equipment justification:
  // its charged depreciation, with the investment's short name and comments.
  for (const item of depreciation) {
    if (!item.include_in_c2) continue;
    const amount = num(item.charged_depreciation);
    const text = [item.short_name || '', item.comments || ''].filter((s) => s.trim()).join(' — ');
    if (amount === 0 && !text) continue;
    const wp = wpById.get(item.wp_draft_id);
    push('equipment', item.participant_id, {
      amount,
      justification: text,
      wpNumber: wp?.number ?? null,
      wpShortName: wp?.short_name ?? wp?.title ?? null,
      wpColor: wp?.color ?? null,
    });
  }

  for (const [category, map] of buckets) categories[category] = entriesFrom(map);

  /* personnel cost and the 15 % equipment rule — rounded portal figures */
  const personnelCosts: Record<string, number> = {};
  let equipmentAboveThreshold = false;
  let equipmentBelowThreshold = false;
  for (const participantId of participantIds) {
    const pRoles = roles.filter(
      (r) => r.participant_id === participantId && /^A\.[1-4]$/.test(r.cost_line),
    );
    const a4UnitCost = Number(
      budgets.find((b) => b.participant_id === participantId)?.a4_unit_cost ?? 0,
    );
    const totals = equipmentAndPersonnelTotals(
      pRoles,
      efforts,
      workPackages,
      a4UnitCost,
      costItems.filter((i) => i.participant_id === participantId),
      depreciation.filter((i) => i.participant_id === participantId),
    );
    personnelCosts[participantId] = totals.personnelCost;
    const equipTotal =
      categories.equipment.find((e) => e.participantId === participantId)?.totalCost ?? 0;
    if (equipTotal <= 0) continue;
    if (totals.personnelCost > 0 && equipTotal > totals.personnelCost * 0.15) {
      equipmentAboveThreshold = true;
    } else {
      equipmentBelowThreshold = true;
    }
  }

  const present = (category: BudgetCategory) =>
    categories[category].some((entry) => entry.items.some((i) => i.amount > 0));

  return {
    budgetType: 'lump_sum',
    isLumpSum: true,
    effortByWp,
    pmTotals,
    personnelCosts,
    categories,
    presence: {
      subcontracting: present('subcontracting'),
      travel: present('travel'),
      equipment: present('equipment'),
      equipmentAboveThreshold,
      equipmentBelowThreshold,
      otherGoods: present('other_goods'),
      fstp: present('fstp'),
      internallyInvoiced: present('internally_invoiced'),
    },
  };
}

/** The single entry point. Dispatches on `proposals.budget_type`. */
export async function fetchBudgetSource(proposalId: string): Promise<BudgetSourceData> {
  const { data } = await supabase
    .from('proposals')
    .select('budget_type')
    .eq('id', proposalId)
    .maybeSingle();
  const budgetType = (data as any)?.budget_type === 'lump_sum' ? 'lump_sum' : 'traditional';
  return budgetType === 'lump_sum' ? fetchLumpSum(proposalId) : fetchTraditional(proposalId);
}

export const budgetSourceQueryKey = (proposalId: string) => ['b31-budget-source', proposalId];
