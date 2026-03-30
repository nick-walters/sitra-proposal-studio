import { useState, useCallback, useMemo } from 'react';
import { useBudgetRows, ComputedBudgetRow } from '@/hooks/useBudgetRows';
import { useProposalRole } from '@/hooks/useProposalRole';
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { BudgetJustificationDialog } from '@/components/BudgetJustificationDialog';
import { formatCurrency } from '@/lib/formatNumber';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Lock, Loader2, Copy, Check, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface BudgetParticipantFormProps {
  proposalId: string;
  participantId: string;
  proposalType: string | null;
  canEdit: boolean;
  isCoordinator: boolean;
}

function CopyButton({ value }: { value: string | number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = typeof value === 'number' ? value.toString() : value.replace(/[€,]/g, '').trim();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
      title="Copy value"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-600" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

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
    subcontractingItems,
    equipmentItems,
    loading,
    saving,
    updateRow,
    saveJustification,
    addSubcontractingItem,
    updateSubcontractingItem,
    deleteSubcontractingItem,
    addEquipmentItem,
    updateEquipmentItem,
    deleteEquipmentItem,
  } = useBudgetRows(proposalId, proposalType);

  const { roleTier } = useProposalRole(proposalId);
  const isAdmin = roleTier === 'coordinator';

  const row = useMemo(() => rows.find(r => r.participantId === participantId), [rows, participantId]);

  const editable = useMemo(() => {
    if (!canEdit || !row) return false;
    if (row.isLocked && !isAdmin) return false;
    return true;
  }, [canEdit, row, isAdmin]);

  const rowSubItems = useMemo(
    () => (row ? subcontractingItems.filter(i => i.budgetRowId === row.id) : []),
    [subcontractingItems, row]
  );

  const subTotal = useMemo(
    () => rowSubItems.reduce((sum, i) => sum + i.amount, 0),
    [rowSubItems]
  );

  const rowEquipItems = useMemo(
    () => (row ? equipmentItems.filter(i => i.budgetRowId === row.id) : []),
    [equipmentItems, row]
  );

  const equipTotal = useMemo(
    () => rowEquipItems.reduce((sum, i) => sum + i.amount, 0),
    [rowEquipItems]
  );

  // 15% threshold for equipment justification
  const equipmentJustificationRequired = useMemo(() => {
    if (!row) return false;
    const personnelCosts = row.pmRate != null && row.pmRate > 0
      ? Math.round(row.pmRate * row.totalPersonMonths)
      : row.personnelCosts;
    return personnelCosts > 0 && equipTotal > personnelCosts * 0.15;
  }, [row, equipTotal]);

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
          <CardTitle className="text-sm font-semibold">A. Personnel Costs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-[260px] shrink-0">Avg. weighted person month rate</label>
            <FormattedNumberInput
              value={row.pmRate ?? 0}
              onChange={(v) => updateRow(row.id, 'pmRate', v)}
              disabled={!editable}
              decimals={2}
              className="h-8 text-sm text-right flex-1"
            />
            <span className="text-xs text-muted-foreground w-4">€</span>
            <CopyButton value={row.pmRate ?? 0} />
          </div>
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-muted-foreground">Total person months (from WP effort)</span>
            <div className="flex items-center gap-1">
              <span className="font-medium tabular-nums">{Number.isInteger(row.totalPersonMonths) ? row.totalPersonMonths.toFixed(0) : row.totalPersonMonths.toFixed(1)}</span>
              <CopyButton value={row.totalPersonMonths} />
            </div>
          </div>
          <div className="flex items-center justify-between py-1 border-t text-sm">
            <span className="font-medium">Personnel costs {row.pmRate ? '(auto-calculated)' : ''}</span>
            <div className="flex items-center gap-1">
              <span className="font-semibold tabular-nums">{formatCurrency(row.personnelCosts)}</span>
              <CopyButton value={row.personnelCosts} />
            </div>
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
              <CopyButton value={row.personnelCosts} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subcontracting Costs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">B. Subcontracting Costs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rowSubItems.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No subcontracting costs added yet.</p>
          )}
          {rowSubItems.map((item, idx) => (
            <div key={item.id} className="border rounded-lg p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Subcontracting cost {idx + 1}</span>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => deleteSubcontractingItem(item.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground w-[100px] shrink-0">Description</label>
                <Input
                  value={item.description}
                  onChange={(e) => updateSubcontractingItem(item.id, 'description', e.target.value)}
                  disabled={!editable}
                  className="h-8 text-sm flex-1"
                  placeholder="Description of subcontracted work"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground w-[100px] shrink-0">Amount</label>
                <FormattedNumberInput
                  value={item.amount}
                  onChange={(v) => updateSubcontractingItem(item.id, 'amount', v)}
                  disabled={!editable}
                  className="h-8 text-sm text-right flex-1"
                />
                <span className="text-xs text-muted-foreground w-4">€</span>
                <CopyButton value={item.amount} />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">Justification</label>
                <Textarea
                  value={item.justification}
                  onChange={(e) => updateSubcontractingItem(item.id, 'justification', e.target.value)}
                  disabled={!editable}
                  className="text-sm min-h-[60px]"
                  placeholder="Justify why this work needs to be subcontracted"
                />
              </div>
            </div>
          ))}
          {editable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => addSubcontractingItem(row.id)}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add subcontracting cost
            </Button>
          )}
          {rowSubItems.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t text-sm">
              <span className="font-medium">Total subcontracting costs</span>
              <div className="flex items-center gap-1">
                <span className="font-semibold tabular-nums">{formatCurrency(subTotal)}</span>
                <CopyButton value={subTotal} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* C. Purchase Costs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">C. Purchase Costs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-[260px] shrink-0">C.1 Travel and subsistence</label>
            <FormattedNumberInput
              value={row.purchaseTravel}
              onChange={(v) => updateRow(row.id, 'purchaseTravel', v)}
              disabled={!editable}
              className="h-8 text-sm text-right flex-1"
            />
            <span className="text-xs text-muted-foreground w-4">€</span>
            <CopyButton value={row.purchaseTravel} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-[260px] shrink-0">C.2 Equipment</label>
            <FormattedNumberInput
              value={row.purchaseEquipment}
              onChange={(v) => updateRow(row.id, 'purchaseEquipment', v)}
              disabled={!editable}
              className="h-8 text-sm text-right flex-1"
            />
            <span className="text-xs text-muted-foreground w-4">€</span>
            <CopyButton value={row.purchaseEquipment} />
          </div>
          {equipmentJustificationRequired && (
            <div className="space-y-2 ml-[260px] pl-2">
              <div className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Equipment costs exceed 15% of personnel costs — justification required</span>
              </div>
              <Textarea
                value={row.purchaseEquipmentJustification || ''}
                onChange={(e) => updateRow(row.id, 'purchaseEquipmentJustification', e.target.value)}
                disabled={!editable}
                className="text-sm min-h-[60px]"
                placeholder="Justify why equipment costs exceed 15% of personnel costs"
              />
            </div>
          )}
          {!equipmentJustificationRequired && (
            <div className="ml-[260px] pl-2">
              <Textarea
                value=""
                disabled
                className="text-sm min-h-[40px] opacity-40"
                placeholder="Justification required if equipment costs exceed 15% of personnel costs"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-[260px] shrink-0">C.3 Other goods, works and services</label>
            <FormattedNumberInput
              value={row.purchaseOtherGoods}
              onChange={(v) => updateRow(row.id, 'purchaseOtherGoods', v)}
              disabled={!editable}
              className="h-8 text-sm text-right flex-1"
            />
            <span className="text-xs text-muted-foreground w-4">€</span>
            <CopyButton value={row.purchaseOtherGoods} />
          </div>
        </CardContent>
      </Card>

      {/* D. Other Direct Cost Categories */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">D. Other Direct Cost Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-[260px] shrink-0">D.1 Financial support to third parties</label>
            <FormattedNumberInput
              value={row.financialSupportThirdParties}
              onChange={(v) => updateRow(row.id, 'financialSupportThirdParties', v)}
              disabled={!editable}
              decimals={2}
              className="h-8 text-sm text-right flex-1"
            />
            <span className="text-xs text-muted-foreground w-4">€</span>
            <CopyButton value={row.financialSupportThirdParties} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-[260px] shrink-0">D.2 Internally invoiced goods and services</label>
            <FormattedNumberInput
              value={row.internallyInvoiced}
              onChange={(v) => updateRow(row.id, 'internallyInvoiced', v)}
              disabled={!editable}
              decimals={2}
              className="h-8 text-sm text-right flex-1"
            />
            <span className="text-xs text-muted-foreground w-4">€</span>
            <CopyButton value={row.internallyInvoiced} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-[260px] shrink-0">D.3 Procurement</label>
            <FormattedNumberInput
              value={row.procurement}
              onChange={(v) => updateRow(row.id, 'procurement', v)}
              disabled={!editable}
              decimals={2}
              className="h-8 text-sm text-right flex-1"
            />
            <span className="text-xs text-muted-foreground w-4">€</span>
            <CopyButton value={row.procurement} />
          </div>
        </CardContent>
      </Card>

      {/* Calculated Values & Funding */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Costs & Funding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Direct costs', value: formatCurrency(row.directCosts), raw: row.directCosts },
            { label: 'Indirect costs (25%)', value: formatCurrency(row.indirectCosts), raw: row.indirectCosts },
            { label: 'Total eligible costs', value: formatCurrency(row.totalEligibleCosts), raw: row.totalEligibleCosts },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium tabular-nums">{item.value}</span>
                <CopyButton value={item.raw} />
              </div>
            </div>
          ))}

          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground w-[260px] shrink-0">
                Funding rate
                <span className="text-xs ml-1">({row.fundingRateOverride != null ? 'custom' : 'auto'})</span>
              </label>
              <FormattedNumberInput
                value={row.fundingRateOverride ?? row.fundingRate}
                onChange={(v) => updateRow(row.id, 'fundingRateOverride', v)}
                disabled={!editable}
                className="h-8 text-sm text-right flex-1"
              />
              <span className="text-xs text-muted-foreground w-4">%</span>
              <CopyButton value={row.fundingRate} />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">Max EU contribution</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium tabular-nums">{formatCurrency(row.maxEuContribution)}</span>
                <CopyButton value={row.maxEuContribution} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground w-[260px] shrink-0">
                Requested EU contribution
              </label>
              <FormattedNumberInput
                value={row.requestedEuContributionOverride ?? row.maxEuContribution}
                onChange={(v) => updateRow(row.id, 'requestedEuContributionOverride', v)}
                disabled={!editable}
                allowZero
                className="h-8 text-sm text-right flex-1"
              />
              <span className="text-xs text-muted-foreground w-4">€</span>
              <CopyButton value={row.requestedEuContribution} />
            </div>
            {row.requestedEuContribution < row.maxEuContribution && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground italic">
                  Requesting {formatCurrency(row.maxEuContribution - row.requestedEuContribution)} less than maximum
                </p>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-muted-foreground">In-kind contribution</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium tabular-nums">{formatCurrency(row.maxEuContribution - row.requestedEuContribution)}</span>
                    <CopyButton value={row.maxEuContribution - row.requestedEuContribution} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Financial Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Financial Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: 'incomeGenerated' as const, label: 'Income generated' },
            { key: 'financialContributions' as const, label: 'Financial contributions' },
            { key: 'ownResources' as const, label: 'Own resources' },
          ].map(f => (
            <div key={f.key} className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground w-[260px] shrink-0">{f.label}</label>
              <FormattedNumberInput
                value={row[f.key] as number}
                onChange={(v) => updateRow(row.id, f.key, v)}
                disabled={!editable}
                className="h-8 text-sm text-right flex-1"
              />
              <span className="text-xs text-muted-foreground w-4">€</span>
              <CopyButton value={row[f.key] as number} />
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm font-medium">Total estimated income</span>
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(row.totalEstimatedIncome)}</span>
              <CopyButton value={row.totalEstimatedIncome} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
