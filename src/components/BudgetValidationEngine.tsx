import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CheckCircle2,
  Calculator,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BudgetValidationEngineProps {
  proposalId: string;
}

interface ValidationRule {
  id: string;
  name: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  passed: boolean;
}

export function BudgetValidationEngine({ proposalId }: BudgetValidationEngineProps) {
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runValidation = async () => {
    setLoading(true);
    try {
      const [{ data: budgetRows }, { data: participants }, { data: effortData }] = await Promise.all([
        supabase.from('budget_rows').select('*').eq('proposal_id', proposalId),
        supabase.from('participants').select('id, organisation_short_name, organisation_name, participant_number, organisation_category').eq('proposal_id', proposalId),
        supabase.from('wp_draft_effort').select('participant_id, person_months, wp_drafts!inner(proposal_id)').eq('wp_drafts.proposal_id', proposalId),
      ]);

      const results: ValidationRule[] = [];
      const rows = budgetRows || [];
      const parts = participants || [];

      // Build PM totals per participant from effort data
      const pmTotals = new Map<string, number>();
      (effortData || []).forEach((e: any) => {
        pmTotals.set(e.participant_id, (pmTotals.get(e.participant_id) || 0) + Number(e.person_months || 0));
      });

      // Compute actual personnel costs (same logic as useBudgetRows.computeRow)
      const computePersonnelCosts = (r: any): number => {
        const pmRate = r.pm_rate != null ? Number(r.pm_rate) : null;
        const totalPMs = pmTotals.get(r.participant_id) || 0;
        if (pmRate != null && pmRate > 0) {
          return Math.round(pmRate * totalPMs);
        }
        return Number(r.personnel_costs) || 0;
      };

      // Calculate totals using correct personnel cost computation
      let totalDirect = 0;
      let subcontractingTotal = 0;
      let personnelTotal = 0;
      const byParticipant: Record<string, number> = {};

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
        totalDirect += direct;
        subcontractingTotal += sub;
        personnelTotal += personnel;
        byParticipant[r.participant_id] = (byParticipant[r.participant_id] || 0) + direct;
      });

      // Rule 1: Empty budget
      if (rows.length === 0) {
        results.push({ id: 'empty-budget', name: 'Budget populated', severity: 'error', message: 'No budget data has been entered', passed: false });
      }

      // Rule 2: Subcontracting ratio
      if (totalDirect > 0 && subcontractingTotal > 0) {
        const ratio = subcontractingTotal / totalDirect;
        const tooHigh = ratio > 0.3;
        results.push({
          id: 'subcontracting-ratio', name: 'Subcontracting ratio',
          severity: tooHigh ? 'warning' : 'info',
          message: tooHigh ? `Subcontracting is ${(ratio * 100).toFixed(1)}% of direct costs (>30% requires justification)` : `Subcontracting is ${(ratio * 100).toFixed(1)}% of direct costs`,
          passed: !tooHigh,
        });
      }

      // Rule 3: Zero-budget participants
      const zeroParts = parts.filter(p => (byParticipant[p.id] || 0) === 0);
      if (zeroParts.length > 0) {
        results.push({
          id: 'zero-budget', name: 'Zero-budget participants', severity: 'warning',
          message: `${zeroParts.length} participant(s) have no budget: ${zeroParts.map(p => p.organisation_short_name || p.organisation_name).join(', ')}`,
          passed: false,
        });
      }

      // Rule 4: Budget concentration
      if (totalDirect > 0 && parts.length > 1) {
        const over = Object.entries(byParticipant).find(([, amount]) => amount / totalDirect > 0.5);
        if (over) {
          const p = parts.find(p => p.id === over[0]);
          results.push({
            id: 'concentration', name: 'Budget concentration', severity: 'warning',
            message: `${p?.organisation_short_name || 'A partner'} holds ${((over[1] / totalDirect) * 100).toFixed(0)}% of total budget`,
            passed: false,
          });
        }
      }

      // Rule 5: No personnel costs
      if (totalDirect > 0 && personnelTotal === 0) {
        results.push({ id: 'no-personnel', name: 'Personnel costs', severity: 'warning', message: 'No personnel costs have been entered', passed: false });
      }

      // Rule 6: Equipment > 15% of personnel costs
      if (personnelTotal > 0) {
        const equipmentTotal = rows.reduce((s, r) => s + (Number(r.purchase_equipment) || 0), 0);
        if (equipmentTotal > personnelTotal * 0.15) {
          const hasJustification = await supabase
            .from('budget_rows')
            .select('purchase_equipment_justification')
            .eq('proposal_id', proposalId)
            .not('purchase_equipment_justification', 'is', null)
            .not('purchase_equipment_justification', 'eq', '');
          const justified = (hasJustification.data || []).length > 0;
          results.push({
            id: 'equipment-ratio', name: 'Equipment costs',
            severity: justified ? 'info' : 'warning',
            message: `Equipment is ${((equipmentTotal / personnelTotal) * 100).toFixed(1)}% of personnel costs (>15% requires justification)`,
            passed: justified,
          });
        }
      }

      // If no issues were found at all, add a pass
      if (results.length === 0) {
        results.push({ id: 'all-ok', name: 'Budget populated', severity: 'info', message: 'Budget data looks good', passed: true });
      }

      setRules(results);
      setHasRun(true);
      const errors = results.filter(r => !r.passed && r.severity === 'error').length;
      const warnings = results.filter(r => !r.passed && r.severity === 'warning').length;
      if (errors === 0 && warnings === 0) toast.success('All budget checks passed!');
      else toast.info(`Found ${errors} error(s) and ${warnings} warning(s)`);
    } catch (error) {
      console.error('Budget validation error:', error);
      toast.error('Failed to validate budget');
    } finally {
      setLoading(false);
    }
  };

  const passedCount = rules.filter(r => r.passed).length;
  const percentage = rules.length > 0 ? Math.round((passedCount / rules.length) * 100) : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Budget Validation
          </h2>
          <p className="text-sm text-muted-foreground">Automated compliance checks for budget data</p>
        </div>
        <Button onClick={runValidation} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {hasRun ? 'Re-validate' : 'Run validation'}
        </Button>
      </div>

      {!hasRun && !loading && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <Calculator className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Click "Run validation" to check budget compliance</p>
          </CardContent>
        </Card>
      )}

      {hasRun && (
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>{passedCount}/{rules.length} checks passed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={percentage} className="h-2" />
            <div className="space-y-2">
              {rules.map(rule => (
                <div
                  key={rule.id}
                  className={`flex items-start gap-2 p-2 rounded-md text-sm ${
                    rule.passed
                      ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400'
                      : rule.severity === 'error'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                  }`}
                >
                  {rule.passed ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                  <div><span className="font-medium">{rule.name}:</span> {rule.message}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
