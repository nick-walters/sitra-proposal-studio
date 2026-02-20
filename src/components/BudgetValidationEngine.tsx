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
      const [{ data: budgetRows }, { data: participants }] = await Promise.all([
        supabase.from('budget_rows').select('*').eq('proposal_id', proposalId),
        supabase.from('participants').select('id, organisation_short_name, organisation_name, participant_number').eq('proposal_id', proposalId),
      ]);

      const results: ValidationRule[] = [];
      const rows = budgetRows || [];
      const parts = participants || [];

      // Calculate totals from budget_rows
      const totalDirect = rows.reduce((s, r) => s + r.personnel_costs + r.purchase_equipment + r.purchase_travel + r.purchase_other_goods + r.subcontracting_costs + r.internally_invoiced, 0);
      const subcontractingTotal = rows.reduce((s, r) => s + r.subcontracting_costs, 0);
      const personnelTotal = rows.reduce((s, r) => s + r.personnel_costs, 0);

      const byParticipant: Record<string, number> = {};
      rows.forEach(r => {
        const total = r.personnel_costs + r.purchase_equipment + r.purchase_travel + r.purchase_other_goods + r.subcontracting_costs + r.internally_invoiced;
        byParticipant[r.participant_id] = (byParticipant[r.participant_id] || 0) + total;
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

      // Rule 6: Locked rows check
      const unlockedCount = rows.filter(r => !r.is_locked).length;
      if (unlockedCount > 0 && rows.length > 0) {
        results.push({
          id: 'unlocked-rows', name: 'Budget finalisation', severity: 'info',
          message: `${unlockedCount} of ${rows.length} budget row(s) are still unlocked`,
          passed: unlockedCount === 0,
        });
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
