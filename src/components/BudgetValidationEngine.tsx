import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  AlertTriangle,
  CheckCircle2,
  Euro,
  Calculator,
  Users,
  Percent,
} from 'lucide-react';
import { Participant, BudgetType } from '@/types/proposal';
import { BudgetItem } from '@/hooks/useBudget';
import { formatCurrency } from '@/lib/formatNumber';

interface BudgetValidationEngineProps {
  budgetItems: BudgetItem[];
  participants: Participant[];
  budgetType: BudgetType;
  totalBudget?: number;
}

interface ValidationRule {
  id: string;
  name: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  passed: boolean;
}

export function BudgetValidationEngine({
  budgetItems,
  participants,
  budgetType,
  totalBudget,
}: BudgetValidationEngineProps) {
  const rules = useMemo(() => {
    const results: ValidationRule[] = [];

    // Calculate totals
    const totalRequest = budgetItems.reduce((sum, item) => sum + item.amount, 0);
    const subcontractingTotal = budgetItems.filter(i => i.category === 'B').reduce((s, i) => s + i.amount, 0);
    const directCosts = budgetItems.filter(i => i.category !== 'E').reduce((s, i) => s + i.amount, 0);
    const personnelCosts = budgetItems.filter(i => i.category === 'A' || i.subcategory?.startsWith('A.')).reduce((s, i) => s + i.amount, 0);

    // By participant
    const byParticipant: Record<string, number> = {};
    budgetItems.forEach(item => {
      byParticipant[item.participantId] = (byParticipant[item.participantId] || 0) + item.amount;
    });

    // Rule 1: Budget exceeds topic ceiling
    if (totalBudget && totalBudget > 0) {
      const exceeds = totalRequest > totalBudget;
      results.push({
        id: 'budget-ceiling',
        name: 'Budget ceiling',
        severity: exceeds ? 'error' : 'info',
        message: exceeds
          ? `Total request (${formatCurrency(totalRequest)}) exceeds topic budget (${formatCurrency(totalBudget)}) by ${formatCurrency(totalRequest - totalBudget)}`
          : `Total request (${formatCurrency(totalRequest)}) is within topic budget (${formatCurrency(totalBudget)})`,
        passed: !exceeds,
      });
    }

    // Rule 2: Subcontracting ratio
    if (directCosts > 0 && subcontractingTotal > 0) {
      const subRatio = subcontractingTotal / directCosts;
      const tooHigh = subRatio > 0.3;
      results.push({
        id: 'subcontracting-ratio',
        name: 'Subcontracting ratio',
        severity: tooHigh ? 'warning' : 'info',
        message: tooHigh
          ? `Subcontracting is ${(subRatio * 100).toFixed(1)}% of direct costs (>30% may require justification)`
          : `Subcontracting is ${(subRatio * 100).toFixed(1)}% of direct costs`,
        passed: !tooHigh,
      });
    }

    // Rule 3: Any participant with zero budget
    const participantsWithZero = participants.filter(p => (byParticipant[p.id] || 0) === 0);
    if (participantsWithZero.length > 0) {
      results.push({
        id: 'zero-budget-participants',
        name: 'Zero-budget participants',
        severity: 'warning',
        message: `${participantsWithZero.length} participant(s) have no budget allocated: ${participantsWithZero.map(p => p.organisationShortName || p.organisationName).join(', ')}`,
        passed: false,
      });
    }

    // Rule 4: Budget concentration (any single partner > 50%)
    if (totalRequest > 0 && participants.length > 1) {
      const overConcentrated = Object.entries(byParticipant).find(([, amount]) => amount / totalRequest > 0.5);
      if (overConcentrated) {
        const participant = participants.find(p => p.id === overConcentrated[0]);
        results.push({
          id: 'budget-concentration',
          name: 'Budget concentration',
          severity: 'warning',
          message: `${participant?.organisationShortName || 'A partner'} holds ${((overConcentrated[1] / totalRequest) * 100).toFixed(0)}% of total budget`,
          passed: false,
        });
      }
    }

    // Rule 5: No personnel costs
    if (totalRequest > 0 && personnelCosts === 0) {
      results.push({
        id: 'no-personnel',
        name: 'Personnel costs',
        severity: 'warning',
        message: 'No personnel costs have been entered',
        passed: false,
      });
    }

    // Rule 6: Budget items without descriptions
    const noDescriptionItems = budgetItems.filter(i => i.amount > 0 && (!i.description || i.description.trim() === ''));
    if (noDescriptionItems.length > 0) {
      results.push({
        id: 'missing-descriptions',
        name: 'Budget descriptions',
        severity: 'warning',
        message: `${noDescriptionItems.length} budget item(s) with amounts but no description`,
        passed: false,
      });
    }

    // Rule 7: Empty budget
    if (totalRequest === 0 && budgetItems.length === 0) {
      results.push({
        id: 'empty-budget',
        name: 'Budget populated',
        severity: 'error',
        message: 'No budget items have been entered',
        passed: false,
      });
    }

    return results;
  }, [budgetItems, participants, budgetType, totalBudget]);

  const passedCount = rules.filter(r => r.passed).length;
  const percentage = rules.length > 0 ? Math.round((passedCount / rules.length) * 100) : 100;

  if (rules.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Budget Validation
        </CardTitle>
        <CardDescription>
          {passedCount}/{rules.length} checks passed
        </CardDescription>
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
              {rule.passed ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              ) : rule.severity === 'error' ? (
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <div>
                <span className="font-medium">{rule.name}:</span>{' '}
                <span>{rule.message}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
