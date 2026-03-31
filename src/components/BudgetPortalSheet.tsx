import { useBudgetRows } from '@/hooks/useBudgetRows';
import { useQueryClient } from '@tanstack/react-query';
import { useProposalRole } from '@/hooks/useProposalRole';
import { formatNumber } from '@/lib/formatNumber';
import { BudgetValidationDialog } from '@/components/BudgetValidationEngine';
import { SaveIndicator } from '@/components/SaveIndicator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import * as XLSX from 'xlsx-js-style';
import { Lock, Unlock, Loader2, Euro, Calculator, FileSpreadsheet, Download, History, TableProperties, AlertCircle, Info, X, Users } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';
import { toast } from 'sonner';
import { FstpTab } from './FstpTab';
import { BudgetParticipantForm } from './BudgetParticipantForm';
import { A3EffortMatrix } from './A3EffortMatrix';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface BudgetPortalSheetProps {
  proposalId: string;
  proposalType: string | null;
  canEdit: boolean;
  isCoordinator: boolean;
  usesFstp?: boolean;
  fstpType?: 'grant' | 'prize';
  proposalAcronym?: string;
  onNavigateToParticipantBudget?: (participantId: string) => void;
}

const COST_CATEGORIES = [
  { key: 'personnelCosts', code: 'A.', name: 'Personnel costs', description: 'Costs of employees and natural persons working under a direct contract', isMajor: true },
  { key: 'subcontractingCosts', code: 'B.', name: 'Subcontracting costs', description: 'Costs of subcontracting core tasks', isMajor: true },
  { key: null, code: 'C.', name: 'Purchase costs', description: 'Purchase costs', isMajor: true, isGroupHeader: true },
  { key: 'purchaseTravel', code: 'C.1.', name: 'Travel & subsistence', description: 'Travel costs and related subsistence allowances' },
  { key: 'purchaseEquipment', code: 'C.2.', name: 'Equipment', description: 'Depreciation costs for equipment, infrastructure, or other assets' },
  { key: 'purchaseOtherGoods', code: 'C.3.', name: 'Other goods, works & services', description: 'Other purchases directly linked to the action' },
  { key: null, code: 'D.', name: 'Other cost categories', description: 'Other cost categories', isMajor: true, isGroupHeader: true },
  { key: 'financialSupportThirdParties', code: 'D.1.', name: 'Financial support to third parties', description: 'Grants, prizes, or similar support provided to third parties' },
  { key: 'internallyInvoiced', code: 'D.2.', name: 'Internally invoiced goods & services', description: 'Unit costs for internally invoiced goods and services' },
  { key: 'indirectCosts', code: 'E.', name: 'Indirect costs', description: '25% flat rate on eligible direct costs (excluding subcontracting)', isMajor: true, isIndirect: true },
] as const;

const PARTICIPANT_COLUMNS = [
  { key: 'personnelCosts', code: 'A.', name: 'Personnel costs', isMajor: true },
  { key: 'subcontractingCosts', code: 'B.', name: 'Subcontracting costs', isMajor: true },
  { key: 'purchaseTravel', code: 'C.1.', name: 'Travel & subsistence' },
  { key: 'purchaseEquipment', code: 'C.2.', name: 'Equipment' },
  { key: 'purchaseOtherGoods', code: 'C.3.', name: 'Other goods' },
  { key: 'financialSupportThirdParties', code: 'D.1.', name: 'FSTP' },
  { key: 'internallyInvoiced', code: 'D.2.', name: 'Internally inv.' },
  { key: 'indirectCosts', code: 'E.', name: 'Indirect costs', isMajor: true },
  { key: 'totalEligibleCosts', code: '', name: 'Total costs', isMajor: true },
  { key: 'fundingRate', code: '', name: 'Max. eligible funding rate' },
  { key: 'maxEuContribution', code: '', name: 'Max EU contribution' },
  { key: 'requestedFundingRate', code: '', name: 'Requested funding rate (%)' },
  { key: 'requestedEuContribution', code: '', name: 'Requested budget' },
] as const;

export function BudgetPortalSheet({
  proposalId,
  proposalType,
  canEdit,
  isCoordinator,
  usesFstp = false,
  fstpType = 'grant',
  proposalAcronym = '',
  onNavigateToParticipantBudget,
}: BudgetPortalSheetProps) {
  const {
    rows,
    grandTotals,
    loading,
    saving,
    lockRow,
    unlockRow,
    refetch: refetchBudgetRows,
  } = useBudgetRows(proposalId, proposalType);

  const queryClient = useQueryClient();
  const { roleTier } = useProposalRole(proposalId);
  const isAdmin = roleTier === 'coordinator';
  const [activeTab, setActiveTab] = useState('budget');
  const [validationOpen, setValidationOpen] = useState(false);
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);

  const editingRow = useMemo(
    () => editingParticipantId ? rows.find(r => r.participantId === editingParticipantId) : null,
    [editingParticipantId, rows]
  );

  const categoryTotals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const cat of COST_CATEGORIES) {
      if (cat.key) result[cat.key] = (grandTotals as any)[cat.key] || 0;
    }
    return result;
  }, [grandTotals]);

  const handleExportXlsx = () => {
    const wb = XLSX.utils.book_new();

    // Helper to convert column index (0-based) to Excel letter
    const colLetter = (c: number): string => {
      let s = '';
      let n = c;
      while (n >= 0) {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
      }
      return s;
    };

    // ─── Sheet 1: Staff Effort ───
    const cachedWps = queryClient.getQueryData<{ id: string; number: number; short_name: string | null; title: string | null }[]>(['a3-effort-wps', proposalId]) || [];
    const cachedParticipants = queryClient.getQueryData<{ id: string; participant_number: number | null; organisation_short_name: string | null; organisation_name: string }[]>(['a3-effort-participants', proposalId]) || [];
    const cachedEffort = queryClient.getQueryData<{ wp_draft_id: string; participant_id: string; person_months: number }[]>(['a3-effort-data', proposalId]) || [];

    const wpCount = cachedWps.length;
    const partCount = cachedParticipants.length;
    const effortTotalCol = colLetter(1 + wpCount); // last col = Total

    const effortHeaders: any[] = ['Participant', ...cachedWps.map(wp => `WP${wp.number}`), 'Total'];
    const effortAoa: any[][] = [effortHeaders];

    cachedParticipants.forEach((p, pIdx) => {
      const excelRow = pIdx + 2; // 1-indexed, row 1 = header
      const wpValues = cachedWps.map(wp => {
        const entry = cachedEffort.find(e => e.participant_id === p.id && e.wp_draft_id === wp.id);
        return entry?.person_months || 0;
      });
      // Total = SUM(B{row}:{lastWPcol}{row})
      const firstWpCol = colLetter(1);
      const lastWpCol = colLetter(wpCount);
      const totalFormula = `=SUM(${firstWpCol}${excelRow}:${lastWpCol}${excelRow})`;
      effortAoa.push([`${p.participant_number}. ${p.organisation_short_name || p.organisation_name}`, ...wpValues, { f: totalFormula }]);
    });

    // Total row with SUM formulas per column
    const totalRowIdx = partCount + 2;
    const effortTotalRow: any[] = ['Total'];
    for (let c = 1; c <= wpCount; c++) {
      const cl = colLetter(c);
      effortTotalRow.push({ f: `=SUM(${cl}2:${cl}${totalRowIdx - 1})` });
    }
    effortTotalRow.push({ f: `=SUM(${effortTotalCol}2:${effortTotalCol}${totalRowIdx - 1})` });
    effortAoa.push(effortTotalRow);

    const ws1 = XLSX.utils.aoa_to_sheet(effortAoa);
    XLSX.utils.book_append_sheet(wb, ws1, 'Staff Effort');

    // ─── Sheet 2: Summary by Participant ───
    // Columns: A=No, B=Participant, C=PM rate, D=Total PMs,
    //   E=A.Personnel, F=B.Subcontracting, G=C.1.Travel, H=C.2.Equipment, I=C.3.Other,
    //   J=D.1.FSTP, K=D.2.Internally inv, L=E.Indirect costs,
    //   M=Total costs, N=Max funding rate, O=Max EU contribution,
    //   P=Requested funding rate, Q=Requested budget,
    //   R=Share total budget, S=Share requested budget
    const summaryHeaders = [
      'No.', 'Participant', 'PM rate', 'Total PMs',
      'A. Personnel costs', 'B. Subcontracting costs',
      'C.1. Travel & subsistence', 'C.2. Equipment', 'C.3. Other goods',
      'D.1. FSTP', 'D.2. Internally inv.',
      'E. Indirect costs', 'Total costs',
      'Max. eligible funding rate', 'Max EU contribution',
      'Requested funding rate (%)', 'Requested budget',
      'Share of total budget (%)', 'Share of requested budget (%)',
    ];
    const summaryAoa: any[][] = [summaryHeaders];
    const summaryTotalRowNum = partCount + 2;

    rows.forEach((row, rIdx) => {
      const r = rIdx + 2; // Excel row number
      // Find matching participant index in effort sheet
      const effortPIdx = cachedParticipants.findIndex(p => p.id === row.participantId);
      const effortRow = effortPIdx >= 0 ? effortPIdx + 2 : -1;

      // D: Total PMs linked to Staff Effort total column
      const totalPMsVal = effortRow > 0
        ? { f: `='Staff Effort'!${effortTotalCol}${effortRow}` }
        : row.totalPersonMonths;

      // E: Personnel costs = IF(C>0, ROUND(C*D, 0), <raw value>)
      const personnelFormula = row.pmRate != null && row.pmRate > 0
        ? { f: `=ROUND(C${r}*D${r},0)` }
        : row.personnelCosts;

      // F-K: direct cost inputs (values from DB)
      const subcontracting = row.subcontractingCosts;
      const travel = row.purchaseTravel;
      const equipment = row.purchaseEquipment;
      const otherGoods = row.purchaseOtherGoods;
      const fstp = row.financialSupportThirdParties;
      const internally = row.internallyInvoiced;

      // L: Indirect costs = ROUND((E+G+H+I+K)*0.25, 0) [excl sub F and fstp J]
      const indirectFormula = row.indirectCostsOverride != null
        ? row.indirectCostsOverride
        : { f: `=ROUND((E${r}+G${r}+H${r}+I${r}+K${r})*0.25,0)` };

      // M: Total costs = E+F+G+H+I+J+K+L
      const totalCostsFormula = { f: `=E${r}+F${r}+G${r}+H${r}+I${r}+J${r}+K${r}+L${r}` };

      // N: Max funding rate (value)
      const computedRow = rows[rIdx];
      const fundingRate = computedRow.fundingRate / 100;

      // O: Max EU contribution = ROUND(M*N, 0)
      const maxEuFormula = { f: `=ROUND(M${r}*N${r},0)` };

      // P: Requested funding rate
      const requestedRate = computedRow.requestedEuContributionOverride != null
        ? { f: `=IF(M${r}>0,Q${r}/M${r},0)` }
        : fundingRate;

      // Q: Requested budget = MIN(override or max, O)
      const requestedBudget = computedRow.requestedEuContributionOverride != null
        ? Math.min(computedRow.requestedEuContributionOverride, computedRow.maxEuContribution)
        : { f: `=O${r}` };

      // R: Share of total budget = M / M$total
      const shareTotal = { f: `=IF(M$${summaryTotalRowNum}>0,M${r}/M$${summaryTotalRowNum},0)` };

      // S: Share of requested budget = Q / Q$total
      const shareRequested = { f: `=IF(Q$${summaryTotalRowNum}>0,Q${r}/Q$${summaryTotalRowNum},0)` };

      summaryAoa.push([
        row.participantNumber,
        row.participantShortName || row.participantName,
        row.pmRate ?? '',
        totalPMsVal,
        personnelFormula,
        subcontracting,
        travel,
        equipment,
        otherGoods,
        fstp,
        internally,
        indirectFormula,
        totalCostsFormula,
        fundingRate,
        maxEuFormula,
        requestedRate,
        requestedBudget,
        shareTotal,
        shareRequested,
      ]);
    });

    // Total row with SUM formulas
    const sumCols = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
    const totalRow: any[] = ['', 'TOTAL', ''];
    sumCols.forEach(cl => {
      totalRow.push({ f: `=SUM(${cl}2:${cl}${summaryTotalRowNum - 1})` });
    });
    // N: funding rate - blank for total
    totalRow.push('');
    // O: Max EU contribution sum
    totalRow.push({ f: `=SUM(O2:O${summaryTotalRowNum - 1})` });
    // P: Requested rate - blank
    totalRow.push('');
    // Q: Requested budget sum
    totalRow.push({ f: `=SUM(Q2:Q${summaryTotalRowNum - 1})` });
    // R, S: 100%
    totalRow.push(1);
    totalRow.push(1);
    summaryAoa.push(totalRow);

    const ws2 = XLSX.utils.aoa_to_sheet(summaryAoa);

    // Format percentage columns (N, P, R, S) - set number format
    const pctCols = [13, 15, 17, 18]; // 0-indexed: N=13, P=15, R=17, S=18
    for (let r = 1; r <= partCount + 1; r++) {
      pctCols.forEach(c => {
        const cellRef = colLetter(c) + (r + 1);
        if (ws2[cellRef]) ws2[cellRef].z = '0.0%';
      });
    }

    XLSX.utils.book_append_sheet(wb, ws2, 'Summary by Participant');

    // ─── Sheet 3: Budget Overview ───
    // Links amounts to Summary totals row
    const sTotal = summaryTotalRowNum; // row in Summary sheet with totals
    const summaryRef = (col: string) => `='Summary by Participant'!${col}${sTotal}`;

    // Build category rows with formulas referencing Summary totals
    const overviewAoa: any[][] = [['Category', 'Amount (€)', '% of Total']];

    // Map COST_CATEGORIES to Summary columns
    const catToSummaryCol: Record<string, string> = {
      personnelCosts: 'E',
      subcontractingCosts: 'F',
      purchaseTravel: 'G',
      purchaseEquipment: 'H',
      purchaseOtherGoods: 'I',
      financialSupportThirdParties: 'J',
      internallyInvoiced: 'K',
      indirectCosts: 'L',
    };

    let overviewRowIdx = 2; // first data row
    const catRowMap: Record<string, number> = {}; // code -> overview Excel row

    for (const cat of COST_CATEGORIES) {
      const isGroup = 'isGroupHeader' in cat && cat.isGroupHeader;
      let amountCell: any;

      if (isGroup) {
        // Sum subcategory rows - we'll reference them after building
        // For C: sum of C.1, C.2, C.3 => Travel + Equipment + Other
        // For D: sum of D.1, D.2 => FSTP + Internally
        if (cat.code === 'C.') {
          amountCell = { f: `=${summaryRef('G')}+${summaryRef('H')}+${summaryRef('I')}`.replace(/=/g, '').replace(/^/, '=') };
          // Simpler: direct formula
          amountCell = { f: `='Summary by Participant'!G${sTotal}+'Summary by Participant'!H${sTotal}+'Summary by Participant'!I${sTotal}` };
        } else if (cat.code === 'D.') {
          amountCell = { f: `='Summary by Participant'!J${sTotal}+'Summary by Participant'!K${sTotal}` };
        }
      } else if (cat.key && catToSummaryCol[cat.key]) {
        amountCell = { f: `='Summary by Participant'!${catToSummaryCol[cat.key]}${sTotal}` };
      } else {
        amountCell = 0;
      }

      catRowMap[cat.code] = overviewRowIdx;

      // % of Total = amount / total costs
      // Total costs row will be after all categories
      const totalCostsRow = overviewRowIdx + COST_CATEGORIES.length - (overviewRowIdx - 2); // will set after
      const pctFormula = { f: `=IF(B$${2 + COST_CATEGORIES.length}>0,B${overviewRowIdx}/B$${2 + COST_CATEGORIES.length},0)` };

      overviewAoa.push([`${cat.code} ${cat.name}`, amountCell, pctFormula]);
      overviewRowIdx++;
    }

    // Total costs row: link to Summary M total
    const totalCostsRowNum = overviewRowIdx;
    overviewAoa.push(['Total costs', { f: `='Summary by Participant'!M${sTotal}` }, 1]);

    // Requested EU contribution: link to Summary Q total
    overviewAoa.push(['Requested EU contribution', { f: `='Summary by Participant'!Q${sTotal}` },
      { f: `=IF(B${totalCostsRowNum}>0,B${totalCostsRowNum + 1}/B${totalCostsRowNum},0)` }]);

    // In-kind contributions = Total - Requested
    overviewAoa.push(['In-kind contributions',
      { f: `=B${totalCostsRowNum}-B${totalCostsRowNum + 1}` },
      { f: `=IF(B${totalCostsRowNum}>0,B${totalCostsRowNum + 2}/B${totalCostsRowNum},0)` }]);

    const ws3 = XLSX.utils.aoa_to_sheet(overviewAoa);

    // Format percentage column C in overview
    for (let r = 1; r < overviewAoa.length; r++) {
      const cellRef = `C${r + 1}`;
      if (ws3[cellRef]) ws3[cellRef].z = '0.0%';
    }

    XLSX.utils.book_append_sheet(wb, ws3, 'Budget Overview');

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const acronym = proposalAcronym || 'Budget';
    XLSX.writeFile(wb, `${timestamp} ${acronym} Budget.xlsx`);
    toast.success('Budget exported to Excel');
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
        <span className="text-muted-foreground">Loading budget overview…</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="mx-auto space-y-6 max-w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">Part A3: Budget</h1>
            <PartAGuidelinesDialog
              sectionTitle="Part A3: Budget"
              officialGuidelines={[{
                id: 'budget-info',
                title: 'Budget Guidelines',
                content: 'The estimated budget should include all eligible costs for the action.\n\nKey budget categories:\n• A. Personnel costs\n• B. Subcontracting\n• C. Purchase costs (Travel, Equipment, Other)\n• D. Other cost categories (Internally invoiced)\n• E. Indirect costs (25% flat rate)\n\nAll costs must be directly linked to the project activities.'
              }]}
              sitraTips={[{
                id: 'budget-tip',
                title: 'Budget planning tips',
                content: 'Start by estimating person months per work package, then convert to costs.\n\nRecommendations:\n• Distribute effort proportionally across partners\n• Include buffer for unexpected costs where rules allow\n• Ensure consistency between budget and work package descriptions'
              }]}
            />
            {activeTab !== 'validation' && (
              <SaveIndicator saving={saving} lastSaved={null} />
            )}
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="budget">Budget dashboard</TabsTrigger>
              {usesFstp && <TabsTrigger value="fstp">Financial support to third parties (FSTP)</TabsTrigger>}
              
            </TabsList>
            <div className="flex items-center gap-3">
              <Badge variant={proposalType === 'lump_sum' ? 'default' : 'secondary'}>
                {proposalType === 'lump_sum' ? 'Lump sum budget model' : 'Actual costs budget model'}
              </Badge>
              {isAdmin && (
                <Button variant="outline" className="gap-2" onClick={() => setValidationOpen(true)}>
                  <AlertCircle className="w-4 h-4" />
                  Validate
                </Button>
              )}
              <Button variant="outline" className="gap-2" onClick={handleExportXlsx}>
                <Download className="w-4 h-4" />
                Export budget
              </Button>
            </div>
          </div>

          {/* Budget Tab */}
          <TabsContent value="budget" className="space-y-4">
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Budget overview by category</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <table className="text-xs border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="px-2 py-1.5 text-left border-r font-bold">Category</th>
                          <th className="px-2 py-1.5 text-left border-r font-bold">Amount (€)</th>
                          <th className="px-2 py-1.5 text-left border-r font-bold">% of Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {COST_CATEGORIES.map((cat) => {
                          const isGroup = 'isGroupHeader' in cat && cat.isGroupHeader;
                          const amount = cat.key ? (categoryTotals[cat.key] || 0) : 0;
                          const isMajorStandalone = 'isMajor' in cat && cat.isMajor && !isGroup;

                          // For group headers, compute subtotal from sub-items
                          let displayAmount = amount;
                          if (isGroup) {
                            const prefix = cat.code.replace('.', '');
                            displayAmount = COST_CATEGORIES
                              .filter(c => !('isGroupHeader' in c) && !('isMajor' in c && c.isMajor) && c.key && c.code.startsWith(prefix))
                              .reduce((sum, c) => sum + (categoryTotals[c.key!] || 0), 0);
                          }

                          const percentage = grandTotals.totalEligibleCosts > 0 && (cat.key || isGroup)
                            ? ((displayAmount / grandTotals.totalEligibleCosts) * 100).toFixed(1)
                            : '';

                          return (
                            <tr key={cat.code} className={cn('border-t', isGroup && 'bg-muted/30')}>
                              <td className="px-2 py-1 text-left border-r">
                                <span className={cn(('isMajor' in cat && cat.isMajor) ? 'font-bold' : 'pl-4')}>
                                  {cat.code} {cat.name}
                                </span>
                              </td>
                              <td className={cn("px-2 py-1 text-right border-r tabular-nums font-mono whitespace-nowrap", (isMajorStandalone || isGroup) && 'font-bold')}>
                                {formatNumber(displayAmount, 2)}
                              </td>
                              <td className={cn("px-2 py-1 text-right border-r whitespace-nowrap", (isMajorStandalone || isGroup) && 'font-bold')}>
                                {percentage ? `${percentage}%` : ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-foreground/20 bg-muted/40 font-semibold">
                          <td className="px-2 py-1 border-r font-bold">Total costs</td>
                          <td className="px-2 py-1 text-right border-r tabular-nums font-mono font-bold whitespace-nowrap">
                            {formatNumber(grandTotals.totalEligibleCosts, 2)}
                          </td>
                          <td className="px-2 py-1 text-right border-r font-bold">100%</td>
                        </tr>
                        <tr className="border-t bg-muted/40 font-semibold">
                          <td className="px-2 py-1 border-r font-bold">Requested EU contribution</td>
                          <td className="px-2 py-1 text-right border-r tabular-nums font-mono font-bold whitespace-nowrap">
                            {formatNumber(grandTotals.requestedEuContribution, 2)}
                          </td>
                          <td className="px-2 py-1 text-right border-r font-bold">
                            {grandTotals.totalEligibleCosts > 0
                              ? ((grandTotals.requestedEuContribution / grandTotals.totalEligibleCosts) * 100).toFixed(1)
                              : '0'}%
                          </td>
                        </tr>
                        <tr className="border-t bg-muted/40 font-semibold">
                          <td className="px-2 py-1 border-r font-bold">In-kind contributions</td>
                          <td className="px-2 py-1 text-right border-r tabular-nums font-mono font-bold whitespace-nowrap">
                            {formatCurrency(grandTotals.totalEligibleCosts - grandTotals.requestedEuContribution)}
                          </td>
                          <td className="px-2 py-1 text-right border-r font-bold">
                            {grandTotals.totalEligibleCosts > 0
                              ? (((grandTotals.totalEligibleCosts - grandTotals.requestedEuContribution) / grandTotals.totalEligibleCosts) * 100).toFixed(1)
                              : '0'}%
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <A3EffortMatrix proposalId={proposalId} canEdit={canEdit} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary by participant</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                    <table className="text-xs border-collapse w-full">
                      <thead>
                        {/* Major category header row */}
                        <tr className="border-b">
                          <th rowSpan={2} className="sticky left-0 bg-background z-10 px-2 py-1.5 text-left border-r font-bold whitespace-nowrap align-middle">Participant</th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '50px' }}>PM<br/>rate</th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '50px' }}>Total<br/>PMs</th>
                          {/* A. Personnel costs - standalone */}
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">A.</div><div className="leading-tight">Personnel costs</div></th>
                          {/* B. Subcontracting costs - standalone */}
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">B.</div><div className="leading-tight">Subcontracting costs</div></th>
                          {/* C. Purchase costs - spans 3 */}
                          <th colSpan={3} className="px-2 py-1.5 text-left border-r font-bold border-b" style={{ minWidth: '60px' }}>C. Purchase costs</th>
                          {/* D. Other cost categories - spans 2 */}
                          <th colSpan={2} className="px-2 py-1.5 text-left border-r font-bold border-b" style={{ minWidth: '60px' }}>D. Other cost categories</th>
                          {/* E. Indirect costs - standalone */}
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">E.</div><div className="leading-tight">Indirect costs</div></th>
                          {/* Remaining columns - standalone */}
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">Total costs</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">Max. eligible</div><div className="leading-tight">funding rate</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">Max EU</div><div className="leading-tight">contribution</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">Requested</div><div className="leading-tight">funding rate (%)</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">Requested</div><div className="leading-tight">budget</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}>Share of<br/>total budget<br/>(%)</th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}>Share of<br/>requested<br/>budget (%)</th>
                        </tr>
                        {/* Sub-category header row */}
                        <tr className="border-b">
                          {/* C sub-categories */}
                          <th className="px-2 py-1.5 text-left border-r font-bold" style={{ minWidth: '60px' }}><div className="leading-tight">C.1.</div><div className="leading-tight">Travel & subsistence</div></th>
                          <th className="px-2 py-1.5 text-left border-r font-bold" style={{ minWidth: '60px' }}><div className="leading-tight">C.2.</div><div className="leading-tight">Equipment</div></th>
                          <th className="px-2 py-1.5 text-left border-r font-bold" style={{ minWidth: '60px' }}><div className="leading-tight">C.3.</div><div className="leading-tight">Other goods</div></th>
                          {/* D sub-categories */}
                          <th className="px-2 py-1.5 text-left border-r font-bold" style={{ minWidth: '60px' }}><div className="leading-tight">D.1.</div><div className="leading-tight">FSTP</div></th>
                          <th className="px-2 py-1.5 text-left border-r font-bold" style={{ minWidth: '60px' }}><div className="leading-tight">D.2.</div><div className="leading-tight">Internally inv.</div></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(row => {
                          const percentage = grandTotals.totalEligibleCosts > 0
                            ? ((row.totalEligibleCosts / grandTotals.totalEligibleCosts) * 100).toFixed(1)
                            : '0';
                          const requestPercentage = grandTotals.requestedEuContribution > 0
                            ? ((row.requestedEuContribution / grandTotals.requestedEuContribution) * 100).toFixed(1)
                            : '0';
                          const requestedFundingRate = row.totalEligibleCosts > 0
                            ? ((row.requestedEuContribution / row.totalEligibleCosts) * 100).toFixed(1)
                            : '0';

                          return (
                            <tr key={row.id} className={cn('border-t hover:bg-muted/50', row.isLocked && !isAdmin && 'opacity-60')}>
                              <td className="sticky left-0 bg-background z-10 px-2 py-1 border-r whitespace-nowrap">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1 font-bold">
                                    {row.participantNumber}. {row.participantShortName || row.participantName}
                                    {row.isLocked && !isAdmin && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                                  </span>
                                  <span className="flex items-center gap-1 shrink-0">
                                    {isAdmin && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => row.isLocked ? unlockRow(row.id) : lockRow(row.id)}
                                      >
                                        {row.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-muted-foreground" />}
                                      </Button>
                                    )}
                                    {canEdit && (
                                      <Button
                                        size="sm"
                                        className="h-5 px-2 text-[10px] font-semibold whitespace-nowrap"
                                        onClick={() => setEditingParticipantId(row.participantId)}
                                      >
                                        Edit
                                      </Button>
                                    )}
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-1 text-right border-r tabular-nums font-mono whitespace-nowrap">
                                {row.pmRate != null ? formatCurrency(row.pmRate) : '—'}
                              </td>
                              <td className="px-2 py-1 text-right border-r tabular-nums font-mono whitespace-nowrap">
                                {Number.isInteger(row.totalPersonMonths) ? row.totalPersonMonths.toFixed(0) : row.totalPersonMonths.toFixed(1)}
                              </td>
                              
                              {PARTICIPANT_COLUMNS.map(c => (
                                <td key={c.key} className="px-2 py-1 text-right border-r tabular-nums font-mono whitespace-nowrap">
                                  {c.key === 'fundingRate'
                                    ? `${(row as any)[c.key]}%`
                                    : c.key === 'requestedFundingRate'
                                    ? `${requestedFundingRate}%`
                                    : formatCurrency((row as any)[c.key] as number)}
                                </td>
                              ))}
                              <td className="px-2 py-1 text-right border-r whitespace-nowrap">{percentage}%</td>
                              <td className="px-2 py-1 text-right border-r whitespace-nowrap">{requestPercentage}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-foreground/20 bg-muted/40 font-semibold">
                          <td className="sticky left-0 bg-muted/40 z-10 px-2 py-1 border-r font-bold">TOTAL</td>
                          <td className="px-2 py-1 text-right border-r" />
                          <td className="px-2 py-1 text-right border-r tabular-nums font-mono font-bold whitespace-nowrap">
                            {(() => {
                              const totalPMs = rows.reduce((s, r) => s + r.totalPersonMonths, 0);
                              return Number.isInteger(totalPMs) ? totalPMs.toFixed(0) : totalPMs.toFixed(1);
                            })()}
                          </td>
                          {PARTICIPANT_COLUMNS.map(c => (
                            <td key={c.key} className="px-2 py-1 text-right border-r tabular-nums font-mono font-bold whitespace-nowrap">
                              {c.key === 'fundingRate' || c.key === 'requestedFundingRate'
                                ? ''
                                : formatCurrency((grandTotals as any)[c.key] || 0)}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-right border-r font-bold">100%</td>
                          <td className="px-2 py-1 text-right border-r font-bold">100%</td>
                        </tr>
                      </tfoot>
                    </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>


          {usesFstp && (
            <TabsContent value="fstp">
              <FstpTab
                proposalId={proposalId}
                proposalAcronym={proposalAcronym}
                canEdit={canEdit}
                isCoordinator={isAdmin}
                fstpType={fstpType}
              />
            </TabsContent>
          )}

          <BudgetValidationDialog proposalId={proposalId} open={validationOpen} onOpenChange={setValidationOpen} />
        </Tabs>

      </div>

      {/* Participant Budget Dialog */}
      <Dialog open={!!editingParticipantId} onOpenChange={(open) => { if (!open) { setEditingParticipantId(null); refetchBudgetRows(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>
              {editingRow
                ? `${editingRow.participantNumber}. ${editingRow.participantShortName || editingRow.participantName} — Budget`
                : 'Participant Budget'}
            </DialogTitle>
          </DialogHeader>
          {editingParticipantId && (
            <BudgetParticipantForm
              proposalId={proposalId}
              participantId={editingParticipantId}
              proposalType={proposalType}
              canEdit={canEdit}
              isCoordinator={isCoordinator}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
