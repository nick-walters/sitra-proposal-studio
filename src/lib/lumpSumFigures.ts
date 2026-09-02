import type { LumpSumEffort, LumpSumRole, LumpSumWorkPackage } from '@/hooks/useLumpSumPersonnel';
import type { LumpSumCostItem } from '@/hooks/useLumpSumCosts';
import type { DepreciationItem } from '@/hooks/useLumpSumDepreciation';

export type LumpSumWpInputs = {
  personnel: number;
  subcontracting: number;
  purchase: number;
  other: number;
};

export type LumpSumWpTotals = LumpSumWpInputs & {
  indirect: number;
  totalCosts: number;
  maxEuContribution: number;
  requestedEuContribution: number;
  storedExceedsMax: number | null;
};

export const PERSONNEL_LINES = ['A.1', 'A.2', 'A.3', 'A.4'] as const;
export const COST_LINES = ['C.1', 'C.2.infrastructure', 'C.2.equipment', 'C.2.other_assets', 'C.3.consumables', 'C.3.meetings', 'C.3.dissemination', 'C.3.publication', 'C.3.other'] as const;
export const D_LINES = ['D.1', 'D.2'] as const;

export function roundCents(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function effortMap(efforts: LumpSumEffort[]) {
  return new Map(efforts.map(effort => [`${effort.role_id}:${effort.wp_draft_id}`, Number(effort.person_months || 0)]));
}

export function personMonthsForRoles(
  roles: LumpSumRole[],
  efforts: LumpSumEffort[],
  workPackages: LumpSumWorkPackage[],
  wpId?: string,
) {
  const byKey = effortMap(efforts);
  return roles.reduce((sum, role) => sum + (wpId
    ? (byKey.get(`${role.id}:${wpId}`) ?? 0)
    : workPackages.reduce((roleSum, wp) => roleSum + (byKey.get(`${role.id}:${wp.id}`) ?? 0), 0)), 0);
}

/** Weighted PM rate for the supplied F&TP category/line, rounded to portal precision. */
export function averageWeightedPmRate(
  roles: LumpSumRole[],
  efforts: LumpSumEffort[],
  workPackages: LumpSumWorkPackage[],
  costLine: string,
  a4UnitCost = 0,
) {
  const pmByKey = effortMap(efforts);
  const rateOf = (role: LumpSumRole) => costLine === 'A.4' ? a4UnitCost : Number(role.pm_rate || 0);
  const totalPm = roles.reduce((sum, role) => sum + personMonthsForRoles([role], efforts, workPackages), 0);
  if (!totalPm) return 0;
  const trueCost = roles.reduce((sum, role) => sum + workPackages.reduce(
    (roleSum, wp) => roleSum + (pmByKey.get(`${role.id}:${wp.id}`) ?? 0), 0,
  ) * rateOf(role), 0);
  return roundCents(trueCost / totalPm);
}

export function categoryCost(rate: number, personMonths: number) {
  return rate * personMonths;
}

export type PersonnelLineTotals = {
  portalCost: number;
  trueCost: number;
  totalPm: number;
  difference: number;
};

/** Portal totals: each A.1 category is rounded independently before multiplication. */
export function personnelLineTotals(
  costLine: string,
  roles: LumpSumRole[],
  efforts: LumpSumEffort[],
  workPackages: LumpSumWorkPackage[],
  a4UnitCost: number,
): PersonnelLineTotals {
  const groups = new Map<string, LumpSumRole[]>();
  for (const role of roles) {
    const key = costLine === 'A.1' ? (role.he_category || 'blank') : 'all';
    groups.set(key, [...(groups.get(key) ?? []), role]);
  }
  let portalCost = 0;
  let trueCost = 0;
  let totalPm = 0;
  for (const groupRoles of groups.values()) {
    const groupPm = personMonthsForRoles(groupRoles, efforts, workPackages);
    const rate = averageWeightedPmRate(groupRoles, efforts, workPackages, costLine, a4UnitCost);
    const groupTrue = groupRoles.reduce((sum, role) => {
      const roleRate = costLine === 'A.4' ? a4UnitCost : Number(role.pm_rate || 0);
      return sum + personMonthsForRoles([role], efforts, workPackages) * roleRate;
    }, 0);
    portalCost += categoryCost(rate, groupPm);
    trueCost += groupTrue;
    totalPm += groupPm;
  }
  return { portalCost, trueCost, totalPm, difference: portalCost - trueCost };
}

/** Backwards-compatible name for existing callers while the implementation lives here. */
export const costLineTotals = personnelLineTotals;

export type PersonnelSubtotal = {
  pms: number[];
  totalPm: number;
  trueCost: number;
  roundedAverage: number;
  cost: number;
};

export function personnelSubtotal(
  roles: LumpSumRole[],
  efforts: LumpSumEffort[],
  workPackages: LumpSumWorkPackage[],
) : PersonnelSubtotal {
  const pms = workPackages.map(wp => personMonthsForRoles(roles, efforts, workPackages, wp.id));
  const totalPm = pms.reduce((sum, value) => sum + value, 0);
  const trueCost = roles.reduce((sum, role) => sum + personMonthsForRoles([role], efforts, workPackages) * Number(role.pm_rate || 0), 0);
  const roundedAverage = totalPm ? roundCents(trueCost / totalPm) : 0;
  return { pms, totalPm, trueCost, roundedAverage, cost: categoryCost(roundedAverage, totalPm) };
}

/** A.1, A.2, A.3 and A.4 totals for one participant. */
export function personnelLineTotalsByLine(
  roles: LumpSumRole[], efforts: LumpSumEffort[], workPackages: LumpSumWorkPackage[], a4UnitCost: number,
) {
  return Object.fromEntries(PERSONNEL_LINES.map(line => [line, personnelLineTotals(
    line, roles.filter(role => role.cost_line === line), efforts, workPackages, a4UnitCost,
  )])) as Record<typeof PERSONNEL_LINES[number], PersonnelLineTotals>;
}

/** A total per work package, using each category's rounded portal rate. */
export function personnelByWorkPackage(
  roles: LumpSumRole[], efforts: LumpSumEffort[], workPackages: LumpSumWorkPackage[], a4UnitCost: number, roundEachWp = false,
) {
  const result: Record<string, number> = Object.fromEntries(workPackages.map(wp => [wp.id, 0]));
  for (const line of PERSONNEL_LINES) {
    const lineRoles = roles.filter(role => role.cost_line === line);
    const groups = new Map<string, LumpSumRole[]>();
    for (const role of lineRoles) {
      const key = line === 'A.1' ? (role.he_category || 'blank') : 'all';
      groups.set(key, [...(groups.get(key) ?? []), role]);
    }
    for (const groupRoles of groups.values()) {
      const rate = averageWeightedPmRate(groupRoles, efforts, workPackages, line, a4UnitCost);
      for (const wp of workPackages) {
        const value = categoryCost(rate, personMonthsForRoles(groupRoles, efforts, workPackages, wp.id));
        result[wp.id] += roundEachWp ? roundCents(value) : value;
      }
    }
  }
  return result;
}

export function costLineAmount(items: LumpSumCostItem[], costLine: string, wpId?: string) {
  return items
    .filter(item => item.cost_line === costLine && (wpId == null || item.wp_draft_id === wpId))
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
}

export function depreciationAmount(items: DepreciationItem[], resourceType: string, wpId?: string) {
  return items
    .filter(item => item.include_in_c2 && item.resource_type === resourceType && (wpId == null || item.wp_draft_id === wpId))
    .reduce((sum, item) => sum + Number(item.charged_depreciation ?? 0), 0);
}

export function mirroredCostLineAmount(items: LumpSumCostItem[], depreciation: DepreciationItem[], costLine: string, wpId?: string) {
  const resourceType = costLine.startsWith('C.2.') ? costLine.slice('C.2.'.length) : '';
  return costLineAmount(items, costLine, wpId) + (resourceType ? depreciationAmount(depreciation, resourceType, wpId) : 0);
}

/** B, C and D inputs per participant and work package, including C.2 depreciation mirrors. */
export function buildWpInputs(
  roles: LumpSumRole[], efforts: LumpSumEffort[], workPackages: LumpSumWorkPackage[], a4UnitCost: number,
  items: LumpSumCostItem[], depreciation: DepreciationItem[],
): Record<string, LumpSumWpInputs> {
  const personnel = personnelByWorkPackage(roles, efforts, workPackages, a4UnitCost);
  return Object.fromEntries(workPackages.map(wp => {
    const purchase = COST_LINES.reduce((sum, line) => sum + mirroredCostLineAmount(items, depreciation, line, wp.id), 0);
    const other = D_LINES.reduce((sum, line) => sum + costLineAmount(items, line, wp.id), 0);
    return [wp.id, {
      personnel: personnel[wp.id] ?? 0,
      subcontracting: costLineAmount(items, 'B.1', wp.id),
      purchase,
      other,
    }];
  }));
}

export function computeWpTotals(
  inputs: LumpSumWpInputs,
  indirectCostRate: number,
  fundingRate: number,
  storedRequest: number | null,
): LumpSumWpTotals {
  const indirect = roundCents((inputs.personnel + inputs.purchase) * indirectCostRate / 100);
  const totalCosts = roundCents(inputs.personnel + inputs.subcontracting + inputs.purchase + inputs.other + indirect);
  const maxEuContribution = roundCents(totalCosts * fundingRate / 100);
  const stored = storedRequest == null ? null : roundCents(storedRequest);
  const exceeds = stored != null && stored - maxEuContribution > 0.004;
  return {
    ...inputs,
    indirect,
    totalCosts,
    maxEuContribution,
    requestedEuContribution: stored == null ? maxEuContribution : Math.min(stored, maxEuContribution),
    storedExceedsMax: exceeds ? stored : null,
  };
}

export function requestedPercentage(requested: number, maximum: number) {
  if (!(maximum > 0)) return null;
  return Math.min(100, roundCents(requested / maximum * 100));
}

export function participantPersonMonths(roles: LumpSumRole[], efforts: LumpSumEffort[], workPackages: LumpSumWorkPackage[]) {
  return personMonthsForRoles(roles, efforts, workPackages);
}

export function equipmentAndPersonnelTotals(
  roles: LumpSumRole[], efforts: LumpSumEffort[], workPackages: LumpSumWorkPackage[], a4UnitCost: number,
  items: LumpSumCostItem[], depreciation: DepreciationItem[],
) {
  const personnel = participantPersonMonths(roles, efforts, workPackages);
  const personnelCost = Object.values(personnelByWorkPackage(roles, efforts, workPackages, a4UnitCost)).reduce((sum, value) => sum + value, 0);
  const equipmentCost = costLineAmount(items, 'C.2.equipment') + depreciationAmount(depreciation, 'equipment');
  return { personnel, personnelCost, equipmentCost };
}
