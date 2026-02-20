import { useBudgetRows } from '@/hooks/useBudgetRows';
import { useProposalRole } from '@/hooks/useProposalRole';
import { formatNumber } from '@/lib/formatNumber';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Lock, Unlock, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface BudgetPortalSheetProps {
  proposalId: string;
  proposalType: string | null;
  canEdit: boolean;
  isCoordinator: boolean;
}

const SUMMARY_COLUMNS = [
  { key: 'personnelCosts', label: 'Personnel' },
  { key: 'subcontractingCosts', label: 'Subcontracting' },
  { key: 'purchaseTravel', label: 'Travel' },
  { key: 'purchaseEquipment', label: 'Equipment' },
  { key: 'purchaseOtherGoods', label: 'Other goods' },
  { key: 'internallyInvoiced', label: 'Internally inv.' },
  { key: 'indirectCosts', label: 'Indirect costs' },
  { key: 'totalEligibleCosts', label: 'Total eligible' },
  { key: 'requestedEuContribution', label: 'EU contribution' },
] as const;

export function BudgetPortalSheet({
  proposalId,
  proposalType,
  canEdit,
  isCoordinator,
}: BudgetPortalSheetProps) {
  const {
    rows,
    grandTotals,
    loading,
    saving,
    lockRow,
    unlockRow,
  } = useBudgetRows(proposalId, proposalType);

  const { roleTier } = useProposalRole(proposalId);
  const isAdmin = roleTier === 'coordinator';

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
        <span className="text-muted-foreground">Loading budget overview…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Budget Overview</h2>
        {saving && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Eligible Costs', value: grandTotals.totalEligibleCosts },
          { label: 'Indirect Costs', value: grandTotals.indirectCosts },
          { label: 'EU Contribution', value: grandTotals.requestedEuContribution },
          { label: 'Total Estimated Income', value: grandTotals.totalEstimatedIncome },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-lg font-semibold tabular-nums">{formatNumber(card.value)} €</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary table */}
      <div className="relative w-full overflow-auto border rounded-lg">
        <table className="w-max min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/60">
              <th className="sticky left-0 bg-muted/60 z-10 w-10 px-2 py-2 text-center border-r font-medium">No.</th>
              <th className="sticky left-10 bg-muted/60 z-10 min-w-[140px] px-2 py-2 text-left border-r font-medium">Name</th>
              {SUMMARY_COLUMNS.map(c => (
                <th key={c.key} className="min-w-[100px] px-2 py-2 text-right border-r font-medium whitespace-nowrap">{c.label}</th>
              ))}
              {isAdmin && <th className="w-10 px-2 py-2 text-center font-medium">Lock</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className={cn('border-t hover:bg-muted/20', row.isLocked && !isAdmin && 'opacity-60')}>
                <td className="sticky left-0 bg-background z-10 px-2 py-1.5 text-center border-r font-medium">{row.participantNumber}</td>
                <td className="sticky left-10 bg-background z-10 px-2 py-1.5 border-r truncate max-w-[140px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">{row.participantShortName || row.participantName}</span>
                    </TooltipTrigger>
                    <TooltipContent>{row.participantName}</TooltipContent>
                  </Tooltip>
                  {row.isLocked && <Lock className="inline-block w-3 h-3 ml-1 text-muted-foreground" />}
                </td>
                {SUMMARY_COLUMNS.map(c => (
                  <td key={c.key} className="px-2 py-1.5 text-right border-r tabular-nums">
                    {formatNumber(row[c.key] as number)}
                  </td>
                ))}
                {isAdmin && (
                  <td className="px-2 py-1.5 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => row.isLocked ? unlockRow(row.id) : lockRow(row.id)}
                    >
                      {row.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5 text-muted-foreground" />}
                    </Button>
                  </td>
                )}
              </tr>
            ))}

            {/* TOTAL row */}
            <tr className="border-t-2 border-foreground/20 bg-muted/40 font-semibold">
              <td className="sticky left-0 bg-muted/40 z-10 px-2 py-2 border-r" />
              <td className="sticky left-10 bg-muted/40 z-10 px-2 py-2 border-r">TOTAL</td>
              {SUMMARY_COLUMNS.map(c => (
                <td key={c.key} className="px-2 py-2 text-right border-r tabular-nums">
                  {formatNumber((grandTotals as any)[c.key] || 0)}
                </td>
              ))}
              {isAdmin && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
