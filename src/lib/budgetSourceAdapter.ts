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
  // The 15 % equipment rule lives here for both models, so no consumer filters
  // mirrored items a second time. Traditional behaviour is unchanged: only
  // participants whose equipment exceeds 15 % of their personnel costs appear.
  categories.equipment = categories.equipment.filter((entry) => {
    const personnel = personnelCosts[entry.participantId] || 0;
    return personnel > 0 && entry.totalCost > personnel * 0.15;
  });

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
  const [wpResult, roleResult, effortResult, budgetResult, costResult, deprResult, mirrorResult] =
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
      supabase
        .from('ls_mirror_settings')
        .select('cost_line, is_mirrored')
        .eq('proposal_id', proposalId),
    ]);
  const failure = [wpResult, roleResult, effortResult, budgetResult, costResult, deprResult, mirrorResult]
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

  /* ── proposal-level mirroring switches; absent rows mean false ── */
  const mirrorSettings = Object.fromEntries(
    ((mirrorResult.data as { cost_line: string; is_mirrored: boolean }[] | null) || [])
      .map((row) => [row.cost_line, Boolean(row.is_mirrored)]),
  );

  /* The canonical helper is also used for the threshold test. Its C.2 input is
   * normalised to equipment so all three C.2 sub-lines plus all depreciation
   * resource types are included without creating a second calculation path. */
  const personnelCosts: Record<string, number> = {};
  const equipmentAboveThresholdFor = new Set<string>();
  let equipmentBelowThreshold = false;
  for (const participantId of participantIds) {
    const pRoles = roles.filter((r) => r.participant_id === participantId && /^A\.[1-4]$/.test(r.cost_line));
    const a4UnitCost = Number(budgets.find((b) => b.participant_id === participantId)?.a4_unit_cost ?? 0);
    const participantItems = costItems.filter((i) => i.participant_id === participantId);
    const participantDepreciation = depreciation.filter((i) => i.participant_id === participantId);
    const totals = equipmentAndPersonnelTotals(
      pRoles,
      efforts,
      workPackages,
      a4UnitCost,
      participantItems.map((item) => item.cost_line.startsWith('C.2.') ? { ...item, cost_line: 'C.2.equipment' } : item),
      participantDepreciation.map((item) => item.include_in_c2 ? { ...item, resource_type: 'equipment' } : item),
    );
    personnelCosts[participantId] = totals.personnelCost;
    if (totals.equipmentCost <= 0) continue;
    if (totals.personnelCost > 0 && totals.equipmentCost > totals.personnelCost * 0.15) equipmentAboveThresholdFor.add(participantId);
    else equipmentBelowThreshold = true;
  }

  const c2MirroredFor = (participantId: string, costLine: string) =>
    Boolean(mirrorSettings[costLine] || mirrorSettings['C.2']) || equipmentAboveThresholdFor.has(participantId);

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
    if (category === 'travel' && !mirrorSettings['C.1']) continue;
    if (category === 'other_goods' && !mirrorSettings[item.cost_line]) continue;
    if (category === 'equipment' && !c2MirroredFor(item.participant_id, item.cost_line)) continue;
    const amount = num(item.amount);
    const justification = item.justification || '';
    if (amount === 0 && !justification.trim()) continue;
    const wp = wpById.get(item.wp_draft_id);
    push(category, item.participant_id, { amount, justification, wpNumber: wp?.number ?? null, wpShortName: wp?.short_name ?? wp?.title ?? null, wpColor: wp?.color ?? null });
  }

  // A depreciation investment mirrors into its C.2 resource-type sub-line.
  for (const item of depreciation) {
    if (!item.include_in_c2 || !c2MirroredFor(item.participant_id, `C.2.${item.resource_type}`)) continue;
    const amount = num(item.charged_depreciation);
    const text = [item.short_name || '', item.comments || ''].filter((s) => s.trim()).join(' — ');
    if (amount === 0 && !text) continue;
    const wp = wpById.get(item.wp_draft_id);
    push('equipment', item.participant_id, { amount, justification: text, wpNumber: wp?.number ?? null, wpShortName: wp?.short_name ?? wp?.title ?? null, wpColor: wp?.color ?? null });
  }

  for (const [category, map] of buckets) categories[category] = entriesFrom(map);

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
      // Consumers read this as "the equipment block belongs in 3.1.h". After
      // mirroring is resolved here, anything still present belongs there.
      equipmentAboveThreshold: present('equipment'),
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

export interface EvaluationBudgetParticipant {
  participantId: string;
  participantNumber: number | null;
  shortName: string | null;
  requestedEu: number;
  totalEligible: number;
  fundingRate: number;
}

export interface EvaluationBudget {
  totalRequestedEu: number;
  totalDirectCosts: number;
  totalIndirect: number;
  totalEligible: number;
  perParticipant: EvaluationBudgetParticipant[];
}

/**
 * Builds the budget projection consumed by the evaluation-panel function.
 * Traditional proposals intentionally use the original budget-row calculation;
 * lump-sum proposals use only ls_* data and the canonical lump-sum figures.
 */
export async function fetchEvaluationBudget(proposalId: string): Promise<EvaluationBudget> {
  const { data: proposalRow, error: proposalError } = await supabase
    .from('proposals')
    .select('budget_type, type, ls_indirect_cost_rate, ls_default_funding_rate')
    .eq('id', proposalId)
    .maybeSingle();
  if (proposalError) throw proposalError;

  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('id, participant_number, organisation_short_name, organisation_name, organisation_category')
    .eq('proposal_id', proposalId);
  if (participantsError) throw participantsError;

  if ((proposalRow as any)?.budget_type !== 'lump_sum') {
    const [{ data: rows, error: rowsError }, { data: effortData, error: effortError }] = await Promise.all([
      supabase
        .from('budget_rows')
        .select(
          'participant_id, personnel_costs, subcontracting_costs, purchase_travel, purchase_equipment, purchase_other_goods, financial_support_third_parties, internally_invoiced, procurement, pm_rate, indirect_costs_override, funding_rate_override, requested_eu_contribution, has_in_kind, requested_personnel_costs, requested_subcontracting, requested_travel, requested_equipment, requested_other_goods, requested_fstp, requested_internally_invoiced',
        )
        .eq('proposal_id', proposalId),
      supabase
        .from('wp_draft_effort')
        .select('participant_id, person_months, wp_drafts!inner(proposal_id)')
        .eq('wp_drafts.proposal_id', proposalId),
    ]);
    if (rowsError) throw rowsError;
    if (effortError) throw effortError;

    const pmTotals = new Map<string, number>();
    (effortData || []).forEach((effort: any) => {
      pmTotals.set(effort.participant_id, (pmTotals.get(effort.participant_id) || 0) + Number(effort.person_months || 0));
    });
    const participantById = new Map(((participants as any[]) || []).map((participant) => [participant.id, participant]));
    let totalRequestedEu = 0;
    let totalDirectCosts = 0;
    let totalIndirect = 0;
    let totalEligible = 0;
    const perParticipant: EvaluationBudgetParticipant[] = [];

    for (const row of (rows as any[]) || []) {
      const participant: any = participantById.get(row.participant_id);
      const output = computeBudgetRow({
        ...row,
        totalPersonMonths: pmTotals.get(row.participant_id) || 0,
        proposalType: (proposalRow as any)?.type ?? null,
        organisationCategory: participant?.organisation_category ?? null,
      });
      totalRequestedEu += output.requestedEuContribution;
      totalDirectCosts += output.directCosts;
      totalIndirect += output.indirect;
      totalEligible += output.totalEligible;
      perParticipant.push({
        participantId: row.participant_id,
        participantNumber: participant?.participant_number ?? null,
        shortName: participant?.organisation_short_name ?? participant?.organisation_name ?? null,
        requestedEu: output.requestedEuContribution,
        totalEligible: output.totalEligible,
        fundingRate: output.fundingRate,
      });
    }

    perParticipant.sort((a, b) => (a.participantNumber || 999) - (b.participantNumber || 999));
    return { totalRequestedEu, totalDirectCosts, totalIndirect, totalEligible, perParticipant };
  }

  const [wpResult, roleResult, effortResult, budgetResult, costResult, depreciationResult, wpBudgetResult] = await Promise.all([
    supabase.from('wp_drafts').select('id, number, short_name, title, color').eq('proposal_id', proposalId).order('number'),
    supabase.from('ls_personnel_roles').select('id, participant_id, cost_line, role_name, he_category, pm_rate').eq('proposal_id', proposalId),
    supabase.from('ls_personnel_effort').select('id, role_id, wp_draft_id, person_months').eq('proposal_id', proposalId),
    supabase.from('ls_participant_budget').select('participant_id, a4_unit_cost, funding_rate_override').eq('proposal_id', proposalId),
    supabase.from('ls_cost_items').select('participant_id, wp_draft_id, cost_line, amount').eq('proposal_id', proposalId),
    supabase.from('ls_depreciation_items').select('participant_id, wp_draft_id, resource_type, charged_depreciation, include_in_c2').eq('proposal_id', proposalId),
    supabase.from('ls_wp_budget').select('participant_id, wp_draft_id, requested_eu_contribution').eq('proposal_id', proposalId),
  ]);
  const lumpSumResults = [wpResult, roleResult, effortResult, budgetResult, costResult, depreciationResult, wpBudgetResult];
  const failure = lumpSumResults.find((result) => result.error);
  if (failure?.error) throw failure.error;

  const workPackages = ((wpResult.data as any[]) || []) as LumpSumWorkPackage[];
  const roles = ((roleResult.data as any[]) || []) as LumpSumRole[];
  const efforts = ((effortResult.data as any[]) || []) as LumpSumEffort[];
  const participantBudgets = (budgetResult.data as any[]) || [];
  const costItems = (costResult.data as any[]) || [];
  const depreciationItems = (depreciationResult.data as any[]) || [];
  const wpBudgets = (wpBudgetResult.data as any[]) || [];
  const participantBudgetById = new Map(participantBudgets.map((budget) => [budget.participant_id, budget]));
  const wpBudgetByKey = new Map(wpBudgets.map((budget) => [`${budget.participant_id}|${budget.wp_draft_id}`, budget]));
  const participantById = new Map(((participants as any[]) || []).map((participant) => [participant.id, participant]));

  let totalRequestedEu = 0;
  let totalDirectCosts = 0;
  let totalIndirect = 0;
  let totalEligible = 0;
  const perParticipant: EvaluationBudgetParticipant[] = [];

  for (const participant of (participants as any[]) || []) {
    const participantRoles = roles.filter((role) => role.participant_id === participant.id);
    const participantCosts = costItems.filter((item) => item.participant_id === participant.id);
    const participantDepreciation = depreciationItems.filter((item) => item.participant_id === participant.id);
    const participantBudget = participantBudgetById.get(participant.id);
    const inputsByWp = buildWpInputs(
      participantRoles,
      efforts,
      workPackages,
      Number(participantBudget?.a4_unit_cost ?? 0),
      participantCosts as LumpSumCostItem[],
      participantDepreciation as DepreciationItem[],
    );
    const fundingRate = participantBudget?.funding_rate_override == null
      ? Number((proposalRow as any)?.ls_default_funding_rate ?? 0)
      : Number(participantBudget.funding_rate_override);

    let participantRequestedEu = 0;
    let participantDirectCosts = 0;
    let participantIndirect = 0;
    let participantEligible = 0;
    for (const workPackage of workPackages) {
      const total = computeWpTotals(
        inputsByWp[workPackage.id] ?? { personnel: 0, subcontracting: 0, purchase: 0, other: 0 },
        Number((proposalRow as any)?.ls_indirect_cost_rate ?? 0),
        fundingRate,
        wpBudgetByKey.get(`${participant.id}|${workPackage.id}`)?.requested_eu_contribution ?? null,
      );
      participantRequestedEu += total.requestedEuContribution;
      participantDirectCosts += total.totalCosts - total.indirect;
      participantIndirect += total.indirect;
      participantEligible += total.totalCosts;
    }

    totalRequestedEu += participantRequestedEu;
    totalDirectCosts += participantDirectCosts;
    totalIndirect += participantIndirect;
    totalEligible += participantEligible;
    perParticipant.push({
      participantId: participant.id,
      participantNumber: participant.participant_number ?? null,
      shortName: participant.organisation_short_name ?? participant.organisation_name ?? null,
      requestedEu: participantRequestedEu,
      totalEligible: participantEligible,
      fundingRate,
    });
  }

  perParticipant.sort((a, b) => (a.participantNumber || 999) - (b.participantNumber || 999));
  return {
    totalRequestedEu: roundCents(totalRequestedEu),
    totalDirectCosts: roundCents(totalDirectCosts),
    totalIndirect: roundCents(totalIndirect),
    totalEligible: roundCents(totalEligible),
    perParticipant,
  };
}

export const budgetSourceQueryKey = (proposalId: string) => ['b31-budget-source', proposalId];
