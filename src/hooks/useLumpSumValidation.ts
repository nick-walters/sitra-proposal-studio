import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { costLineTotals } from '@/components/LumpSumPersonnelTable';
import { useLumpSumPersonnel } from '@/hooks/useLumpSumPersonnel';
import { useLumpSumCosts } from '@/hooks/useLumpSumCosts';
import { useLumpSumDepreciation } from '@/hooks/useLumpSumDepreciation';
import { computeWpTotals, useLumpSumTotals } from '@/hooks/useLumpSumTotals';
import { formatCurrency } from '@/lib/formatNumber';

/**
 * Distinct from ['ls-personnel', …], ['ls-costs', …], ['ls-depreciation', …],
 * ['ls-totals', …] and ['ls-access', …]: no collision and no prefix overlap.
 * This query reads wp_draft_effort only; it never writes.
 */
export const LUMP_SUM_VALIDATION_QUERY_KEY = (proposalId: string) => ['ls-validation', proposalId] as const;

export type LsSeverity = 'error' | 'warning' | 'info';

export type LsFinding = {
  id: string;
  rule: number;
  severity: LsSeverity;
  participantId: string | null;
  participantLabel: string;
  wpLabel: string | null;
  costLine: string | null;
  message: string;
};

const JUSTIFICATION_REQUIRED = new Set(['B.1', 'C.2.infrastructure', 'C.2.equipment', 'C.2.other_assets', 'D.1', 'D.2']);
const C_LINES = new Set(['C.1', 'C.2.infrastructure', 'C.2.equipment', 'C.2.other_assets', 'C.3.consumables', 'C.3.meetings', 'C.3.dissemination', 'C.3.publication', 'C.3.other']);
const D_LINES = new Set(['D.1', 'D.2']);
const PERSONNEL_LINES = ['A.1', 'A.2', 'A.3', 'A.4'];

function formatPm(value: number) {
  return value.toFixed(1);
}

export function useLumpSumValidation(proposalId: string) {
  const personnel = useLumpSumPersonnel(proposalId);
  const costs = useLumpSumCosts(proposalId);
  const depreciation = useLumpSumDepreciation(proposalId);
  const totals = useLumpSumTotals(proposalId);

  const effortQuery = useQuery({
    queryKey: LUMP_SUM_VALIDATION_QUERY_KEY(proposalId),
    enabled: Boolean(proposalId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_draft_effort')
        .select('wp_draft_id, participant_id, person_months, wp_drafts!inner(proposal_id)')
        .eq('wp_drafts.proposal_id', proposalId);
      if (error) throw error;
      return (data ?? []) as { wp_draft_id: string; participant_id: string; person_months: number }[];
    },
  });

  const isLoading = personnel.isLoading || costs.isLoading || depreciation.isLoading || totals.isLoading || effortQuery.isLoading;

  const findings = useMemo<LsFinding[]>(() => {
    const pData = personnel.data;
    const tData = totals.data;
    if (!pData || !tData) return [];

    const workPackages = pData.workPackages;
    const participants = pData.participants;
    const costItems = costs.data?.items ?? [];
    const depItems = depreciation.data?.items ?? [];
    const matrixEffort = effortQuery.data ?? [];
    const out: LsFinding[] = [];

    const wpLabel = (wpId: string) => {
      const wp = workPackages.find(item => item.id === wpId);
      if (!wp) return null;
      return wp.short_name ? `WP${wp.number}: ${wp.short_name}` : `WP${wp.number}`;
    };
    const participantLabel = (participant: { participant_number: number | null; organisation_short_name: string | null; organisation_name: string }) =>
      `${participant.participant_number ?? '—'}. ${participant.organisation_short_name || participant.organisation_name}`;

    /**
     * Per-participant, per-work-package A–D inputs. Personnel comes from
     * costLineTotals — the same single implementation the personnel tables and
     * the totals section use — so no rounding rule is duplicated here.
     */
    const consortiumWpCost = new Map<string, number>();
    workPackages.forEach(wp => consortiumWpCost.set(wp.id, 0));

    for (const participant of participants) {
      const label = participantLabel(participant);
      const roles = pData.roles.filter(role => role.participant_id === participant.id);
      const a4UnitCost = Number(pData.participantBudgets.find(budget => budget.participant_id === participant.id)?.a4_unit_cost ?? 0);
      const efforts = pData.efforts;
      const participantCostItems = costItems.filter(item => item.participant_id === participant.id);
      const participantDepItems = depItems.filter(item => item.participant_id === participant.id);

      const inputs: Record<string, { personnel: number; subcontracting: number; purchase: number; other: number }> = {};
      for (const wp of workPackages) inputs[wp.id] = { personnel: 0, subcontracting: 0, purchase: 0, other: 0 };

      const addPersonnelGroup = (line: string, groupRoles: typeof roles) => {
        const groupTotals = costLineTotals(line, groupRoles, efforts, workPackages, a4UnitCost);
        const rate = groupTotals.totalPm ? groupTotals.portalCost / groupTotals.totalPm : 0;
        for (const wp of workPackages) {
          const pm = groupRoles.reduce((sum, role) => sum + Number(efforts.find(effort => effort.role_id === role.id && effort.wp_draft_id === wp.id)?.person_months || 0), 0);
          inputs[wp.id].personnel += rate * pm;
        }
      };
      for (const line of PERSONNEL_LINES) {
        const lineRoles = roles.filter(role => role.cost_line === line);
        if (line === 'A.1') {
          const categories = [...new Set(lineRoles.map(role => role.he_category || 'blank'))];
          for (const category of categories) addPersonnelGroup(line, lineRoles.filter(role => (role.he_category || 'blank') === category));
        } else {
          addPersonnelGroup(line, lineRoles);
        }
      }
      for (const item of participantCostItems) {
        const target = inputs[item.wp_draft_id];
        if (!target) continue;
        const amount = Number(item.amount ?? 0);
        if (item.cost_line === 'B.1') target.subcontracting += amount;
        else if (C_LINES.has(item.cost_line)) target.purchase += amount;
        else if (D_LINES.has(item.cost_line)) target.other += amount;
      }
      for (const item of participantDepItems) {
        if (!item.include_in_c2) continue;
        const target = inputs[item.wp_draft_id];
        if (target) target.purchase += Number(item.charged_depreciation ?? 0);
      }

      const fundingRate = Number(
        tData.participantBudgets.find(budget => budget.participant_id === participant.id)?.funding_rate_override
        ?? tData.defaultFundingRate,
      );

      let participantTotalCost = 0;
      let participantG = 0;
      let participantH = 0;

      for (const wp of workPackages) {
        const stored = tData.wpBudgets.find(row => row.participant_id === participant.id && row.wp_draft_id === wp.id)?.requested_eu_contribution ?? null;
        const wpTotals = computeWpTotals(inputs[wp.id], tData.indirectCostRate, fundingRate, stored);
        participantTotalCost += wpTotals.totalCosts;
        participantG += wpTotals.maxEuContribution;
        participantH += wpTotals.requestedEuContribution;
        consortiumWpCost.set(wp.id, (consortiumWpCost.get(wp.id) ?? 0) + wpTotals.totalCosts);

        // Rule 2 — H above G.
        if (wpTotals.storedExceedsMax != null) {
          out.push({
            id: `r2-${participant.id}-${wp.id}`,
            rule: 2,
            severity: 'error',
            participantId: participant.id,
            participantLabel: label,
            wpLabel: wpLabel(wp.id),
            costLine: 'H',
            message: `Requested EU contribution ${formatCurrency(wpTotals.storedExceedsMax)} exceeds the maximum ${formatCurrency(wpTotals.maxEuContribution)}.`,
          });
        }
      }

      // Rule 4 — participant with a total cost of zero.
      if (participantTotalCost <= 0) {
        out.push({
          id: `r4-${participant.id}`,
          rule: 4,
          severity: 'error',
          participantId: participant.id,
          participantLabel: label,
          wpLabel: null,
          costLine: null,
          message: 'Total cost is zero for this participant.',
        });
      }

      // Rules 1 and 5 — missing justifications.
      for (const item of participantCostItems) {
        const amount = Number(item.amount ?? 0);
        if (amount <= 0) continue;
        if (item.justification && item.justification.trim()) continue;
        const required = JUSTIFICATION_REQUIRED.has(item.cost_line);
        out.push({
          id: `r${required ? 1 : 5}-${item.id}`,
          rule: required ? 1 : 5,
          severity: required ? 'error' : 'warning',
          participantId: participant.id,
          participantLabel: label,
          wpLabel: wpLabel(item.wp_draft_id),
          costLine: item.cost_line,
          message: `${formatCurrency(amount)} entered with no justification.`,
        });
      }

      // Rule 3 — personnel role with no F&TP category.
      for (const role of roles) {
        if (role.he_category && role.he_category.trim()) continue;
        out.push({
          id: `r3-${role.id}`,
          rule: 3,
          severity: 'error',
          participantId: participant.id,
          participantLabel: label,
          wpLabel: null,
          costLine: role.cost_line,
          message: `Role “${role.role_name || 'Untitled role'}” has no F&TP category selected.`,
        });
      }

      // Rule 7 — equipment above 15% of personnel costs.
      const personnelCost = workPackages.reduce((sum, wp) => sum + inputs[wp.id].personnel, 0);
      const equipmentCost = participantCostItems
        .filter(item => item.cost_line === 'C.2.equipment')
        .reduce((sum, item) => sum + Number(item.amount ?? 0), 0)
        + participantDepItems
          .filter(item => item.include_in_c2 && item.resource_type === 'equipment')
          .reduce((sum, item) => sum + Number(item.charged_depreciation ?? 0), 0);
      if (equipmentCost > personnelCost * 0.15) {
        out.push({
          id: `r7-${participant.id}`,
          rule: 7,
          severity: 'warning',
          participantId: participant.id,
          participantLabel: label,
          wpLabel: null,
          costLine: 'C.2 equipment',
          message: `Equipment ${formatCurrency(equipmentCost)} exceeds 15% of personnel costs ${formatCurrency(personnelCost)}. Justify this in Part B.`,
        });
      }

      // Rule 8 — budget person-months versus the A3 effort matrix, per work package.
      for (const wp of workPackages) {
        const budgetPm = roles.reduce((sum, role) => sum + Number(efforts.find(effort => effort.role_id === role.id && effort.wp_draft_id === wp.id)?.person_months || 0), 0);
        const matrixPm = matrixEffort
          .filter(row => row.wp_draft_id === wp.id && row.participant_id === participant.id)
          .reduce((sum, row) => sum + Number(row.person_months || 0), 0);
        const difference = budgetPm - matrixPm;
        if (Math.abs(difference) < 0.05) continue;
        out.push({
          id: `r8-${participant.id}-${wp.id}`,
          rule: 8,
          severity: 'warning',
          participantId: participant.id,
          participantLabel: label,
          wpLabel: wpLabel(wp.id),
          costLine: 'A personnel',
          message: `Budget ${formatPm(budgetPm)} PM against ${formatPm(matrixPm)} PM in the effort matrix (difference ${formatPm(difference)} PM).`,
        });
      }

      // Rule 9 — depreciation item excluded from C.2.
      for (const item of participantDepItems) {
        if (item.include_in_c2) continue;
        out.push({
          id: `r9-${item.id}`,
          rule: 9,
          severity: 'warning',
          participantId: participant.id,
          participantLabel: label,
          wpLabel: wpLabel(item.wp_draft_id),
          costLine: 'C.2 depreciation',
          message: `“${item.short_name || 'Unnamed investment'}” is excluded from C.2 and will not reach the portal.`,
        });
      }

      // Rule 10 — requesting less than the maximum.
      if (participantG - participantH > 0.004) {
        out.push({
          id: `r10-${participant.id}`,
          rule: 10,
          severity: 'info',
          participantId: participant.id,
          participantLabel: label,
          wpLabel: null,
          costLine: null,
          message: `Requesting ${formatCurrency(participantH)} of a maximum ${formatCurrency(participantG)} — ${formatCurrency(participantG - participantH)} below the maximum.`,
        });
      }
    }

    // Rule 6 — work package with zero cost across the consortium.
    for (const wp of workPackages) {
      if ((consortiumWpCost.get(wp.id) ?? 0) > 0) continue;
      out.push({
        id: `r6-${wp.id}`,
        rule: 6,
        severity: 'warning',
        participantId: null,
        participantLabel: 'Consortium',
        wpLabel: wpLabel(wp.id),
        costLine: null,
        message: 'No participant has budgeted any cost for this work package.',
      });
    }

    return out;
  }, [costs.data?.items, depreciation.data?.items, effortQuery.data, personnel.data, totals.data]);

  const counts = useMemo(() => ({
    error: findings.filter(finding => finding.severity === 'error').length,
    warning: findings.filter(finding => finding.severity === 'warning').length,
    info: findings.filter(finding => finding.severity === 'info').length,
  }), [findings]);

  return { findings, counts, isLoading };
}
