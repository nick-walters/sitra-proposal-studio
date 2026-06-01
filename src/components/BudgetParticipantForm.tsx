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
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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

interface CostRowProps {
  label: string;
  totalValue: number;
  requestedValue: number | null;
  defaultRequested: number;
  showRequested: boolean;
  editable: boolean;
  onTotalChange: (v: number) => void;
  onRequestedChange: (v: number) => void;
  decimals?: number;
}

function CostInputRow({ label, totalValue, requestedValue, defaultRequested, showRequested, editable, onTotalChange, onRequestedChange, decimals = 2 }: CostRowProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground w-[220px] shrink-0">{label}</label>
      <FormattedNumberInput
        value={totalValue}
        onChange={onTotalChange}
        disabled={!editable}
        decimals={decimals}
        className="h-8 text-sm text-right flex-1"
      />
      <span className="text-xs text-muted-foreground w-4">€</span>
      <CopyButton value={totalValue} />
      {showRequested && (
        <>
          <FormattedNumberInput
            value={requestedValue ?? defaultRequested}
            onChange={onRequestedChange}
            disabled={!editable}
            allowZero
            decimals={decimals}
            className="h-8 text-sm text-right flex-1"
          />
          <span className="text-xs text-muted-foreground w-4">€</span>
          <CopyButton value={requestedValue ?? defaultRequested} />
        </>
      )}
    </div>
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
    personnelBreakdown,
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
    addPersonnelBreakdownItem,
    updatePersonnelBreakdownItem,
    deletePersonnelBreakdownItem,
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
    return personnelCosts > 0 && row.purchaseEquipment > personnelCosts * 0.15;
  }, [row]);

  // Compute requested direct costs (sum of per-category requested values)
  const requestedDirectCosts = useMemo(() => {
    if (!row || !row.hasInKind) return 0;
    const reqPersonnel = row.requestedPersonnelCosts ?? row.personnelCosts;
    const reqSub = row.requestedSubcontracting ?? row.subcontractingCosts;
    const reqTravel = row.requestedTravel ?? row.purchaseTravel;
    const reqEquip = row.requestedEquipment ?? row.purchaseEquipment;
    const reqOther = row.requestedOtherGoods ?? row.purchaseOtherGoods;
    const reqFstp = row.requestedFstp ?? row.financialSupportThirdParties;
    const reqInternally = row.requestedInternallyInvoiced ?? row.internallyInvoiced;
    return reqPersonnel + reqSub + reqTravel + reqEquip + reqOther + reqFstp + reqInternally;
  }, [row]);

  // Auto-calculate requested indirect costs: 25% of (requested direct - requested sub - requested fstp)
  const requestedIndirectCosts = useMemo(() => {
    if (!row || !row.hasInKind) return 0;
    const reqSub = row.requestedSubcontracting ?? row.subcontractingCosts;
    const reqFstp = row.requestedFstp ?? row.financialSupportThirdParties;
    return Math.round((requestedDirectCosts - reqSub - reqFstp) * 0.25);
  }, [row, requestedDirectCosts]);

  const inKindTotalRequested = useMemo(() => {
    if (!row || !row.hasInKind) return 0;
    return requestedDirectCosts + requestedIndirectCosts;
  }, [row, requestedDirectCosts, requestedIndirectCosts]);

  const requestedPct = useMemo(() => {
    if (!row || row.totalEligibleCosts <= 0) return 0;
    if (row.hasInKind) {
      return Math.round((inKindTotalRequested / row.totalEligibleCosts) * 1000) / 10;
    }
    return Math.round((row.requestedEuContribution / row.totalEligibleCosts) * 1000) / 10;
  }, [row, inKindTotalRequested]);

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

  const showReq = row.hasInKind;
  const colHeaders = showReq ? (
    <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground">
      <div className="w-[220px] shrink-0" />
      <div className="flex-1 text-center">Eligible costs</div>
      <div className="w-4" />
      <div className="w-8" />
      <div className="flex-1 text-center">Requested</div>
      <div className="w-4" />
    </div>
  ) : null;

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

      {/* In-kind contributions checkbox */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`in-kind-${row.id}`}
          checked={row.hasInKind}
          onCheckedChange={(checked) => updateRow(row.id, 'hasInKind', !!checked)}
          disabled={!editable}
        />
        <Label htmlFor={`in-kind-${row.id}`} className="text-sm font-medium cursor-pointer">
          Will this participant make any in-kind contributions?
        </Label>
      </div>

      {/* Column headers when in-kind is enabled */}
      {colHeaders}

      {/* PM Rate & Personnel Costs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">A. Personnel Costs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-[220px] shrink-0">Avg. weighted person month rate</label>
            <FormattedNumberInput
              value={row.pmRate ?? 0}
              onChange={(v) => updateRow(row.id, 'pmRate', v)}
              disabled={!editable}
              decimals={2}
              className="h-8 text-sm text-right flex-1"
            />
            <span className="text-xs text-muted-foreground w-4">€</span>
            <CopyButton value={row.pmRate ?? 0} />
            {showReq && <><div className="flex-1" /><div className="w-4" /></>}
          </div>
          <div className="flex items-center gap-2 py-1 text-sm">
            <span className="text-muted-foreground w-[220px] shrink-0">Total person months (from WP effort)</span>
            <div className="flex items-center gap-1 flex-1 justify-end">
              <span className="font-medium tabular-nums">{Number.isInteger(row.totalPersonMonths) ? row.totalPersonMonths.toFixed(0) : row.totalPersonMonths.toFixed(1)}</span>
              <CopyButton value={row.totalPersonMonths} />
            </div>
            {showReq && <><div className="flex-1" /><div className="w-8" /></>}
          </div>
          <div className="flex items-center gap-2 py-1 border-t text-sm">
            <span className="font-medium w-[220px] shrink-0">Personnel costs {row.pmRate ? '(auto-calculated)' : ''}</span>
            <div className="flex items-center gap-1 flex-1 justify-end">
              <span className="font-semibold tabular-nums">{formatCurrency(row.personnelCosts)}</span>
              <CopyButton value={row.personnelCosts} />
            </div>
            {showReq && (
              <>
                <FormattedNumberInput
                  value={row.requestedPersonnelCosts ?? row.personnelCosts}
                  onChange={(v) => updateRow(row.id, 'requestedPersonnelCosts', v)}
                  disabled={!editable}
                  allowZero
                  decimals={2}
                  className="h-8 text-sm text-right flex-1"
                />
                <span className="text-xs text-muted-foreground w-4">€</span>
                <CopyButton value={row.requestedPersonnelCosts ?? row.personnelCosts} />
              </>
            )}
          </div>
          {!row.pmRate && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground w-[220px] shrink-0">Personnel costs (manual)</label>
              <FormattedNumberInput
                value={row.personnelCosts}
                onChange={(v) => updateRow(row.id, 'personnelCosts', v)}
                disabled={!editable}
                decimals={2}
                className="h-8 text-sm text-right flex-1"
              />
              <span className="text-xs text-muted-foreground w-4">€</span>
              <CopyButton value={row.personnelCosts} />
              {showReq && <><div className="flex-1" /><div className="w-4" /></>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subcontracting Costs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">B. Subcontracting Costs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground w-[220px] shrink-0">Total subcontracting costs</label>
            <FormattedNumberInput
              value={row.subcontractingCosts}
              onChange={(v) => updateRow(row.id, 'subcontractingCosts', v)}
              disabled={!editable}
              decimals={2}
              className="h-8 text-sm text-right flex-1"
            />
            <span className="text-xs text-muted-foreground w-4">€</span>
            <CopyButton value={row.subcontractingCosts} />
            {showReq && (
              <>
                <FormattedNumberInput
                  value={row.requestedSubcontracting ?? row.subcontractingCosts}
                  onChange={(v) => updateRow(row.id, 'requestedSubcontracting', v)}
                  disabled={!editable}
                  allowZero
                  decimals={2}
                  className="h-8 text-sm text-right flex-1"
                />
                <span className="text-xs text-muted-foreground w-4">€</span>
                <CopyButton value={row.requestedSubcontracting ?? row.subcontractingCosts} />
              </>
            )}
          </div>
          {row.subcontractingCosts > 0 && (
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Justification *</label>
              <p className="text-xs text-muted-foreground italic">
                Subcontracting cost justifications will be automatically copied to Table 3.1.g. Provide concise descriptions of each cost and what they cover, e.g. Platform development (€25,000); legal advice (€15,000).
              </p>
              <Textarea
                value={rowSubItems[0]?.justification ?? ''}
                onChange={(e) => {
                  if (rowSubItems[0]) {
                    updateSubcontractingItem(rowSubItems[0].id, 'justification', e.target.value);
                  } else {
                    addSubcontractingItem(row.id).then(() => {});
                  }
                }}
                disabled={!editable}
                className="text-sm min-h-[60px]"
              />
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
          <p className="text-xs text-muted-foreground italic">
            Sitra collects cost justifications for all cost categories, even though not all are required in Part B, so that we have an understanding of the costs associated with the project. Please complete all fields. Equipment costs exceeding 15% of your organisation's personnel costs will be automatically copied to Table 3.1.h.
          </p>
          <CostInputRow
            label="C.1. Travel & subsistence"
            totalValue={row.purchaseTravel}
            requestedValue={row.requestedTravel}
            defaultRequested={row.purchaseTravel}
            showRequested={showReq}
            editable={editable}
            onTotalChange={(v) => updateRow(row.id, 'purchaseTravel', v)}
            onRequestedChange={(v) => updateRow(row.id, 'requestedTravel', v)}
          />
          {row.purchaseTravel > 0 && (
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Justification *</label>
              <p className="text-xs text-muted-foreground italic">
                Provide concise descriptions of each cost and what they cover, e.g. Consortium meetings (€5,000); conference attendance (€3,000).
              </p>
              <DebouncedTextarea
                value={justifications.find(j => j.budgetRowId === row.id && j.category === 'travel')?.justificationText ?? ''}
                onDebouncedChange={(v) => saveJustification(row.id, 'travel', v)}
                disabled={!editable}
                className="text-sm min-h-[60px]"
              />
            </div>
          )}
          <CostInputRow
            label="C.2. Equipment"
            totalValue={row.purchaseEquipment}
            requestedValue={row.requestedEquipment}
            defaultRequested={row.purchaseEquipment}
            showRequested={showReq}
            editable={editable}
            onTotalChange={(v) => updateRow(row.id, 'purchaseEquipment', v)}
            onRequestedChange={(v) => updateRow(row.id, 'requestedEquipment', v)}
          />
          {row.purchaseEquipment > 0 && (
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Justification *</label>
              <p className="text-xs text-muted-foreground italic">
                Provide concise descriptions of each cost and what they cover, e.g. Sensors and IoT devices (€12,000); server hardware (€8,000).
              </p>
              {equipmentJustificationRequired && (
                <div className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Equipment costs exceed 15% of personnel costs — justification will appear in Table 3.1.h</span>
                </div>
              )}
              <Textarea
                value={rowEquipItems[0]?.justification ?? ''}
                onChange={(e) => {
                  if (rowEquipItems[0]) {
                    updateEquipmentItem(rowEquipItems[0].id, 'justification', e.target.value);
                  } else {
                    addEquipmentItem(row.id);
                  }
                }}
                disabled={!editable}
                className="text-sm min-h-[60px]"
              />
            </div>
          )}
          <CostInputRow
            label="C.3. Other goods, works & services"
            totalValue={row.purchaseOtherGoods}
            requestedValue={row.requestedOtherGoods}
            defaultRequested={row.purchaseOtherGoods}
            showRequested={showReq}
            editable={editable}
            onTotalChange={(v) => updateRow(row.id, 'purchaseOtherGoods', v)}
            onRequestedChange={(v) => updateRow(row.id, 'requestedOtherGoods', v)}
          />
          {row.purchaseOtherGoods > 0 && (
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Justification *</label>
              <p className="text-xs text-muted-foreground italic">
                Provide concise descriptions of each cost and what they cover, e.g. Software licences (€4,000); cloud hosting (€6,000).
              </p>
              <DebouncedTextarea
                value={justifications.find(j => j.budgetRowId === row.id && j.category === 'other_goods')?.justificationText ?? ''}
                onDebouncedChange={(v) => saveJustification(row.id, 'other_goods', v)}
                disabled={!editable}
                className="text-sm min-h-[60px]"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* D. Other Direct Cost Categories */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">D. Other Direct Cost Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CostInputRow
            label="D.1. Financial support to third parties"
            totalValue={row.financialSupportThirdParties}
            requestedValue={row.requestedFstp}
            defaultRequested={row.financialSupportThirdParties}
            showRequested={showReq}
            editable={editable}
            onTotalChange={(v) => updateRow(row.id, 'financialSupportThirdParties', v)}
            onRequestedChange={(v) => updateRow(row.id, 'requestedFstp', v)}
          />
          <CostInputRow
            label="D.2. Internally invoiced goods & services"
            totalValue={row.internallyInvoiced}
            requestedValue={row.requestedInternallyInvoiced}
            defaultRequested={row.internallyInvoiced}
            showRequested={showReq}
            editable={editable}
            onTotalChange={(v) => updateRow(row.id, 'internallyInvoiced', v)}
            onRequestedChange={(v) => updateRow(row.id, 'requestedInternallyInvoiced', v)}
          />
        </CardContent>
      </Card>

      {/* Calculated Values & Funding */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Costs & Funding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Total direct costs */}
          <div className="flex items-center gap-2 py-1">
            <span className="text-sm text-muted-foreground w-[220px] shrink-0">Total direct costs</span>
            <div className="flex items-center gap-1 flex-1 justify-end">
              <span className="text-sm font-medium tabular-nums">{formatCurrency(row.directCosts)}</span>
              <CopyButton value={row.directCosts} />
            </div>
            {showReq && (
              <div className="flex items-center gap-1 flex-1 justify-end">
                <span className="text-sm font-medium tabular-nums">{formatCurrency(requestedDirectCosts)}</span>
                <CopyButton value={requestedDirectCosts} />
              </div>
            )}
          </div>
          {/* Total indirect costs */}
          <div className="flex items-center gap-2 py-1">
            <span className="text-sm text-muted-foreground w-[220px] shrink-0">Total indirect costs (25%)</span>
            <div className="flex items-center gap-1 flex-1 justify-end">
              <span className="text-sm font-medium tabular-nums">{formatCurrency(row.indirectCosts)}</span>
              <CopyButton value={row.indirectCosts} />
            </div>
            {showReq && (
              <div className="flex items-center gap-1 flex-1 justify-end">
                <span className="text-sm font-medium tabular-nums">{formatCurrency(requestedIndirectCosts)}</span>
                <CopyButton value={requestedIndirectCosts} />
              </div>
            )}
          </div>
          {/* Total / Total requested */}
          <div className="flex items-center gap-2 py-1 border-t">
            <span className="text-sm font-medium w-[220px] shrink-0">Total</span>
            <div className="flex items-center gap-1 flex-1 justify-end">
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(row.totalEligibleCosts)}</span>
              <CopyButton value={row.totalEligibleCosts} />
            </div>
            {showReq && (
              <div className="flex items-center gap-1 flex-1 justify-end">
                <span className="text-sm font-semibold tabular-nums">{formatCurrency(Math.min(inKindTotalRequested, row.maxEuContribution))}</span>
                <CopyButton value={Math.min(inKindTotalRequested, row.maxEuContribution)} />
              </div>
            )}
          </div>

          <div className="border-t pt-3 space-y-3">
            {showReq ? (
              <>
                {/* Funding rate: max on left, requested indicator on right */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground w-[220px] shrink-0">
                    Funding rate
                    <span className="text-xs ml-1">({row.fundingRateOverride != null ? 'custom' : 'auto'})</span>
                  </label>
                  <div className="flex items-center gap-1 flex-1 justify-end">
                    <FormattedNumberInput
                      value={row.fundingRateOverride ?? row.fundingRate}
                      onChange={(v) => updateRow(row.id, 'fundingRateOverride', v)}
                      disabled={!editable}
                      className="h-8 text-sm text-right w-20"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-1 flex-1 justify-end">
                    <span className="text-sm font-medium tabular-nums">{requestedPct.toFixed(1)}%</span>
                    <CopyButton value={requestedPct.toFixed(1)} />
                  </div>
                </div>
                {/* EU contribution: max on left, requested on right */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium w-[220px] shrink-0">EU contribution</label>
                  <div className="flex items-center gap-1 flex-1 justify-end">
                    <span className="text-sm font-medium tabular-nums">{formatCurrency(row.maxEuContribution)}</span>
                    <CopyButton value={row.maxEuContribution} />
                  </div>
                  <div className="flex items-center gap-1 flex-1 justify-end">
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(Math.min(inKindTotalRequested, row.maxEuContribution))}</span>
                    <CopyButton value={Math.min(inKindTotalRequested, row.maxEuContribution)} />
                  </div>
                </div>
                {inKindTotalRequested < row.maxEuContribution && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground italic">
                      Requesting {formatCurrency(row.maxEuContribution - Math.min(inKindTotalRequested, row.maxEuContribution))} less than maximum
                    </p>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm text-muted-foreground">In-kind contribution</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium tabular-nums">{formatCurrency(row.totalEligibleCosts - Math.min(inKindTotalRequested, row.maxEuContribution))}</span>
                        <CopyButton value={row.totalEligibleCosts - Math.min(inKindTotalRequested, row.maxEuContribution)} />
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Standard mode */
              <>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground w-[220px] shrink-0">
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
                  <span className="text-sm text-muted-foreground">Max. EU contribution</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium tabular-nums">{formatCurrency(row.maxEuContribution)}</span>
                    <CopyButton value={row.maxEuContribution} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground w-[220px] shrink-0">
                    Requested funding rate
                  </label>
                  <FormattedNumberInput
                    value={requestedPct}
                    onChange={(v) => {
                      const absValue = Math.round(row.totalEligibleCosts * (v / 100));
                      const capped = Math.min(absValue, row.maxEuContribution);
                      updateRow(row.id, 'requestedEuContributionOverride', capped);
                    }}
                    disabled={!editable}
                    allowZero
                    decimals={1}
                    className="h-8 text-sm text-right flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-4">%</span>
                  <CopyButton value={requestedPct} />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground w-[220px] shrink-0">
                    Requested EU contribution
                  </label>
                    <FormattedNumberInput
                     value={row.requestedEuContributionOverride ?? row.maxEuContribution}
                     onChange={(v) => updateRow(row.id, 'requestedEuContributionOverride', v)}
                     disabled={!editable}
                     allowZero
                     decimals={2}
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
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Financial information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Financial information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: 'incomeGenerated' as const, label: 'Income generated' },
            { key: 'financialContributions' as const, label: 'Financial contributions' },
            { key: 'ownResources' as const, label: 'Own resources' },
          ].map(f => (
            <div key={f.key} className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground w-[220px] shrink-0">{f.label}</label>
              <FormattedNumberInput
                value={row[f.key] as number}
                onChange={(v) => updateRow(row.id, f.key, v)}
                disabled={!editable}
                decimals={2}
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
