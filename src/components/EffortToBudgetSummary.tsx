import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatNumber';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calculator, ArrowRight, Users } from 'lucide-react';
import { useEffortToBudget } from '@/hooks/useEffortToBudget';
import type { ParticipantSummary } from '@/types/proposal';
import type { WPDraftTask } from '@/hooks/useWPDrafts';

interface ParticipantWithRate extends ParticipantSummary {
  personnel_cost_rate?: number | null;
}

interface EffortToBudgetSummaryProps {
  tasks: WPDraftTask[];
  participants: ParticipantWithRate[];
  onImportToBudget?: (participantId: string, amount: number) => void;
  canEdit?: boolean;
}

export function EffortToBudgetSummary({
  tasks,
  participants,
  onImportToBudget,
  canEdit = false,
}: EffortToBudgetSummaryProps) {
  const { summaryByParticipant, totalPersonMonths, totalPersonnelCost } = useEffortToBudget(
    tasks,
    participants
  );

  // formatCurrency imported from shared utility

  if (participants.length === 0 || tasks.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4" />
            Personnel costs from effort
          </CardTitle>
          <CardDescription>
            Add participants and work package tasks to see calculated personnel costs
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const participantsWithEffort = summaryByParticipant.filter(s => s.totalPersonMonths > 0);

  if (participantsWithEffort.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4" />
            Personnel costs from effort
          </CardTitle>
          <CardDescription>
            Enter effort in the work package effort matrices to calculate personnel costs
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" />
              Personnel costs from effort
            </CardTitle>
            <CardDescription className="text-xs">
              Calculated from work package effort matrices × cost rates
            </CardDescription>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3 w-3" />
            {totalPersonMonths.toFixed(1)} PM
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">PM</TableHead>
                <TableHead className="text-right">Rate (€/PM)</TableHead>
                <TableHead className="text-right">Personnel Cost</TableHead>
                {canEdit && onImportToBudget && (
                  <TableHead className="w-[80px]"></TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {participantsWithEffort.map((summary) => (
                <TableRow key={summary.participantId}>
                  <TableCell className="font-medium">{summary.participantName}</TableCell>
                  <TableCell className="text-right">{summary.totalPersonMonths.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(summary.costRate)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(summary.calculatedCost)}
                  </TableCell>
                  {canEdit && onImportToBudget && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1"
                        onClick={() => onImportToBudget(summary.participantId, summary.calculatedCost)}
                      >
                        <ArrowRight className="h-3 w-3" />
                        Add
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold">{totalPersonMonths.toFixed(1)}</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right font-bold text-primary">
                  {formatCurrency(totalPersonnelCost)}
                </TableCell>
                {canEdit && onImportToBudget && <TableCell></TableCell>}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          💡 Set cost rates in each participant's detail page (A2 section)
        </p>
      </CardContent>
    </Card>
  );
}
