import { useState, useCallback, useMemo } from 'react';
import { useBudgetRows, ComputedBudgetRow } from '@/hooks/useBudgetRows';
import { useProposalRole } from '@/hooks/useProposalRole';
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { BudgetJustificationDialog } from '@/components/BudgetJustificationDialog';
import { formatCurrency } from '@/lib/formatNumber';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BudgetParticipantFormProps {
  proposalId: string;
  participantId: string;
  proposalType: string | null;
  canEdit: boolean;
  isCoordinator: boolean;
}

const COST_FIELDS = [
  { key: 'personnelCosts', label: 'Personnel costs', justification: null },
  { key: 'subcontractingCosts', label: 'Subcontracting costs', justification: 'subcontracting' },
  { key: 'purchaseTravel', label: 'Purchase costs – Travel & subsistence', justification: null },
  { key: 'purchaseEquipment', label: 'Purchase costs – Equipment', justification: 'equipment' },
  { key: 'purchaseOtherGoods', label: 'Purchase costs – Other goods & services', justification: 'other_goods' },
  { key: 'internallyInvoiced', label: 'Internally invoiced goods & services', justification: 'internally_invoiced' },
] as const;

const FINANCIAL_FIELDS = [
  { key: 'incomeGenerated', label: 'Income generated' },
  { key: 'financialContributions', label: 'Financial contributions' },
  { key: 'ownResources', label: 'Own resources' },
] as const;

export function BudgetParticipantForm({
  proposalId,
  participantId,
  proposalType,
  canEdit,
  isCoordinator,
}: BudgetParticipantFormProps) {
  const {
    rows,
    justifications,
    loading,
    saving,
    updateRow,
    saveJustification,
  } = useBudgetRows(proposalId, proposalType);

  const { roleTier } = useProposalRole(proposalId);
  const isAdmin = roleTier === 'coordinator';

  const row = useMemo(() => rows.find(r => r.participantId === participantId), [rows, participantId]);

  const [justDialog, setJustDialog] = useState<{
    open: boolean;
    category: string;
    categoryLabel: string;
  }>({ open: false, category: '', categoryLabel: '' });

  const editable = useMemo(() => {
    if (!canEdit || !row) return false;
    if (row.isLocked && !isAdmin) return false;
    return true;
  }, [canEdit, row, isAdmin]);

  const openJustification = useCallback((category: string, label: string) => {
    setJustDialog({ open: true, category, categoryLabel: label });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
        <span className="text-muted-foreground">Loading budget…</span>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-muted-foreground">No budget data found for this participant.</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {row.participantNumber}. {row.participantShortName || row.participantName}
            <span className="text-sm font-normal text-muted-foreground ml-2">({row.roleLabel})</span>
          </h2>
          <p className="text-sm text-muted-foreground">{row.country || 'No country specified'}</p>
        </div>
        {saving && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </span>
        )}
      </div>

      {/* Lock banner */}
      {row.isLocked && !isAdmin && (
        <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <Lock className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            This budget page is locked by a coordinator. Editing is disabled.
          </AlertDescription>
        </Alert>
      )}

      {/* PM Rate & Personnel Costs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Personnel Costs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-[260px] shrink-0">Avg. weighted person month rate</label>
            <FormattedNumberInput
              value={row.pmRate ?? 0}
              onChange={(v) => updateRow(row.id, 'pmRate', v)}
              disabled={!editable}
              className="h-8 text-sm text-right flex-1"
            />
            <span className="text-xs text-muted-foreground w-4">€</span>
          </div>
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-muted-foreground">Total person months (from WP effort)</span>
            <span className="font-medium tabular-nums">{row.totalPersonMonths.toFixed(1)}</span>
          </div>
          <div className="flex items-center justify-between py-1 border-t text-sm">
            <span className="font-medium">A. Personnel costs {row.pmRate ? '(auto-calculated)' : ''}</span>
            <span className="font-semibold tabular-nums">{formatCurrency(row.personnelCosts)}</span>
          </div>
          {!row.pmRate && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground w-[260px] shrink-0">Personnel costs (manual)</label>
              <FormattedNumberInput
                value={row.personnelCosts}
                onChange={(v) => updateRow(row.id, 'personnelCosts', v)}
                disabled={!editable}
                className="h-8 text-sm text-right flex-1"
              />
              <span className="text-xs text-muted-foreground w-4">€</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Other Cost Categories */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Other Cost Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {COST_FIELDS.filter(f => f.key !== 'personnelCosts').map(f => (
            <div key={f.key} className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground w-[260px] shrink-0">{f.label}</label>
              <FormattedNumberInput
                value={row[f.key] as number}
                onChange={(v) => updateRow(row.id, f.key, v)}
                disabled={!editable}
                className="h-8 text-sm text-right flex-1"
              />
              <span className="text-xs text-muted-foreground w-4">€</span>
              {f.justification && (
                <button
                  onClick={() => openJustification(f.justification!, f.label)}
                  className="shrink-0 p-1 rounded hover:bg-muted"
                  title="Cost justification"
                >
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Calculated Values */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Calculated Values</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { label: 'Direct costs', value: formatCurrency(row.directCosts) },
            { label: 'Indirect costs (25%)', value: formatCurrency(row.indirectCosts) },
            { label: 'Total eligible costs', value: formatCurrency(row.totalEligibleCosts) },
            { label: 'Funding rate', value: `${row.fundingRate}%` },
            { label: 'Max EU contribution', value: formatCurrency(row.maxEuContribution) },
            { label: 'Requested EU contribution', value: formatCurrency(row.requestedEuContribution) },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <span className="text-sm font-medium tabular-nums">{item.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Financial Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Financial Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {FINANCIAL_FIELDS.map(f => (
            <div key={f.key} className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground w-[260px] shrink-0">{f.label}</label>
              <FormattedNumberInput
                value={row[f.key] as number}
                onChange={(v) => updateRow(row.id, f.key, v)}
                disabled={!editable}
                className="h-8 text-sm text-right flex-1"
              />
              <span className="text-xs text-muted-foreground w-4">€</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm font-medium">Total estimated income</span>
            <span className="text-sm font-semibold tabular-nums">{formatCurrency(row.totalEstimatedIncome)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Justification dialog */}
      {row && (
        <BudgetJustificationDialog
          open={justDialog.open}
          onOpenChange={(open) => setJustDialog(prev => ({ ...prev, open }))}
          category={justDialog.category}
          categoryLabel={justDialog.categoryLabel}
          participantName={row.participantShortName || row.participantName}
          justification={justifications.find(
            j => j.budgetRowId === row.id && j.category === justDialog.category
          )}
          onSave={(text) => saveJustification(row.id, justDialog.category, text)}
          disabled={!editable}
        />
      )}
    </div>
  );
}
