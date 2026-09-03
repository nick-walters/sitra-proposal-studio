import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { formatPercent, formatCurrency } from '@/lib/formatNumber';
import { computeBudgetRow } from '@/lib/budgetCompute';
import {
  buildWpInputs,
  computeWpTotals,
  costLineAmount,
  depreciationAmount,
  roundCents,
} from '@/lib/lumpSumFigures';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  MinusCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface BudgetValidationDialogProps {
  proposalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ValidationRule {
  id: string;
  name: string;
  /** What the rule checks, shown to the author whether or not it fires. */
  criterion: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** `skipped` = the rule cannot be evaluated yet (no data to check against). */
  status: 'passed' | 'failed' | 'skipped';
}


/**
 * The topic's indicative maximum budget per project is captured as free text on
 * the topic information page (`proposals.indicative_budget_per_project`), e.g.
 * "15000000", "€3 500 000" or a range such as "3,000,000–4,000,000". We take the
 * largest number found — for a range that is the upper bound, which is the
 * ceiling a proposal must not exceed. Returns null when nothing parseable is
 * stored, in which case the check is skipped rather than failed.
 */
export function parseIndicativeMaximum(text: string | null | undefined): number | null {
  if (!text) return null;
  const matches = String(text).match(/\d[\d\s.,]*/g);
  if (!matches) return null;
  const values: number[] = [];
  for (const raw of matches) {
    // Strip spaces and thousands separators; treat a trailing ",dd"/".dd" as decimals.
    let s = raw.replace(/\s/g, '');
    const dec = s.match(/[.,](\d{1,2})$/);
    let fraction = 0;
    if (dec) {
      fraction = Number(`0.${dec[1]}`);
      s = s.slice(0, dec.index);
    }
    const whole = Number(s.replace(/[.,]/g, ''));
    if (Number.isFinite(whole) && whole > 0) values.push(whole + fraction);
  }
  if (values.length === 0) return null;
  return Math.max(...values);
}


async function validateLumpSumBudget(
  proposalId: string,
  parts: any[],
  indicativeMax: number | null,
): Promise<ValidationRule[]> {
  const [wpResult, roleResult, effortResult, itemResult, depreciationResult, wpBudgetResult, participantBudgetResult, proposalResult] = await Promise.all([
    supabase.from('wp_drafts').select('id, number, short_name, title, color').eq('proposal_id', proposalId).order('number'),
    supabase.from('ls_personnel_roles').select('id, proposal_id, participant_id, cost_line, role_name, he_category, pm_rate, order_index').eq('proposal_id', proposalId),
    supabase.from('ls_personnel_effort').select('id, role_id, wp_draft_id, person_months').eq('proposal_id', proposalId),
    supabase.from('ls_cost_items').select('id, proposal_id, participant_id, wp_draft_id, cost_line, quantity, unit_cost, amount, justification, order_index').eq('proposal_id', proposalId),
    supabase.from('ls_depreciation_items').select('id, proposal_id, participant_id, wp_draft_id, resource_type, short_name, purchase_date, purchase_cost, pct_project, pct_useful_life, comments, include_in_c2, order_index, charged_depreciation').eq('proposal_id', proposalId),
    supabase.from('ls_wp_budget').select('id, participant_id, wp_draft_id, comments, requested_eu_contribution').eq('proposal_id', proposalId),
    supabase.from('ls_participant_budget').select('participant_id, a4_unit_cost, funding_rate_override, is_locked').eq('proposal_id', proposalId),
    supabase.from('proposals').select('ls_indirect_cost_rate, ls_default_funding_rate').eq('id', proposalId).single(),
  ]);
  const failure = [wpResult, roleResult, effortResult, itemResult, depreciationResult, wpBudgetResult, participantBudgetResult, proposalResult].find(result => result.error);
  if (failure?.error) throw failure.error;

  const workPackages = (wpResult.data ?? []) as any[];
  const roles = (roleResult.data ?? []) as any[];
  const efforts = (effortResult.data ?? []) as any[];
  const items = (itemResult.data ?? []) as any[];
  const depreciation = (depreciationResult.data ?? []) as any[];
  const wpBudgets = (wpBudgetResult.data ?? []) as any[];
  const participantBudgets = (participantBudgetResult.data ?? []) as any[];
  const indirectRate = Number(proposalResult.data?.ls_indirect_cost_rate ?? 0);
  const defaultFundingRate = Number(proposalResult.data?.ls_default_funding_rate ?? 0);
  const totals = new Map<string, { direct: number; personnel: number; subcontracting: number; equipment: number; requested: number; hasData: boolean }>();
  let totalDirect = 0;
  let totalDirectExFstp = 0;
  let subcontractingTotal = 0;
  let personnelTotal = 0;
  let requestedTotal = 0;
  let equipmentTotal = 0;

  for (const participant of parts) {
    const participantRoles = roles.filter(role => role.participant_id === participant.id);
    const participantItems = items.filter(item => item.participant_id === participant.id);
    const participantDepreciation = depreciation.filter(item => item.participant_id === participant.id);
    const participantBudget = participantBudgets.find(row => row.participant_id === participant.id);
    const a4UnitCost = Number(participantBudget?.a4_unit_cost ?? 0);
    const fundingRate = participantBudget?.funding_rate_override ?? defaultFundingRate;
    const inputs = buildWpInputs(participantRoles, efforts, workPackages, a4UnitCost, participantItems, participantDepreciation);
    const participantTotals = { direct: 0, personnel: 0, subcontracting: 0, equipment: 0, requested: 0, hasData: false };

    for (const wp of workPackages) {
      const input = inputs[wp.id] ?? { personnel: 0, subcontracting: 0, purchase: 0, other: 0 };
      const stored = wpBudgets.find(row => row.participant_id === participant.id && row.wp_draft_id === wp.id)?.requested_eu_contribution ?? null;
      const wpTotal = computeWpTotals(input, indirectRate, Number(fundingRate), stored);
      const hasData = stored != null || input.personnel !== 0 || input.subcontracting !== 0 || input.purchase !== 0 || input.other !== 0;
      participantTotals.direct += input.personnel + input.subcontracting + input.purchase + input.other;
      participantTotals.personnel += input.personnel;
      participantTotals.subcontracting += input.subcontracting;
      participantTotals.requested += wpTotal.requestedEuContribution;
      participantTotals.hasData ||= hasData;
      participantTotals.equipment += costLineAmount(participantItems, 'C.2.equipment', wp.id) + depreciationAmount(participantDepreciation, 'equipment', wp.id);
    }
    totals.set(participant.id, participantTotals);
    totalDirect += participantTotals.direct;
    totalDirectExFstp += participantTotals.direct;
    subcontractingTotal += participantTotals.subcontracting;
    personnelTotal += participantTotals.personnel;
    requestedTotal += participantTotals.requested;
    equipmentTotal += participantTotals.equipment;
  }

  const results: ValidationRule[] = [];
  const populatedRows = wpBudgets.filter(row => row.requested_eu_contribution != null || row.comments?.trim());
  results.push({
    id: 'empty-budget', name: 'Budget populated',
    criterion: 'At least one participant has budget data entered', severity: 'error',
    message: populatedRows.length === 0 ? 'No budget data has been entered' : `${populatedRows.length} work-package budget row(s) entered`,
    status: populatedRows.length === 0 ? 'failed' : 'passed',
  });

  if (indicativeMax != null && populatedRows.length > 0) {
    const overage = roundCents(requestedTotal - indicativeMax);
    results.push({
      id: 'indicative-maximum', name: 'Indicative maximum budget',
      criterion: 'Requested EU contribution does not exceed the topic’s indicative maximum', severity: 'error',
      message: overage > 0 ? `Requested EU contribution ${formatCurrency(requestedTotal)} exceeds the topic's indicative maximum ${formatCurrency(indicativeMax)} by ${formatCurrency(overage)}` : `Requested EU contribution ${formatCurrency(requestedTotal)} is within the topic's indicative maximum ${formatCurrency(indicativeMax)}`,
      status: overage > 0 ? 'failed' : 'passed',
    });
  } else {
    results.push({
      id: 'indicative-maximum', name: 'Indicative maximum budget',
      criterion: 'Requested EU contribution does not exceed the topic’s indicative maximum', severity: 'error',
      message: indicativeMax == null ? 'No indicative maximum is recorded on the topic information page, so this check cannot run' : 'No budget data to compare against the indicative maximum', status: 'skipped',
    });
  }

  if (totalDirect > 0 && subcontractingTotal > 0) {
    const ratio = subcontractingTotal / totalDirect;
    results.push({ id: 'subcontracting-ratio', name: 'Subcontracting ratio', criterion: 'Subcontracting stays at or below 30% of direct costs', severity: 'warning', message: ratio > 0.3 ? `Subcontracting is ${formatPercent(ratio * 100)} of direct costs (>30% requires justification)` : `Subcontracting is ${formatPercent(ratio * 100)} of direct costs`, status: ratio > 0.3 ? 'failed' : 'passed' });
  } else {
    results.push({ id: 'subcontracting-ratio', name: 'Subcontracting ratio', criterion: 'Subcontracting stays at or below 30% of direct costs', severity: 'warning', message: totalDirect > 0 ? 'No subcontracting costs entered' : 'No direct costs to measure against', status: totalDirect > 0 ? 'passed' : 'skipped' });
  }

  const zeroParts = parts.filter(part => (totals.get(part.id)?.direct ?? 0) === 0);
  results.push({ id: 'zero-budget', name: 'Zero-budget participants', criterion: 'Every participant carries some budget', severity: 'warning', message: parts.length === 0 ? 'No participants have been added yet' : zeroParts.length > 0 ? `${zeroParts.length} participant(s) have no budget: ${zeroParts.map(part => part.organisation_short_name || part.organisation_name).join(', ')}` : `All ${parts.length} participants have budget entered`, status: parts.length === 0 ? 'skipped' : zeroParts.length > 0 ? 'failed' : 'passed' });

  if (totalDirectExFstp > 0 && parts.length > 1) {
    const top = [...totals.entries()].reduce<[string, number] | null>((best, entry) => best == null || entry[1].direct > best[1] ? [entry[0], entry[1].direct] : best, null);
    const share = top ? top[1] / totalDirectExFstp : 0;
    const participant = top ? parts.find(part => part.id === top[0]) : undefined;
    results.push({ id: 'concentration', name: 'Budget concentration', criterion: 'No participant holds more than 35% of direct costs (excl. FSTP)', severity: 'warning', message: `${participant?.organisation_short_name || 'The largest partner'} holds ${formatPercent(share * 100, 0)} of budget (excl. FSTP; >35% flagged)`, status: share > 0.35 ? 'failed' : 'passed' });
  } else {
    results.push({ id: 'concentration', name: 'Budget concentration', criterion: 'No participant holds more than 35% of direct costs (excl. FSTP)', severity: 'warning', message: parts.length > 1 ? 'No direct costs (excl. FSTP) to measure' : 'Only one participant, so concentration does not apply', status: 'skipped' });
  }

  results.push({ id: 'no-personnel', name: 'Personnel costs', criterion: 'Personnel costs are entered alongside other direct costs', severity: 'warning', message: totalDirect === 0 ? 'No direct costs entered yet' : personnelTotal === 0 ? 'No personnel costs have been entered' : `Personnel costs total ${formatCurrency(personnelTotal)}`, status: totalDirect === 0 ? 'skipped' : personnelTotal === 0 ? 'failed' : 'passed' });

  if (personnelTotal > 0) {
    const ratio = equipmentTotal / personnelTotal;
    if (ratio > 0.15) {
      const justified = items.some(item => item.cost_line === 'C.2.equipment' && item.justification?.trim()) || depreciation.some(item => item.resource_type === 'equipment' && item.include_in_c2 && item.comments?.trim());
      results.push({ id: 'equipment-ratio', name: 'Equipment costs', criterion: 'Equipment above 15% of personnel costs carries a justification', severity: 'warning', message: `Equipment is ${formatPercent(ratio * 100)} of personnel costs (>15% requires justification)${justified ? ' — justification provided' : ''}`, status: justified ? 'passed' : 'failed' });
    } else {
      results.push({ id: 'equipment-ratio', name: 'Equipment costs', criterion: 'Equipment above 15% of personnel costs carries a justification', severity: 'warning', message: `Equipment is ${formatPercent(ratio * 100)} of personnel costs`, status: 'passed' });
    }
  } else {
    results.push({ id: 'equipment-ratio', name: 'Equipment costs', criterion: 'Equipment above 15% of personnel costs carries a justification', severity: 'warning', message: 'No personnel costs to measure equipment against', status: 'skipped' });
  }
  return results;
}

export function BudgetValidationDialog({ proposalId, open, onOpenChange }: BudgetValidationDialogProps) {
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runValidation = async () => {
    setLoading(true);
    try {
      const [{ data: budgetRows }, { data: participants }, { data: effortData }, { data: proposal }] = await Promise.all([
        supabase.from('budget_rows').select('*').eq('proposal_id', proposalId),
        supabase.from('participants').select('id, organisation_short_name, organisation_name, participant_number, organisation_category').eq('proposal_id', proposalId),
        supabase.from('wp_draft_effort').select('participant_id, person_months, wp_drafts!inner(proposal_id)').eq('wp_drafts.proposal_id', proposalId),
        supabase.from('proposals').select('type, budget_type, indicative_budget_per_project').eq('id', proposalId).maybeSingle(),
      ]);

      const results: ValidationRule[] = [];
      const rows = budgetRows || [];
      const parts = participants || [];
      const indicativeMax = parseIndicativeMaximum((proposal as any)?.indicative_budget_per_project);

      if ((proposal as any)?.budget_type === 'lump_sum') {
        setRules(await validateLumpSumBudget(proposalId, parts, indicativeMax));
        setHasRun(true);
        return;
      }

      const pmTotals = new Map<string, number>();
      (effortData || []).forEach((e: any) => {
        pmTotals.set(e.participant_id, (pmTotals.get(e.participant_id) || 0) + Number(e.person_months || 0));
      });

      const computePersonnelCosts = (r: any): number => {
        const pmRate = r.pm_rate != null ? Number(r.pm_rate) : null;
        const totalPMs = pmTotals.get(r.participant_id) || 0;
        if (pmRate != null && pmRate > 0) {
          return Math.round(pmRate * totalPMs);
        }
        return Number(r.personnel_costs) || 0;
      };

      let totalDirect = 0;
      let totalDirectExFstp = 0;
      let subcontractingTotal = 0;
      let personnelTotal = 0;
      const byParticipant: Record<string, number> = {};
      const byParticipantExFstp: Record<string, number> = {};

      rows.forEach(r => {
        const personnel = computePersonnelCosts(r);
        const sub = Number(r.subcontracting_costs) || 0;
        const travel = Number(r.purchase_travel) || 0;
        const equipment = Number(r.purchase_equipment) || 0;
        const otherGoods = Number(r.purchase_other_goods) || 0;
        const fstp = Number(r.financial_support_third_parties) || 0;
        const internally = Number(r.internally_invoiced) || 0;
        const procurement = Number(r.procurement) || 0;

        const direct = personnel + sub + travel + equipment + otherGoods + fstp + internally + procurement;
        const directExFstp = direct - fstp;
        totalDirect += direct;
        totalDirectExFstp += directExFstp;
        subcontractingTotal += sub;
        personnelTotal += personnel;
        byParticipant[r.participant_id] = (byParticipant[r.participant_id] || 0) + direct;
        byParticipantExFstp[r.participant_id] = (byParticipantExFstp[r.participant_id] || 0) + directExFstp;
      });

      // Every rule is always emitted, in a fixed order, so an author can see the
      // full checklist and its current state — not only the checks that fire.

      // 1. Budget populated.
      results.push({
        id: 'empty-budget',
        name: 'Budget populated',
        criterion: 'At least one participant has budget data entered',
        severity: 'error',
        message: rows.length === 0
          ? 'No budget data has been entered'
          : `${rows.length} participant budget row(s) entered`,
        status: rows.length === 0 ? 'failed' : 'passed',
      });

      // 2. Requested EU contribution vs the topic's indicative maximum budget.
      const indicativeMax = parseIndicativeMaximum((proposal as any)?.indicative_budget_per_project);
      if (indicativeMax != null && rows.length > 0) {
        const partById = new Map(parts.map((p) => [p.id, p]));
        const requestedTotal = rows.reduce((sum, r: any) => {
          const out = computeBudgetRow({
            ...r,
            totalPersonMonths: pmTotals.get(r.participant_id) || 0,
            proposalType: (proposal as any)?.type ?? null,
            organisationCategory: partById.get(r.participant_id)?.organisation_category ?? null,
          });
          return sum + out.requestedEuContribution;
        }, 0);
        const overage = Math.round((requestedTotal - indicativeMax) * 100) / 100;
        const exceeded = overage > 0;
        results.push({
          id: 'indicative-maximum',
          name: 'Indicative maximum budget',
          criterion: 'Requested EU contribution does not exceed the topic’s indicative maximum',
          severity: 'error',
          message: exceeded
            ? `Requested EU contribution ${formatCurrency(requestedTotal)} exceeds the topic's indicative maximum ${formatCurrency(indicativeMax)} by ${formatCurrency(overage)}`
            : `Requested EU contribution ${formatCurrency(requestedTotal)} is within the topic's indicative maximum ${formatCurrency(indicativeMax)}`,
          status: exceeded ? 'failed' : 'passed',
        });
      } else {
        results.push({
          id: 'indicative-maximum',
          name: 'Indicative maximum budget',
          criterion: 'Requested EU contribution does not exceed the topic’s indicative maximum',
          severity: 'error',
          message: indicativeMax == null
            ? 'No indicative maximum is recorded on the topic information page, so this check cannot run'
            : 'No budget data to compare against the indicative maximum',
          status: 'skipped',
        });
      }

      // 3. Subcontracting ratio.
      if (totalDirect > 0 && subcontractingTotal > 0) {
        const ratio = subcontractingTotal / totalDirect;
        const tooHigh = ratio > 0.3;
        results.push({
          id: 'subcontracting-ratio',
          name: 'Subcontracting ratio',
          criterion: 'Subcontracting stays at or below 30% of direct costs',
          severity: 'warning',
          message: tooHigh
            ? `Subcontracting is ${formatPercent(ratio * 100)} of direct costs (>30% requires justification)`
            : `Subcontracting is ${formatPercent(ratio * 100)} of direct costs`,
          status: tooHigh ? 'failed' : 'passed',
        });
      } else {
        results.push({
          id: 'subcontracting-ratio',
          name: 'Subcontracting ratio',
          criterion: 'Subcontracting stays at or below 30% of direct costs',
          severity: 'warning',
          message: totalDirect > 0 ? 'No subcontracting costs entered' : 'No direct costs to measure against',
          status: totalDirect > 0 ? 'passed' : 'skipped',
        });
      }

      // 4. Zero-budget participants.
      const zeroParts = parts.filter(p => (byParticipant[p.id] || 0) === 0);
      results.push({
        id: 'zero-budget',
        name: 'Zero-budget participants',
        criterion: 'Every participant carries some budget',
        severity: 'warning',
        message: parts.length === 0
          ? 'No participants have been added yet'
          : zeroParts.length > 0
            ? `${zeroParts.length} participant(s) have no budget: ${zeroParts.map(p => p.organisation_short_name || p.organisation_name).join(', ')}`
            : `All ${parts.length} participants have budget entered`,
        status: parts.length === 0 ? 'skipped' : zeroParts.length > 0 ? 'failed' : 'passed',
      });

      // 5. Budget concentration.
      if (totalDirectExFstp > 0 && parts.length > 1) {
        const entries = Object.entries(byParticipantExFstp);
        const top = entries.reduce<[string, number] | null>(
          (best, e) => (best == null || e[1] > best[1] ? e : best),
          null,
        );
        const share = top ? top[1] / totalDirectExFstp : 0;
        const over = share > 0.35;
        const p = top ? parts.find(pp => pp.id === top[0]) : undefined;
        results.push({
          id: 'concentration',
          name: 'Budget concentration',
          criterion: 'No participant holds more than 35% of direct costs (excl. FSTP)',
          severity: 'warning',
          message: `${p?.organisation_short_name || 'The largest partner'} holds ${formatPercent(share * 100, 0)} of budget (excl. FSTP; >35% flagged)`,
          status: over ? 'failed' : 'passed',
        });
      } else {
        results.push({
          id: 'concentration',
          name: 'Budget concentration',
          criterion: 'No participant holds more than 35% of direct costs (excl. FSTP)',
          severity: 'warning',
          message: parts.length > 1 ? 'No direct costs (excl. FSTP) to measure' : 'Only one participant, so concentration does not apply',
          status: 'skipped',
        });
      }

      // 6. Personnel costs present.
      results.push({
        id: 'no-personnel',
        name: 'Personnel costs',
        criterion: 'Personnel costs are entered alongside other direct costs',
        severity: 'warning',
        message: totalDirect === 0
          ? 'No direct costs entered yet'
          : personnelTotal === 0
            ? 'No personnel costs have been entered'
            : `Personnel costs total ${formatCurrency(personnelTotal)}`,
        status: totalDirect === 0 ? 'skipped' : personnelTotal === 0 ? 'failed' : 'passed',
      });

      // 7. Equipment ratio.
      const equipmentTotal = rows.reduce((s, r) => s + (Number(r.purchase_equipment) || 0), 0);
      if (personnelTotal > 0) {
        const ratio = equipmentTotal / personnelTotal;
        if (ratio > 0.15) {
          const hasJustification = await supabase
            .from('budget_rows')
            .select('purchase_equipment_justification')
            .eq('proposal_id', proposalId)
            .not('purchase_equipment_justification', 'is', null)
            .not('purchase_equipment_justification', 'eq', '');
          const justified = (hasJustification.data || []).length > 0;
          results.push({
            id: 'equipment-ratio',
            name: 'Equipment costs',
            criterion: 'Equipment above 15% of personnel costs carries a justification',
            severity: 'warning',
            message: `Equipment is ${formatPercent(ratio * 100)} of personnel costs (>15% requires justification)${justified ? ' — justification provided' : ''}`,
            status: justified ? 'passed' : 'failed',
          });
        } else {
          results.push({
            id: 'equipment-ratio',
            name: 'Equipment costs',
            criterion: 'Equipment above 15% of personnel costs carries a justification',
            severity: 'warning',
            message: `Equipment is ${formatPercent(ratio * 100)} of personnel costs`,
            status: 'passed',
          });
        }
      } else {
        results.push({
          id: 'equipment-ratio',
          name: 'Equipment costs',
          criterion: 'Equipment above 15% of personnel costs carries a justification',
          severity: 'warning',
          message: 'No personnel costs to measure equipment against',
          status: 'skipped',
        });
      }


      setRules(results);
      setHasRun(true);
    } catch (error) {
      console.error('Budget validation error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run validation when dialog opens
  useEffect(() => {
    if (open) {
      runValidation();
    }
  }, [open]);

  const passedCount = rules.filter(r => r.status === 'passed').length;
  const applicableCount = rules.filter(r => r.status !== 'skipped').length;
  const failedCount = rules.filter(r => r.status === 'failed').length;
  const percentage = applicableCount > 0 ? Math.round((passedCount / applicableCount) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Budget validation</DialogTitle>
          <DialogDescription>Every compliance check applied to the budget, and its current state</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && hasRun && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {passedCount}/{applicableCount} checks passed
                {failedCount > 0 ? ` · ${failedCount} to address` : ''}
                {rules.length > applicableCount ? ` · ${rules.length - applicableCount} not applicable` : ''}
              </span>
              <Button variant="ghost" size="sm" onClick={runValidation} className="gap-1.5 h-7 text-xs">
                <RefreshCw className="w-3 h-3" />
                Re-validate
              </Button>
            </div>
            <Progress value={percentage} className="h-2" />
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {rules.map(rule => (
                <div
                  key={rule.id}
                  className={`flex items-start gap-2 p-2 rounded-md text-sm ${
                    rule.status === 'passed'
                      ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400'
                      : rule.status === 'skipped'
                        ? 'bg-muted text-muted-foreground'
                        : rule.severity === 'error'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                  }`}
                >
                  {rule.status === 'passed' ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : rule.status === 'skipped' ? (
                    <MinusCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <div className="space-y-0.5">
                    <div>
                      <span className="font-medium">{rule.name}</span>
                      {rule.status === 'skipped' && <span className="ml-1.5 text-xs">(not applicable)</span>}
                    </div>
                    <div className="text-xs opacity-80">{rule.criterion}</div>
                    <div>{rule.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
