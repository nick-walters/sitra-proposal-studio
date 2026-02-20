import { useState, useCallback } from 'react';
import { useBudgetRows, ComputedBudgetRow } from '@/hooks/useBudgetRows';
import { useProposalRole } from '@/hooks/useProposalRole';
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { BudgetJustificationDialog } from '@/components/BudgetJustificationDialog';
import { formatNumber } from '@/lib/formatNumber';
import { Button } from '@/components/ui/button';
import { Lock, Unlock, FileText, Loader2 } from 'lucide-react';
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

const JUSTIFICATION_CATEGORIES = [
  { key: 'subcontracting', label: 'Subcontracting' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'other_goods', label: 'Other goods & services' },
  { key: 'internally_invoiced', label: 'Internally invoiced' },
] as const;

const EDITABLE_FIELDS = [
  { key: 'personnelCosts', label: 'Personnel costs/EUR' },
  { key: 'subcontractingCosts', label: 'Subcontracting costs/EUR', justification: 'subcontracting' },
  { key: 'purchaseTravel', label: 'Purchase costs – Travel & subsistence/EUR' },
  { key: 'purchaseEquipment', label: 'Purchase costs – Equipment/EUR', justification: 'equipment' },
  { key: 'purchaseOtherGoods', label: 'Purchase costs – Other goods & services/EUR', justification: 'other_goods' },
  { key: 'internallyInvoiced', label: 'Internally invoiced goods & services/EUR', justification: 'internally_invoiced' },
] as const;

const CALCULATED_FIELDS = [
  { key: 'indirectCosts', label: 'Indirect costs/EUR' },
  { key: 'totalEligibleCosts', label: 'Total eligible costs/EUR' },
  { key: 'fundingRate', label: 'Funding rate (%)' },
  { key: 'maxEuContribution', label: 'Max EU contribution/EUR' },
  { key: 'requestedEuContribution', label: 'Requested EU contribution/EUR' },
] as const;

const FINANCIAL_FIELDS = [
  { key: 'incomeGenerated', label: 'Income generated/EUR' },
  { key: 'financialContributions', label: 'Financial contributions/EUR' },
  { key: 'ownResources', label: 'Own resources/EUR' },
] as const;

export function BudgetPortalSheet({
  proposalId,
  proposalType,
  canEdit,
  isCoordinator,
}: BudgetPortalSheetProps) {
  const {
    rows,
    justifications,
    grandTotals,
    loading,
    saving,
    updateRow,
    updateRoleLabel,
    lockRow,
    unlockRow,
    saveJustification,
  } = useBudgetRows(proposalId, proposalType);

  const { roleTier } = useProposalRole(proposalId);
  const isAdmin = roleTier === 'coordinator';

  const [justDialog, setJustDialog] = useState<{
    open: boolean;
    budgetRowId: string;
    category: string;
    categoryLabel: string;
    participantName: string;
  }>({
    open: false,
    budgetRowId: '',
    category: '',
    categoryLabel: '',
    participantName: '',
  });

  const openJustification = useCallback((row: ComputedBudgetRow, category: string, label: string) => {
    setJustDialog({
      open: true,
      budgetRowId: row.id,
      category,
      categoryLabel: label,
      participantName: row.participantShortName || row.participantName,
    });
  }, []);

  const canEditRow = useCallback((row: ComputedBudgetRow) => {
    if (!canEdit) return false;
    if (row.isLocked && !isAdmin) return false;
    return true;
  }, [canEdit, isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
        <span className="text-muted-foreground">Loading budget sheet…</span>
      </div>
    );
  }

  const stickyColClass = 'sticky bg-background z-10';

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Budget Overview</h2>
        {saving && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </span>
        )}
      </div>

      <div className="relative w-full overflow-auto border rounded-lg">
        <table className="w-max min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/60">
              {/* Sticky columns */}
              <th className={cn(stickyColClass, 'left-0 w-10 px-2 py-2 text-center border-r font-medium')}>No.</th>
              <th className={cn(stickyColClass, 'left-10 min-w-[160px] px-2 py-2 text-left border-r font-medium')}>Name of beneficiary</th>
              <th className={cn(stickyColClass, 'left-[200px] w-16 px-2 py-2 text-left border-r font-medium')}>Country</th>
              <th className={cn(stickyColClass, 'left-[264px] w-24 px-2 py-2 text-left border-r font-medium')}>Role</th>

              {/* Editable cost columns */}
              {EDITABLE_FIELDS.map(f => (
                <th key={f.key} className="min-w-[130px] px-2 py-2 text-right border-r font-medium whitespace-nowrap">{f.label}</th>
              ))}

              {/* Calculated columns */}
              {CALCULATED_FIELDS.map(f => (
                <th key={f.key} className="min-w-[120px] px-2 py-2 text-right border-r font-medium whitespace-nowrap bg-muted/30">{f.label}</th>
              ))}

              {/* Financial columns */}
              {FINANCIAL_FIELDS.map(f => (
                <th key={f.key} className="min-w-[120px] px-2 py-2 text-right border-r font-medium whitespace-nowrap">{f.label}</th>
              ))}

              <th className="min-w-[120px] px-2 py-2 text-right border-r font-medium whitespace-nowrap bg-muted/30">Total estimated income/EUR</th>

              {/* Lock column */}
              {isAdmin && <th className="w-10 px-2 py-2 text-center font-medium">Lock</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const editable = canEditRow(row);
              return (
                <tr key={row.id} className={cn('border-t hover:bg-muted/20', row.isLocked && !isAdmin && 'opacity-60')}>
                  {/* Sticky columns */}
                  <td className={cn(stickyColClass, 'left-0 px-2 py-1 text-center border-r font-medium')}>{row.participantNumber}</td>
                  <td className={cn(stickyColClass, 'left-10 px-2 py-1 border-r truncate max-w-[160px]')}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">{row.participantShortName || row.participantName}</span>
                      </TooltipTrigger>
                      <TooltipContent>{row.participantName}</TooltipContent>
                    </Tooltip>
                    {row.isLocked && <Lock className="inline-block w-3 h-3 ml-1 text-muted-foreground" />}
                  </td>
                  <td className={cn(stickyColClass, 'left-[200px] px-2 py-1 border-r text-xs')}>{row.country || '—'}</td>
                  <td className={cn(stickyColClass, 'left-[264px] px-2 py-1 border-r')}>
                    {isAdmin ? (
                      <input
                        type="text"
                        value={row.roleLabel}
                        onChange={(e) => updateRoleLabel(row.id, e.target.value)}
                        className="w-full bg-transparent border-none outline-none text-xs"
                      />
                    ) : (
                      <span className="text-xs">{row.roleLabel}</span>
                    )}
                  </td>

                  {/* Editable cost cells */}
                  {EDITABLE_FIELDS.map(f => (
                    <td key={f.key} className="px-1 py-1 border-r">
                      <div className="flex items-center gap-0.5">
                        <FormattedNumberInput
                          value={row[f.key] as number}
                          onChange={(v) => updateRow(row.id, f.key, v)}
                          disabled={!editable}
                          className="h-7 text-xs text-right border-none shadow-none bg-transparent"
                        />
                        {'justification' in f && f.justification && (
                          <button
                            onClick={() => openJustification(row, f.justification, f.label)}
                            className="shrink-0 p-0.5 rounded hover:bg-muted"
                            title="Cost justification"
                          >
                            <FileText className="w-3 h-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </td>
                  ))}

                  {/* Calculated cells */}
                  {CALCULATED_FIELDS.map(f => (
                    <td key={f.key} className="px-2 py-1 text-right border-r bg-muted/10 tabular-nums">
                      {f.key === 'fundingRate'
                        ? `${row.fundingRate}%`
                        : formatNumber(row[f.key] as number)}
                    </td>
                  ))}

                  {/* Financial cells */}
                  {FINANCIAL_FIELDS.map(f => (
                    <td key={f.key} className="px-1 py-1 border-r">
                      <FormattedNumberInput
                        value={row[f.key] as number}
                        onChange={(v) => updateRow(row.id, f.key, v)}
                        disabled={!editable}
                        className="h-7 text-xs text-right border-none shadow-none bg-transparent"
                      />
                    </td>
                  ))}

                  <td className="px-2 py-1 text-right border-r bg-muted/10 tabular-nums">
                    {formatNumber(row.totalEstimatedIncome)}
                  </td>

                  {/* Lock toggle */}
                  {isAdmin && (
                    <td className="px-2 py-1 text-center">
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
              );
            })}

            {/* TOTAL row */}
            <tr className="border-t-2 border-foreground/20 bg-muted/40 font-semibold">
              <td className={cn(stickyColClass, 'left-0 px-2 py-2 border-r')} />
              <td className={cn(stickyColClass, 'left-10 px-2 py-2 border-r')} colSpan={1}>TOTAL</td>
              <td className={cn(stickyColClass, 'left-[200px] px-2 py-2 border-r')} />
              <td className={cn(stickyColClass, 'left-[264px] px-2 py-2 border-r')} />

              {EDITABLE_FIELDS.map(f => (
                <td key={f.key} className="px-2 py-2 text-right border-r tabular-nums">
                  {formatNumber((grandTotals as any)[f.key] || 0)}
                </td>
              ))}

              {CALCULATED_FIELDS.map(f => (
                <td key={f.key} className="px-2 py-2 text-right border-r bg-muted/10 tabular-nums">
                  {f.key === 'fundingRate' ? '—' : formatNumber((grandTotals as any)[f.key] || 0)}
                </td>
              ))}

              {FINANCIAL_FIELDS.map(f => (
                <td key={f.key} className="px-2 py-2 text-right border-r tabular-nums">
                  {formatNumber((grandTotals as any)[f.key] || 0)}
                </td>
              ))}

              <td className="px-2 py-2 text-right border-r bg-muted/10 tabular-nums">
                {formatNumber(grandTotals.totalEstimatedIncome || 0)}
              </td>

              {isAdmin && <td />}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Justification dialog */}
      <BudgetJustificationDialog
        open={justDialog.open}
        onOpenChange={(open) => setJustDialog(prev => ({ ...prev, open }))}
        category={justDialog.category}
        categoryLabel={justDialog.categoryLabel}
        participantName={justDialog.participantName}
        justification={justifications.find(
          j => j.budgetRowId === justDialog.budgetRowId && j.category === justDialog.category
        )}
        onSave={(text) => saveJustification(justDialog.budgetRowId, justDialog.category, text)}
        disabled={!canEdit}
      />
    </div>
  );
}
