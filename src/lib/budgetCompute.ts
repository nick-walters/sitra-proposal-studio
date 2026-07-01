/**
 * Pure budget-row math, ported verbatim from useBudgetRows.computeRow.
 * Used by the A3 portal hook, the export renderer, and the eligibility check
 * so all three agree on the requested EU contribution figure.
 *
 * Inputs are snake_case to match the `budget_rows` DB schema directly — the
 * renderer and PanelEvaluator can feed raw rows; the hook adapts its
 * camelCase row shape at the call site.
 */

export interface BudgetComputeInput {
  // Cost columns (numeric, defaults to 0 if null/undefined)
  personnel_costs?: number | null;
  subcontracting_costs?: number | null;
  purchase_travel?: number | null;
  purchase_equipment?: number | null;
  purchase_other_goods?: number | null;
  financial_support_third_parties?: number | null;
  internally_invoiced?: number | null;
  procurement?: number | null;
  // Personnel rate (overrides personnel_costs when set)
  pm_rate?: number | null;
  totalPersonMonths?: number;
  // Overrides
  indirect_costs_override?: number | null;
  funding_rate_override?: number | null;
  /** Manual override for total requested EU contribution. */
  requested_eu_contribution?: number | null;
  // In-kind branch
  has_in_kind?: boolean | null;
  requested_personnel_costs?: number | null;
  requested_subcontracting?: number | null;
  requested_travel?: number | null;
  requested_equipment?: number | null;
  requested_other_goods?: number | null;
  requested_fstp?: number | null;
  requested_internally_invoiced?: number | null;
  // Context
  proposalType?: string | null;
  organisationCategory?: string | null;
}

export interface BudgetComputeOutput {
  personnel: number;
  directCosts: number;
  indirect: number;
  totalEligible: number;
  fundingRate: number;
  maxEuContribution: number;
  requestedEuContribution: number;
}

const n = (v: number | null | undefined): number => Number(v ?? 0) || 0;

export function computeBudgetRow(input: BudgetComputeInput): BudgetComputeOutput {
  const totalPm = Number(input.totalPersonMonths ?? 0) || 0;
  const pmRate = input.pm_rate != null ? Number(input.pm_rate) : null;

  const personnel = pmRate != null && pmRate > 0
    ? Math.round(pmRate * totalPm)
    : n(input.personnel_costs);

  const sub = n(input.subcontracting_costs);
  const travel = n(input.purchase_travel);
  const equip = n(input.purchase_equipment);
  const other = n(input.purchase_other_goods);
  const fstp = n(input.financial_support_third_parties);
  const internally = n(input.internally_invoiced);
  const procurement = n(input.procurement);

  const directCosts = personnel + sub + travel + equip + other + fstp + internally + procurement;

  const indirectBase = directCosts - sub - fstp;
  const indirect = input.indirect_costs_override != null
    ? Number(input.indirect_costs_override)
    : Math.round(indirectBase * 0.25 * 100) / 100;

  const totalEligible = directCosts + indirect;

  // RIA = 100% all; IA = 100% except LE (large enterprises) = 70%. SMEs get 100% even in IA.
  let fundingRate = input.funding_rate_override != null ? Number(input.funding_rate_override) : 100;
  if (input.funding_rate_override == null) {
    if (input.proposalType === 'IA' && input.organisationCategory === 'LE') {
      fundingRate = 70;
    }
  }

  const maxEuContribution = Math.round(totalEligible * (fundingRate / 100) * 100) / 100;

  let requestedEuContribution: number;
  if (input.has_in_kind) {
    const reqPersonnel = input.requested_personnel_costs ?? personnel;
    const reqSub = input.requested_subcontracting ?? sub;
    const reqTravel = input.requested_travel ?? travel;
    const reqEquip = input.requested_equipment ?? equip;
    const reqOther = input.requested_other_goods ?? other;
    const reqFstp = input.requested_fstp ?? fstp;
    const reqInternally = input.requested_internally_invoiced ?? internally;
    const reqDirectTotal =
      n(reqPersonnel) + n(reqSub) + n(reqTravel) + n(reqEquip) + n(reqOther) + n(reqFstp) + n(reqInternally);
    const reqIndirect = Math.round((reqDirectTotal - n(reqSub) - n(reqFstp)) * 0.25 * 100) / 100;
    requestedEuContribution = Math.min(reqDirectTotal + reqIndirect, maxEuContribution);
  } else {
    requestedEuContribution = input.requested_eu_contribution != null
      ? Math.min(Number(input.requested_eu_contribution), maxEuContribution)
      : maxEuContribution;
  }

  return {
    personnel,
    directCosts,
    indirect,
    totalEligible,
    fundingRate,
    maxEuContribution,
    requestedEuContribution,
  };
}
