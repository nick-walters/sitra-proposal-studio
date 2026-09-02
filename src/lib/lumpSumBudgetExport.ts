import type { LumpSumCostItem } from '@/hooks/useLumpSumCosts';
import type { DepreciationItem } from '@/hooks/useLumpSumDepreciation';
import type { LumpSumEffort, LumpSumRole, LumpSumWorkPackage } from '@/hooks/useLumpSumPersonnel';
import {
  averageWeightedPmRate,
  buildWpInputs,
  categoryCost,
  computeWpTotals,
  costLineAmount,
  depreciationAmount,
  personMonthsForRoles,
  roundCents,
} from '@/lib/lumpSumFigures';
import { supabase } from '@/integrations/supabase/client';

const A1_CATEGORIES: Array<[string, string]> = [
  ['senior_scientist', 'Senior Scientists (or equivalent in the private sector)'],
  ['junior_scientist', 'Junior Scientists (or equivalent in the private sector)'],
  ['technical', 'Technical Personnel (or equivalent in the private sector)'],
  ['administrative', 'Administrative Personnel (or equivalent in the private sector)'],
  ['others', 'Others'],
];

const C2_SUBLINES: Array<[string, string]> = [
  ['C.2.infrastructure', 'Infrastructure'],
  ['C.2.equipment', 'Equipment'],
  ['C.2.other_assets', 'Other assets'],
];

const C3_SUBLINES: Array<[string, string]> = [
  ['C.3.consumables', 'Consumables'],
  ['C.3.meetings', 'Services for meetings, seminars'],
  ['C.3.dissemination', 'Services for dissemination activities (including website)'],
  ['C.3.publication', 'Publication fees'],
  ['C.3.other', 'Other (shipment, insurance, translation, etc.)'],
];

const CATEGORY_LABELS: Record<string, string> = {
  senior_scientist: 'Senior Scientists (or equivalent in the private sector)',
  junior_scientist: 'Junior Scientists (or equivalent in the private sector)',
  technical: 'Technical Personnel (or equivalent in the private sector)',
  administrative: 'Administrative Personnel (or equivalent in the private sector)',
  others: 'Others',
};

const COST_LINES = ['C.1', 'C.2.infrastructure', 'C.2.equipment', 'C.2.other_assets', 'C.3.consumables', 'C.3.meetings', 'C.3.dissemination', 'C.3.publication', 'C.3.other'] as const;
const D_LINES = ['D.1', 'D.2'] as const;

type Workbook = any;
type Xlsx = any;
type Participant = {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
  organisation_name: string;
};
type ParticipantBudget = {
  participant_id: string;
  a4_unit_cost: number | null;
  funding_rate_override: number | null;
};
type WpBudget = {
  participant_id: string;
  wp_draft_id: string;
  requested_eu_contribution: number | null;
  comments: string | null;
};
type ProposalRates = {
  ls_indirect_cost_rate: number | null;
  ls_default_funding_rate: number | null;
  uses_fstp: boolean | null;
};

const colLetter = (index: number) => {
  let value = '';
  let current = index;
  while (current >= 0) {
    value = String.fromCharCode(65 + (current % 26)) + value;
    current = Math.floor(current / 26) - 1;
  }
  return value;
};

const styleHeaders = (ws: any, rowNumber: number, count: number) => {
  for (let index = 0; index < count; index++) {
    const ref = `${colLetter(index)}${rowNumber}`;
    if (ws[ref]) ws[ref].s = { font: { bold: true } };
  }
};

const styleNumberColumns = (ws: any, indexes: number[], firstRow: number, lastRow: number, format: string) => {
  for (let row = firstRow; row <= lastRow; row++) {
    for (const index of indexes) {
      const ref = `${colLetter(index)}${row}`;
      if (ws[ref]) ws[ref].s = { ...(ws[ref].s || {}), numFmt: format };
    }
  }
};

const autoFit = (ws: any, rows: any[][]) => {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      const length = cell == null ? 0 : typeof cell === 'object' && cell.f ? 12 : String(cell).length;
      widths[index] = Math.max(widths[index] || 0, length);
    });
  }
  ws['!cols'] = widths.map(width => ({ wch: Math.max(width + 2, 8) }));
};

const participantLabel = (participant: Participant | undefined) => {
  if (!participant) return '';
  return `P${participant.participant_number ?? '?' } ${participant.organisation_short_name || participant.organisation_name || ''}`.trim();
};

const workPackageLabel = (workPackage: LumpSumWorkPackage | undefined) => `WP${workPackage?.number ?? '?'}`;

const dateLabel = (value: string | null | undefined) => value ? String(value).slice(0, 10) : '';

async function hasLumpSumRows(proposalId: string) {
  const results = await Promise.all([
    supabase.from('ls_personnel_roles').select('id').eq('proposal_id', proposalId).limit(1),
    supabase.from('ls_personnel_effort').select('id').eq('proposal_id', proposalId).limit(1),
    supabase.from('ls_cost_items').select('id').eq('proposal_id', proposalId).limit(1),
    supabase.from('ls_depreciation_items').select('id').eq('proposal_id', proposalId).limit(1),
    supabase.from('ls_participant_budget').select('id').eq('proposal_id', proposalId).limit(1),
    supabase.from('ls_wp_budget').select('id').eq('proposal_id', proposalId).limit(1),
    supabase.from('ls_budget_permission_overrides').select('id').eq('proposal_id', proposalId).limit(1),
  ]);
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
  return results.some(result => (result.data?.length ?? 0) > 0);
}

export async function appendLumpSumSheets(wb: Workbook, XLSX: Xlsx, proposalId: string, budgetType?: string) {
  const [{ data: proposal, error: proposalError }, rowsExist] = await Promise.all([
    supabase.from('proposals').select('budget_type, ls_indirect_cost_rate, ls_default_funding_rate, uses_fstp').eq('id', proposalId).single(),
    hasLumpSumRows(proposalId),
  ]);
  if (proposalError) throw proposalError;
  if (budgetType !== 'lump_sum' && proposal?.budget_type !== 'lump_sum' && !rowsExist) return false;

  const [participantResult, workPackageResult, roleResult, effortResult, costResult, depreciationResult, participantBudgetResult, wpBudgetResult] = await Promise.all([
    supabase.from('participants').select('id, participant_number, organisation_short_name, organisation_name').eq('proposal_id', proposalId).order('participant_number'),
    supabase.from('wp_drafts').select('id, number, short_name, title, color').eq('proposal_id', proposalId).order('number'),
    supabase.from('ls_personnel_roles').select('id, proposal_id, participant_id, cost_line, role_name, he_category, pm_rate, order_index').eq('proposal_id', proposalId).order('participant_id').order('cost_line').order('order_index'),
    supabase.from('ls_personnel_effort').select('id, role_id, wp_draft_id, person_months').eq('proposal_id', proposalId),
    supabase.from('ls_cost_items').select('id, proposal_id, participant_id, wp_draft_id, cost_line, quantity, unit_cost, amount, justification, order_index').eq('proposal_id', proposalId).order('participant_id').order('cost_line').order('order_index'),
    supabase.from('ls_depreciation_items').select('id, proposal_id, participant_id, wp_draft_id, resource_type, short_name, purchase_date, purchase_cost, pct_project, pct_useful_life, comments, include_in_c2, order_index, charged_depreciation').eq('proposal_id', proposalId).order('participant_id').order('order_index'),
    supabase.from('ls_participant_budget').select('participant_id, a4_unit_cost, funding_rate_override').eq('proposal_id', proposalId),
    supabase.from('ls_wp_budget').select('participant_id, wp_draft_id, requested_eu_contribution, comments').eq('proposal_id', proposalId),
  ]);
  const sourceResults = [participantResult, workPackageResult, roleResult, effortResult, costResult, depreciationResult, participantBudgetResult, wpBudgetResult];
  const failed = sourceResults.find(result => result.error);
  if (failed?.error) throw failed.error;

  const participants = (participantResult.data ?? []) as Participant[];
  const workPackages = (workPackageResult.data ?? []) as LumpSumWorkPackage[];
  const roles = (roleResult.data ?? []) as LumpSumRole[];
  const efforts = (effortResult.data ?? []) as LumpSumEffort[];
  const costs = (costResult.data ?? []) as LumpSumCostItem[];
  const depreciation = (depreciationResult.data ?? []) as DepreciationItem[];
  const participantBudgets = (participantBudgetResult.data ?? []) as ParticipantBudget[];
  const wpBudgets = (wpBudgetResult.data ?? []) as WpBudget[];
  const rates: ProposalRates = {
    ls_indirect_cost_rate: proposal?.ls_indirect_cost_rate ?? 0,
    ls_default_funding_rate: proposal?.ls_default_funding_rate ?? 0,
    uses_fstp: proposal?.uses_fstp ?? false,
  };
  const participantById = new Map(participants.map(participant => [participant.id, participant]));
  const workPackageById = new Map(workPackages.map(workPackage => [workPackage.id, workPackage]));
  const budgetByParticipant = new Map(participantBudgets.map(budget => [budget.participant_id, budget]));
  const wpBudgetByKey = new Map(wpBudgets.map(budget => [`${budget.participant_id}|${budget.wp_draft_id}`, budget]));
  const effortByKey = new Map(efforts.map(effort => [`${effort.role_id}|${effort.wp_draft_id}`, Number(effort.person_months ?? 0)]));

  const participantRoles = (participantId: string) => roles.filter(role => role.participant_id === participantId);
  const participantCosts = (participantId: string) => costs.filter(item => item.participant_id === participantId);
  const participantDepreciation = (participantId: string) => depreciation.filter(item => item.participant_id === participantId);
  const a4UnitCostFor = (participantId: string) => Number(budgetByParticipant.get(participantId)?.a4_unit_cost ?? 0);
  const fundingRateFor = (participantId: string) => Number(budgetByParticipant.get(participantId)?.funding_rate_override ?? rates.ls_default_funding_rate ?? 0);
  const storedRequestFor = (participantId: string, wpId: string) => wpBudgetByKey.get(`${participantId}|${wpId}`)?.requested_eu_contribution ?? null;
  const wpCommentFor = (participantId: string, wpId: string) => wpBudgetByKey.get(`${participantId}|${wpId}`)?.comments ?? '';
  const groupKey = (role: LumpSumRole) => `${role.cost_line}|${role.cost_line === 'A.1' ? (role.he_category || 'blank') : 'all'}`;
  const groupRate = (group: LumpSumRole[], a4UnitCost: number) => averageWeightedPmRate(
    group,
    efforts,
    workPackages,
    group[0]?.cost_line ?? 'A.1',
    a4UnitCost,
  );
  const roleRate = (role: LumpSumRole, participantRoleRows: LumpSumRole[]) => {
    const group = participantRoleRows.filter(candidate => groupKey(candidate) === groupKey(role));
    return groupRate(group, a4UnitCostFor(role.participant_id));
  };
  const rolePm = (role: LumpSumRole, wpId: string) => personMonthsForRoles([role], efforts, workPackages, wpId);
  const roleCost = (role: LumpSumRole, wpId: string, participantRoleRows: LumpSumRole[]) => roundCents(categoryCost(roleRate(role, participantRoleRows), rolePm(role, wpId)));
  const totalsFor = (participantId: string, wpId: string) => {
    const participantRoleRows = participantRoles(participantId);
    const inputs = buildWpInputs(
      participantRoleRows,
      efforts,
      workPackages,
      a4UnitCostFor(participantId),
      participantCosts(participantId),
      participantDepreciation(participantId),
    );
    return computeWpTotals(
      inputs[wpId] ?? { personnel: 0, subcontracting: 0, purchase: 0, other: 0 },
      Number(rates.ls_indirect_cost_rate ?? 0),
      fundingRateFor(participantId),
      storedRequestFor(participantId, wpId),
    );
  };

  const personnelHeaders = ['Participant', 'Role name', 'F&TP category', 'PM rate (€)', 'Work package', 'Person-months', 'Cost (€)'];
  const personnelRows: any[][] = [personnelHeaders];
  for (const participant of participants) {
    for (const role of participantRoles(participant.id)) {
      for (const wp of workPackages) {
        personnelRows.push([
          participantLabel(participant),
          role.role_name ?? '',
          role.cost_line === 'A.1' ? (CATEGORY_LABELS[role.he_category ?? ''] ?? role.he_category ?? '') : '',
          roleRate(role, participantRoles(participant.id)),
          workPackageLabel(wp),
          rolePm(role, wp.id),
          roleCost(role, wp.id, participantRoles(participant.id)),
        ]);
      }
    }
  }
  const personnelSheet = XLSX.utils.aoa_to_sheet(personnelRows);
  styleHeaders(personnelSheet, 1, personnelHeaders.length);
  styleNumberColumns(personnelSheet, [3, 6], 2, personnelRows.length, '#,##0.00');
  styleNumberColumns(personnelSheet, [5], 2, personnelRows.length, '0.0');
  autoFit(personnelSheet, personnelRows);
  XLSX.utils.book_append_sheet(wb, personnelSheet, 'Lump sum personnel');

  const costHeaders = ['Participant', 'Cost line', 'Work package', 'Quantity', 'Unit cost (€)', 'Amount (€)', 'Justification'];
  const costRows: any[][] = [costHeaders, ...costs.map(item => [
    participantLabel(participantById.get(item.participant_id)),
    item.cost_line ?? '',
    workPackageLabel(workPackageById.get(item.wp_draft_id)),
    Number(item.quantity ?? 0),
    Number(item.unit_cost ?? 0),
    Number(item.amount ?? 0),
    item.justification ?? '',
  ])];
  const costSheet = XLSX.utils.aoa_to_sheet(costRows);
  styleHeaders(costSheet, 1, costHeaders.length);
  styleNumberColumns(costSheet, [3], 2, costRows.length, '0.00');
  styleNumberColumns(costSheet, [4, 5], 2, costRows.length, '#,##0.00');
  autoFit(costSheet, costRows);
  XLSX.utils.book_append_sheet(wb, costSheet, 'Lump sum costs');

  const depreciationHeaders = ['Participant', 'Work package', 'Resource type', 'Short name', 'Purchase date', 'Purchase cost (€)', '% project', '% life', 'Charged depreciation (€)', 'Included in C.2', 'Comments'];
  const depreciationRows: any[][] = [depreciationHeaders, ...depreciation.map(item => [
    participantLabel(participantById.get(item.participant_id)),
    workPackageLabel(workPackageById.get(item.wp_draft_id)),
    item.resource_type ?? '',
    item.short_name ?? '',
    dateLabel(item.purchase_date),
    Number(item.purchase_cost ?? 0),
    Number(item.pct_project ?? 0),
    Number(item.pct_useful_life ?? 0),
    Number(item.charged_depreciation ?? 0),
    item.include_in_c2 ? 'Yes' : 'No',
    item.comments ?? '',
  ])];
  const depreciationSheet = XLSX.utils.aoa_to_sheet(depreciationRows);
  styleHeaders(depreciationSheet, 1, depreciationHeaders.length);
  styleNumberColumns(depreciationSheet, [5, 6, 9], 2, depreciationRows.length, '#,##0.00');
  styleNumberColumns(depreciationSheet, [7, 8], 2, depreciationRows.length, '0.00');
  autoFit(depreciationSheet, depreciationRows);
  XLSX.utils.book_append_sheet(wb, depreciationSheet, 'Lump sum depreciation');

  const totalsHeaders = ['Participant', 'Work package', 'A (€)', 'B (€)', 'C (€)', 'D (€)', 'E (€)', 'F (€)', 'G (€)', 'H (€)', 'Work-package comment'];
  const totalsRows: any[][] = [totalsHeaders];
  for (const participant of participants) {
    for (const wp of workPackages) {
      const total = totalsFor(participant.id, wp.id);
      totalsRows.push([
        participantLabel(participant),
        workPackageLabel(wp),
        total.personnel,
        total.subcontracting,
        total.purchase,
        total.other,
        total.indirect,
        total.totalCosts,
        total.maxEuContribution,
        total.requestedEuContribution,
        wpCommentFor(participant.id, wp.id),
      ]);
    }
  }
  const totalsSheet = XLSX.utils.aoa_to_sheet(totalsRows);
  styleHeaders(totalsSheet, 1, totalsHeaders.length);
  styleNumberColumns(totalsSheet, [2, 3, 4, 5, 6, 7, 8, 9], 2, totalsRows.length, '#,##0.00');
  autoFit(totalsSheet, totalsRows);
  XLSX.utils.book_append_sheet(wb, totalsSheet, 'Lump sum totals');

  const portalHeaders = ['Participant', 'Work package', 'Section', 'Field', 'Quantity', 'Unit rate (€)', 'Subtotal (€)', 'Comment / value'];
  const portalRows: any[][] = [portalHeaders];
  const addAmount = (participant: Participant, wp: LumpSumWorkPackage, section: string, field: string, subtotal: number) => {
    portalRows.push([participantLabel(participant), workPackageLabel(wp), section, field, '', '', roundCents(subtotal), '']);
  };
  const addRate = (participant: Participant, wp: LumpSumWorkPackage, section: string, field: string, quantity: number, unitRate: number, subtotal: number) => {
    portalRows.push([participantLabel(participant), workPackageLabel(wp), section, field, quantity, roundCents(unitRate), roundCents(subtotal), '']);
  };
  for (const participant of participants) {
    const participantRoleRows = participantRoles(participant.id);
    const participantCostRows = participantCosts(participant.id);
    const participantDepreciationRows = participantDepreciation(participant.id).filter(item => item.include_in_c2);
    for (const wp of workPackages) {
      portalRows.push([participantLabel(participant), workPackageLabel(wp), '', 'Comments', '', '', '', wpCommentFor(participant.id, wp.id)]);

      const a1Roles = participantRoleRows.filter(role => role.cost_line === 'A.1');
      const a1Leaves = A1_CATEGORIES.map(([category, label]) => {
        const group = a1Roles.filter(role => (role.he_category || 'blank') === category);
        const quantity = personMonthsForRoles(group, efforts, workPackages, wp.id);
        const unitRate = groupRate(group, a4UnitCostFor(participant.id));
        return { label, quantity, unitRate, subtotal: roundCents(categoryCost(unitRate, quantity)) };
      });
      addAmount(participant, wp, 'A. Direct personnel costs', 'A.1 Employees (a1)', roundCents(a1Leaves.reduce((sum, leaf) => sum + leaf.subtotal, 0)));
      for (const leaf of a1Leaves) addRate(participant, wp, 'A. Direct personnel costs', leaf.label, leaf.quantity, leaf.unitRate, leaf.subtotal);
      for (const [line, label] of [
        ['A.2', 'A.2 Natural persons under direct contract (a2)'],
        ['A.3', 'A.3 Seconded persons (a3)'],
        ['A.4', 'A.4 SME owners and natural person beneficiaries (a4)'],
      ] as const) {
        const lineRoles = participantRoleRows.filter(role => role.cost_line === line);
        const quantity = personMonthsForRoles(lineRoles, efforts, workPackages, wp.id);
        const unitRate = groupRate(lineRoles, a4UnitCostFor(participant.id));
        addRate(participant, wp, 'A. Direct personnel costs', label, quantity, unitRate, roundCents(categoryCost(unitRate, quantity)));
      }

      const b1 = roundCents(costLineAmount(participantCostRows, 'B.1', wp.id));
      addRate(participant, wp, 'B. Direct subcontracting costs', 'Subcontracting (b1)', 1, b1, b1);

      const c1 = roundCents(costLineAmount(participantCostRows, 'C.1', wp.id));
      addRate(participant, wp, 'C. Direct purchase costs', 'C.1 Travel and subsistence (c1)', 1, c1, c1);
      const c2Leaves = C2_SUBLINES.map(([line, label]) => [label, roundCents(costLineAmount(participantCostRows, line, wp.id) + depreciationAmount(participantDepreciationRows, line.slice('C.2.'.length), wp.id))] as const);
      addAmount(participant, wp, 'C. Direct purchase costs', 'C.2 Equipment (c2)', c2Leaves.reduce((sum, [, value]) => sum + value, 0));
      for (const [label, value] of c2Leaves) addRate(participant, wp, 'C. Direct purchase costs', label, 1, value, value);
      const c3Leaves = C3_SUBLINES.map(([line, label]) => [label, roundCents(costLineAmount(participantCostRows, line, wp.id))] as const);
      addAmount(participant, wp, 'C. Direct purchase costs', 'C.3 Other goods, works and services (c3)', c3Leaves.reduce((sum, [, value]) => sum + value, 0));
      for (const [label, value] of c3Leaves) addRate(participant, wp, 'C. Direct purchase costs', label, 1, value, value);

      const d1 = roundCents(costLineAmount(participantCostRows, 'D.1', wp.id));
      const d2 = roundCents(costLineAmount(participantCostRows, 'D.2', wp.id));
      if (rates.uses_fstp) addAmount(participant, wp, 'D. Other cost categories', 'D.1 Financial support to third parties (d1)', d1);
      addAmount(participant, wp, 'D. Other cost categories', 'D.2 Internally invoiced goods and services (d2)', d2);

      const total = totalsFor(participant.id, wp.id);
      addAmount(participant, wp, 'E. Indirect costs', 'E. Indirect costs (e)', total.indirect);
      addAmount(participant, wp, 'Total costs', 'Total costs (f)', total.totalCosts);
      addAmount(participant, wp, 'Total costs', 'Maximum EU contribution (g)', total.maxEuContribution);
      addAmount(participant, wp, 'Total costs', 'Requested EU contribution (h)', total.requestedEuContribution);
    }
  }
  const portalSheet = XLSX.utils.aoa_to_sheet(portalRows);
  styleHeaders(portalSheet, 1, portalHeaders.length);
  styleNumberColumns(portalSheet, [4], 2, portalRows.length, '#,##0.00');
  styleNumberColumns(portalSheet, [5], 2, portalRows.length, '0.0');
  styleNumberColumns(portalSheet, [6, 7], 2, portalRows.length, '#,##0.00');
  autoFit(portalSheet, portalRows);
  XLSX.utils.book_append_sheet(wb, portalSheet, 'Portal transfer');

  return true;
}
