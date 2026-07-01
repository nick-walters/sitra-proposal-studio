import { useState, useCallback, useMemo } from 'react';
import { useBudgetRows } from '@/hooks/useBudgetRows';
import { useProposalRole } from '@/hooks/useProposalRole';
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { JustificationItemsEditor } from '@/components/JustificationItemsEditor';
import { formatCurrency, formatPercent } from '@/lib/formatNumber';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Lock, Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import { BudgetPersonnelBreakdown } from '@/components/BudgetPersonnelBreakdown';
import { PartAPageLayout } from '@/components/PartAPageLayout';



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
    justificationItems,
    personnelBreakdown,
    loading,
    saving,
    updateRow,
    addJustificationItem,
    updateJustificationItem,
    deleteJustificationItem,
    reorderJustificationItems,
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
    <PartAPageLayout
      title={`${row.participantNumber}. ${row.participantShortName || row.participantName}`}
      titleAs="h2"
      titleClassName="text-lg font-semibold"
      titleNode={
        <h2 className="text-lg font-semibold">
          {row.participantNumber}. {row.participantShortName || row.participantName}
          <span className="text-sm font-normal text-muted-foreground ml-2">({row.roleLabel})</span>
        </h2>
      }

      subtitle={<p className="text-sm text-muted-foreground">{row.country || 'No country specified'}</p>}
      titleRightSlot={saving ? (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Saving…
        </span>
      ) : undefined}
      maxWidth="max-w-2xl"
    >


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
          <BudgetPersonnelBreakdown
            budgetRowId={row.id}
            totalPersonMonths={row.totalPersonMonths}
            items={personnelBreakdown}
            editable={editable}
            onAdd={() => addPersonnelBreakdownItem(row.id)}
            onUpdate={updatePersonnelBreakdownItem}
            onDelete={deletePersonnelBreakdownItem}
          />

          {showReq && (
            <div className="flex items-center gap-2 py-1 border-t text-sm">
              <span className="font-medium w-[220px] shrink-0">Requested personnel costs</span>
              <div className="flex-1" />
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
            <div className="flex items-center gap-1 flex-1 justify-end">
              <span className="text-sm font-medium tabular-nums">{formatCurrency(row.subcontractingCosts)}</span>
              <span className="text-xs text-muted-foreground">(sum of rows)</span>
              <CopyButton value={row.subcontractingCosts} />
            </div>
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
          <JustificationItemsEditor
            budgetRowId={row.id}
            category="subcontracting"
            items={justificationItems}
            editable={editable}
            helpText="Subcontracting cost justifications will be automatically copied to Table 3.1.g. Provide concise descriptions of each cost and what they cover, e.g. Platform development; legal advice."
            onAdd={addJustificationItem}
            onUpdate={updateJustificationItem}
            onDelete={deleteJustificationItem}
            onReorder={reorderJustificationItems}
          />
        </CardContent>
      </Card>

      {/* C. Purchase Costs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">C. Purchase Costs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground italic">
            Sitra collects cost justifications for all cost categories, even though not all are required in Part B, so that we have an understanding of the costs associated with the project. Equipment costs exceeding 15% of your organisation's personnel costs will be automatically copied to Table 3.1.h.
          </p>

          {/* C.1 Travel */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium w-[220px] shrink-0">C.1. Travel & subsistence</label>
              <div className="flex items-center gap-1 flex-1 justify-end">
                <span className="text-sm font-medium tabular-nums">{formatCurrency(row.purchaseTravel)}</span>
                <span className="text-xs text-muted-foreground">(sum)</span>
                <CopyButton value={row.purchaseTravel} />
              </div>
              {showReq && (
                <>
                  <FormattedNumberInput
                    value={row.requestedTravel ?? row.purchaseTravel}
                    onChange={(v) => updateRow(row.id, 'requestedTravel', v)}
                    disabled={!editable}
                    allowZero
                    decimals={2}
                    className="h-8 text-sm text-right flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-4">€</span>
                  <CopyButton value={row.requestedTravel ?? row.purchaseTravel} />
                </>
              )}
            </div>
            <JustificationItemsEditor
              budgetRowId={row.id}
              category="travel"
              items={justificationItems}
              editable={editable}
              helpText="Provide concise descriptions of each cost and what they cover, e.g. Consortium meetings; conference attendance."
              onAdd={addJustificationItem}
              onUpdate={updateJustificationItem}
              onDelete={deleteJustificationItem}
              onReorder={reorderJustificationItems}
            />
          </div>

          {/* C.2 Equipment */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium w-[220px] shrink-0">C.2. Equipment</label>
              <div className="flex items-center gap-1 flex-1 justify-end">
                <span className="text-sm font-medium tabular-nums">{formatCurrency(row.purchaseEquipment)}</span>
                <span className="text-xs text-muted-foreground">(sum)</span>
                <CopyButton value={row.purchaseEquipment} />
              </div>
              {showReq && (
                <>
                  <FormattedNumberInput
                    value={row.requestedEquipment ?? row.purchaseEquipment}
                    onChange={(v) => updateRow(row.id, 'requestedEquipment', v)}
                    disabled={!editable}
                    allowZero
                    decimals={2}
                    className="h-8 text-sm text-right flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-4">€</span>
                  <CopyButton value={row.requestedEquipment ?? row.purchaseEquipment} />
                </>
              )}
            </div>
            {equipmentJustificationRequired && (
              <div className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Equipment costs exceed 15% of personnel costs — justification will appear in Table 3.1.h</span>
              </div>
            )}
            <JustificationItemsEditor
              budgetRowId={row.id}
              category="equipment"
              items={justificationItems}
              editable={editable}
              helpText="Provide concise descriptions of each cost and what they cover, e.g. Sensors and IoT devices; server hardware."
              onAdd={addJustificationItem}
              onUpdate={updateJustificationItem}
              onDelete={deleteJustificationItem}
              onReorder={reorderJustificationItems}
            />
          </div>

          {/* C.3 Other goods */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium w-[220px] shrink-0">C.3. Other goods, works & services</label>
              <div className="flex items-center gap-1 flex-1 justify-end">
                <span className="text-sm font-medium tabular-nums">{formatCurrency(row.purchaseOtherGoods)}</span>
                <span className="text-xs text-muted-foreground">(sum)</span>
                <CopyButton value={row.purchaseOtherGoods} />
              </div>
              {showReq && (
                <>
                  <FormattedNumberInput
                    value={row.requestedOtherGoods ?? row.purchaseOtherGoods}
                    onChange={(v) => updateRow(row.id, 'requestedOtherGoods', v)}
                    disabled={!editable}
                    allowZero
                    decimals={2}
                    className="h-8 text-sm text-right flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-4">€</span>
                  <CopyButton value={row.requestedOtherGoods ?? row.purchaseOtherGoods} />
                </>
              )}
            </div>
            <JustificationItemsEditor
              budgetRowId={row.id}
              category="other_goods"
              items={justificationItems}
              editable={editable}
              helpText="Provide concise descriptions of each cost and what they cover, e.g. Software licences; cloud hosting."
              onAdd={addJustificationItem}
              onUpdate={updateJustificationItem}
              onDelete={deleteJustificationItem}
              onReorder={reorderJustificationItems}
            />
          </div>
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
          <JustificationItemsEditor
            budgetRowId={row.id}
            category="fstp"
            items={justificationItems}
            editable={editable}
            helpText="Optional. Used only if the coordinator opts to include the D.1 justification table in B3.1."
            onAdd={addJustificationItem}
            onUpdate={updateJustificationItem}
            onDelete={deleteJustificationItem}
            onReorder={reorderJustificationItems}
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
          <JustificationItemsEditor
            budgetRowId={row.id}
            category="internally_invoiced"
            items={justificationItems}
            editable={editable}
            helpText="Optional. Used only if the coordinator opts to include the D.2 justification table in B3.1."
            onAdd={addJustificationItem}
            onUpdate={updateJustificationItem}
            onDelete={deleteJustificationItem}
            onReorder={reorderJustificationItems}
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
                    <span className="text-sm font-medium tabular-nums">{formatPercent(requestedPct)}</span>
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
    </PartAPageLayout>

  );
}
