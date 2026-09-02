import { supabase } from '@/integrations/supabase/client';
import {
  averageWeightedPmRate,
  buildWpInputs,
  computeWpTotals,
  costLineAmount,
  depreciationAmount,
  personMonthsForRoles,
  roundCents,
} from '@/lib/lumpSumFigures';
import type { LumpSumEffort, LumpSumRole, LumpSumWorkPackage } from '@/hooks/useLumpSumPersonnel';
import type { LumpSumCostItem } from '@/hooks/useLumpSumCosts';
import type { DepreciationItem } from '@/hooks/useLumpSumDepreciation';

const A1_CATEGORIES: Record<string, string> = {
  senior_scientist: 'Senior expert',
  junior_scientist: 'Junior expert',
  technical: 'Technical role',
  administrative: 'Administrative role',
  others: 'Others',
};
const PORTAL_A1_ORDER = [
  ['senior_scientist', 'Senior Scientists (or equivalent in the private sector)'],
  ['junior_scientist', 'Junior Scientists (or equivalent in the private sector)'],
  ['technical', 'Technical Personnel (or equivalent in the private sector)'],
  ['administrative', 'Administrative Personnel (or equivalent in the private sector)'],
  ['others', 'Others'],
] as const;
const PORTAL_C2_ORDER = [
  ['C.2.infrastructure', 'Infrastructure'],
  ['C.2.equipment', 'Equipment'],
  ['C.2.other_assets', 'Other assets'],
] as const;
const PORTAL_C3_ORDER = [
  ['C.3.consumables', 'Consumables'],
  ['C.3.meetings', 'Services for meetings, seminars'],
  ['C.3.dissemination', 'Services for dissemination activities (including website)'],
  ['C.3.publication', 'Publication fees'],
  ['C.3.other', 'Other (shipment, insurance, translation, etc.)'],
] as const;

type WorkbookApi = typeof import('xlsx-js-style');
type AnyRow = Record<string, any>;

function participantLabel(participant: AnyRow | undefined) {
  if (!participant) return 'Unknown participant';
  return `${participant.participant_number ?? '?'}. ${participant.organisation_short_name || participant.organisation_name || ''}`.trim();
}

function wpLabel(wp: AnyRow | undefined) {
  return wp ? `WP${wp.number}` : 'WP?';
}

function excelColumn(index: number) {
  let value = index;
  let result = '';
  while (value >= 0) {
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  }
  return result;
}

function styleSheet(XLSX: WorkbookApi, sheet: any, rows: any[][], numericColumns: number[], numericFormat = '#,##0.00') {
  const header = rows[0] ?? [];
  header.forEach((_value, index) => {
    const cell = sheet[`${excelColumn(index)}1`];
    if (cell) cell.s = { font: { bold: true } };
  });
  for (let row = 2; row <= rows.length; row++) {
    for (const column of numericColumns) {
      const cell = sheet[`${excelColumn(column)}${row}`];
      if (cell) cell.s = { ...(cell.s ?? {}), numFmt: numericFormat };
    }
  }
  const widths = header.map(() => 8);
  rows.forEach(row => row.forEach((value, index) => {
    widths[index] = Math.max(widths[index] ?? 8, String(value ?? '').length + 2);
  }));
  sheet['!cols'] = widths.map(width => ({ wch: Math.min(Math.max(width, 8), 60) }));
  return sheet;
}

function appendSheet(XLSX: WorkbookApi, wb: any, name: string, rows: any[][], numericColumns: number[], numericFormat?: string) {
  const sheet = styleSheet(XLSX, XLSX.utils.aoa_to_sheet(rows), rows, numericColumns, numericFormat);
  XLSX.utils.book_append_sheet(wb, sheet, name);
  return rows.length - 1;
}

function groupRoles(roles: LumpSumRole[], costLine: string) {
  const groups = new Map<string, LumpSumRole[]>();
  roles.filter(role => role.cost_line === costLine).forEach(role => {
    const key = costLine === 'A.1' ? (role.he_category || 'blank') : 'all';
    groups.set(key, [...(groups.get(key) ?? []), role]);
  });
  return groups;
}

function roleRate(role: LumpSumRole, a4UnitCost: number) {
  return role.cost_line === 'A.4' ? a4UnitCost : Number(role.pm_rate || 0);
}

function portalPersonnelCost(
  role: LumpSumRole,
  wp: LumpSumWorkPackage,
  roles: LumpSumRole[],
  efforts: LumpSumEffort[],
  workPackages: LumpSumWorkPackage[],
  a4UnitCost: number,
) {
  const group = groupRoles(roles, role.cost_line).get(role.cost_line === 'A.1' ? (role.he_category || 'blank') : 'all') ?? [role];
  const rate = averageWeightedPmRate(group, efforts, workPackages, role.cost_line, a4UnitCost);
  return roundCents(rate * personMonthsForRoles([role], efforts, workPackages, wp.id));
}

function totalFor(
  participantId: string,
  wp: LumpSumWorkPackage,
  roles: LumpSumRole[],
  efforts: LumpSumEffort[],
  workPackages: LumpSumWorkPackage[],
  costs: LumpSumCostItem[],
  depreciation: DepreciationItem[],
  a4UnitCost: number,
  fundingRate: number,
  indirectRate: number,
  requested: number | null,
) {
  const participantRoles = roles.filter(role => role.participant_id === participantId);
  const participantCosts = costs.filter(item => item.participant_id === participantId);
  const participantDepreciation = depreciation.filter(item => item.participant_id === participantId);
  const inputs = buildWpInputs(participantRoles, efforts, workPackages, a4UnitCost, participantCosts, participantDepreciation);
  return computeWpTotals(inputs[wp.id] ?? { personnel: 0, subcontracting: 0, purchase: 0, other: 0 }, indirectRate, fundingRate, requested);
}

export async function appendLumpSumSheets(wb: any, XLSX: WorkbookApi, proposalId: string, budgetType?: string) {
  const [proposalResult, participantResult, wpResult, roleResult, effortResult, costResult, depreciationResult, participantBudgetResult, wpBudgetResult] = await Promise.all([
    supabase.from('proposals').select('budget_type, uses_fstp, ls_indirect_cost_rate, ls_default_funding_rate').eq('id', proposalId).single(),
    supabase.from('participants').select('id, participant_number, organisation_name, organisation_short_name').eq('proposal_id', proposalId).order('participant_number'),
    supabase.from('wp_drafts').select('id, number, short_name, title, color').eq('proposal_id', proposalId).order('number'),
    supabase.from('ls_personnel_roles').select('id, participant_id, cost_line, role_name, he_category, pm_rate').eq('proposal_id', proposalId).order('participant_id').order('cost_line').order('order_index'),
    supabase.from('ls_personnel_effort').select('role_id, wp_draft_id, person_months').eq('proposal_id', proposalId),
    supabase.from('ls_cost_items').select('participant_id, wp_draft_id, cost_line, quantity, unit_cost, amount, justification').eq('proposal_id', proposalId).order('order_index'),
    supabase.from('ls_depreciation_items').select('participant_id, wp_draft_id, resource_type, short_name, purchase_date, purchase_cost, pct_project, pct_useful_life, charged_depreciation, include_in_c2, comments').eq('proposal_id', proposalId).order('order_index'),
    supabase.from('ls_participant_budget').select('participant_id, a4_unit_cost, funding_rate_override').eq('proposal_id', proposalId),
    supabase.from('ls_wp_budget').select('participant_id, wp_draft_id, requested_eu_contribution, comments').eq('proposal_id', proposalId),
  ]);
  const results = [proposalResult, participantResult, wpResult, roleResult, effortResult, costResult, depreciationResult, participantBudgetResult, wpBudgetResult];
  const failure = results.find(result => result.error);
  if (failure?.error) throw failure.error;

  const proposal: AnyRow = proposalResult.data ?? {};
  const participants = participantResult.data ?? [];
  const workPackages = wpResult.data as LumpSumWorkPackage[] ?? [];
  const roles = roleResult.data as LumpSumRole[] ?? [];
  const efforts = effortResult.data as LumpSumEffort[] ?? [];
  const costs = costResult.data as LumpSumCostItem[] ?? [];
  const depreciation = depreciationResult.data as DepreciationItem[] ?? [];
  const participantBudgets = participantBudgetResult.data ?? [];
  const wpBudgets = wpBudgetResult.data ?? [];
  const hasRows = [roles, efforts, costs, depreciation, participantBudgets, wpBudgets].some(rows => rows.length > 0);
  const isLumpSum = (budgetType ?? proposal.budget_type) === 'lump_sum';
  if (!isLumpSum && !hasRows) return { names: [], rowCounts: {} };

  const participantsById = new Map(participants.map(participant => [participant.id, participant]));
  const workPackagesById = new Map(workPackages.map(wp => [wp.id, wp]));
  const rolesById = new Map(roles.map(role => [role.id, role]));
  const participantBudgetById = new Map(participantBudgets.map(row => [row.participant_id, row]));
  const wpBudgetByKey = new Map(wpBudgets.map(row => [`${row.participant_id}|${row.wp_draft_id}`, row]));
  const effortByKey = new Map(efforts.map(row => [`${row.role_id}|${row.wp_draft_id}`, Number(row.person_months ?? 0)]));

  const personnelRows: any[][] = [['Participant', 'Role name', 'F&TP category', 'PM rate (€)', 'Work package', 'Person-months', 'Cost (€)']];
  roles.forEach(role => workPackages.forEach(wp => {
    personnelRows.push([
      participantLabel(participantsById.get(role.participant_id)),
      role.role_name ?? '',
      role.cost_line === 'A.1' ? (A1_CATEGORIES[role.he_category ?? ''] ?? role.he_category ?? '') : role.cost_line,
      averageWeightedPmRate(
        groupRoles(roles.filter(candidate => candidate.participant_id === role.participant_id), role.cost_line).get(role.cost_line === 'A.1' ? (role.he_category || 'blank') : 'all') ?? [role],
        efforts.filter(effort => rolesById.get(effort.role_id)?.participant_id === role.participant_id),
        workPackages,
        role.cost_line,
        Number(participantBudgetById.get(role.participant_id)?.a4_unit_cost ?? 0),
      ),
      wpLabel(wp),
      effortByKey.get(`${role.id}|${wp.id}`) ?? 0,
      portalPersonnelCost(role, wp, roles.filter(candidate => candidate.participant_id === role.participant_id), efforts.filter(effort => rolesById.get(effort.role_id)?.participant_id === role.participant_id), workPackages, Number(participantBudgetById.get(role.participant_id)?.a4_unit_cost ?? 0)),
    ]);
  }));

  const costRows: any[][] = [['Participant', 'Cost line', 'Work package', 'Quantity', 'Unit cost (€)', 'Amount (€)', 'Justification'], ...costs.map(item => [
    participantLabel(participantsById.get(item.participant_id)), item.cost_line, wpLabel(workPackagesById.get(item.wp_draft_id)), Number(item.quantity ?? 0), Number(item.unit_cost ?? 0), Number(item.amount ?? 0), item.justification ?? '',
  ])];
  const depreciationRows: any[][] = [['Participant', 'Work package', 'Resource type', 'Short name', 'Purchase date', 'Purchase cost (€)', '% project', '% life', 'Charged depreciation (€)', 'Included in C.2', 'Comments'], ...depreciation.map(item => [
    participantLabel(participantsById.get(item.participant_id)), wpLabel(workPackagesById.get(item.wp_draft_id)), item.resource_type ?? '', item.short_name ?? '', item.purchase_date ? String(item.purchase_date).slice(0, 10) : '', Number(item.purchase_cost ?? 0), Number(item.pct_project ?? 0), Number(item.pct_useful_life ?? 0), Number(item.charged_depreciation ?? 0), item.include_in_c2 ? 'Yes' : 'No', item.comments ?? '',
  ])];

  const totalsRows: any[][] = [['Participant', 'Work package', 'A (€)', 'B (€)', 'C (€)', 'D (€)', 'E (€)', 'F (€)', 'G (€)', 'H (€)', 'Work-package comment']];
  participants.forEach(participant => workPackages.forEach(wp => {
    const budget = participantBudgetById.get(participant.id);
    const fundingRate = budget?.funding_rate_override == null ? Number(proposal.ls_default_funding_rate ?? 0) : Number(budget.funding_rate_override);
    const storedRequest = wpBudgetByKey.get(`${participant.id}|${wp.id}`)?.requested_eu_contribution ?? null;
    const total = totalFor(participant.id, wp, roles, efforts, workPackages, costs, depreciation, Number(budget?.a4_unit_cost ?? 0), fundingRate, Number(proposal.ls_indirect_cost_rate ?? 0), storedRequest);
    totalsRows.push([participantLabel(participant), wpLabel(wp), total.personnel, total.subcontracting, total.purchase, total.other, total.indirect, total.totalCosts, total.maxEuContribution, total.requestedEuContribution, wpBudgetByKey.get(`${participant.id}|${wp.id}`)?.comments ?? '']);
  }));

  const portalRows: any[][] = [['Participant', 'Work package', 'Field', 'Quantity', 'Unit rate (€)', 'Subtotal (€)', 'Work-package comment']];
  const pushPortal = (participant: AnyRow, wp: LumpSumWorkPackage, field: string, quantity: number, rate: number, subtotal: number, comment: string) => portalRows.push([participantLabel(participant), wpLabel(wp), field, quantity, rate, subtotal, comment]);
  participants.forEach(participant => workPackages.forEach(wp => {
    const participantRoles = roles.filter(role => role.participant_id === participant.id);
    const participantEfforts = efforts.filter(effort => rolesById.get(effort.role_id)?.participant_id === participant.id);
    const budget = participantBudgetById.get(participant.id);
    const a4 = Number(budget?.a4_unit_cost ?? 0);
    const comment = wpBudgetByKey.get(`${participant.id}|${wp.id}`)?.comments ?? '';
    const a1Roles = participantRoles.filter(role => role.cost_line === 'A.1');
    const a1Values = PORTAL_A1_ORDER.map(([key, label]) => {
      const group = a1Roles.filter(role => (role.he_category || 'blank') === key);
      const rate = averageWeightedPmRate(group, participantEfforts, workPackages, 'A.1', a4);
      const pm = personMonthsForRoles(group, participantEfforts, workPackages, wp.id);
      return { label, value: roundCents(rate * pm), pm, rate };
    });
    pushPortal(participant, wp, 'A.1 Employees (a1)', 1, a1Values.reduce((sum, item) => sum + item.value, 0), roundCents(a1Values.reduce((sum, item) => sum + item.value, 0)), comment);
    a1Values.forEach(item => pushPortal(participant, wp, item.label, item.pm, item.rate, item.value, comment));
    [['A.2', 'A.2 Natural persons under direct contract (a2)'], ['A.3', 'A.3 Seconded persons (a3)'], ['A.4', 'A.4 SME owners and natural person beneficiaries (a4)']].forEach(([line, label]) => {
      const group = participantRoles.filter(role => role.cost_line === line);
      const rate = averageWeightedPmRate(group, participantEfforts, workPackages, line, a4);
      const pm = personMonthsForRoles(group, participantEfforts, workPackages, wp.id);
      pushPortal(participant, wp, label, pm, rate, roundCents(rate * pm), comment);
    });
    pushPortal(participant, wp, 'B.1 Subcontracting (b1)', 1, roundCents(costLineAmount(costs.filter(item => item.participant_id === participant.id), 'B.1', wp.id)), roundCents(costLineAmount(costs.filter(item => item.participant_id === participant.id), 'B.1', wp.id)), comment);
    PORTAL_C2_ORDER.forEach(([line, label]) => { const amount = roundCents(costLineAmount(costs.filter(item => item.participant_id === participant.id), line, wp.id) + depreciationAmount(depreciation.filter(item => item.participant_id === participant.id), line.slice(3), wp.id)); pushPortal(participant, wp, label, 1, amount, amount, comment); });
    pushPortal(participant, wp, 'C.2 Equipment (c2)', 1, 0, 0, comment);
    PORTAL_C3_ORDER.forEach(([line, label]) => { const amount = roundCents(costLineAmount(costs.filter(item => item.participant_id === participant.id), line, wp.id)); pushPortal(participant, wp, label, 1, amount, amount, comment); });
    if (Boolean(proposal.uses_fstp)) pushPortal(participant, wp, 'D.1 Financial support to third parties (d1)', 1, roundCents(costLineAmount(costs.filter(item => item.participant_id === participant.id), 'D.1', wp.id)), roundCents(costLineAmount(costs.filter(item => item.participant_id === participant.id), 'D.1', wp.id)), comment);
    const d2 = roundCents(costLineAmount(costs.filter(item => item.participant_id === participant.id), 'D.2', wp.id));
    pushPortal(participant, wp, 'D.2 Internally invoiced goods and services (d2)', 1, d2, d2, comment);
    const totals = totalFor(participant.id, wp, roles, efforts, workPackages, costs, depreciation, a4, budget?.funding_rate_override == null ? Number(proposal.ls_default_funding_rate ?? 0) : Number(budget.funding_rate_override), Number(proposal.ls_indirect_cost_rate ?? 0), wpBudgetByKey.get(`${participant.id}|${wp.id}`)?.requested_eu_contribution ?? null);
    pushPortal(participant, wp, 'E. Indirect costs (e)', 1, totals.indirect, totals.indirect, comment);
    pushPortal(participant, wp, 'F. Total costs (f)', 1, totals.totalCosts, totals.totalCosts, comment);
    pushPortal(participant, wp, 'G. Maximum EU contribution (g)', 1, totals.maxEuContribution, totals.maxEuContribution, comment);
    pushPortal(participant, wp, 'H. Requested EU contribution (h)', 1, totals.requestedEuContribution, totals.requestedEuContribution, comment);
  }));

  appendSheet(XLSX, wb, 'Lump sum personnel', personnelRows, [3, 5], '0.0');
  appendSheet(XLSX, wb, 'Lump sum costs', costRows, [3, 4, 5], '#,##0.00');
  appendSheet(XLSX, wb, 'Lump sum depreciation', depreciationRows, [5, 8], '#,##0.00');
  appendSheet(XLSX, wb, 'Lump sum totals', totalsRows, [2, 3, 4, 5, 6, 7, 8, 9], '#,##0.00');
  appendSheet(XLSX, wb, 'Portal transfer', portalRows, [3, 4, 5], '#,##0.00');
  return { names: ['Lump sum personnel', 'Lump sum costs', 'Lump sum depreciation', 'Lump sum totals', 'Portal transfer'], rowCounts: Object.fromEntries([['Lump sum personnel', personnelRows.length - 1], ['Lump sum costs', costRows.length - 1], ['Lump sum depreciation', depreciationRows.length - 1], ['Lump sum totals', totalsRows.length - 1], ['Portal transfer', portalRows.length - 1]]) };
}
