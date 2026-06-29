import { useBudgetRows } from '@/hooks/useBudgetRows';
import { useQueryClient } from '@tanstack/react-query';
import { useProposalRole } from '@/hooks/useProposalRole';
import { formatNumber } from '@/lib/formatNumber';
import { BudgetValidationDialog } from '@/components/BudgetValidationEngine';
import { SaveIndicator } from '@/components/SaveIndicator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type * as XLSXNS from 'xlsx-js-style';
// XLSX runtime is loaded lazily inside handleExportXlsx() to keep it out of the initial bundle.
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
import { useState, useMemo, useEffect } from 'react';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';
import { PartAPageLayout } from './PartAPageLayout';

import { toast } from 'sonner';
import { FstpTab } from './FstpTab';
import { BudgetParticipantForm } from './BudgetParticipantForm';
import { A3EffortMatrix } from './A3EffortMatrix';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ParticipantBubble } from '@/components/B31Pill';

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
  { key: 'financialSupportThirdParties', code: 'D.1.', name: 'Financial support to third parties' },
  { key: 'internallyInvoiced', code: 'D.2.', name: 'Internally invoiced goods & services' },
  { key: 'indirectCosts', code: 'E.', name: 'Indirect costs', isMajor: true },
  { key: 'totalEligibleCosts', code: '', name: 'Total costs', isMajor: true },
  { key: 'fundingRate', code: '', name: 'Max. eligible funding rate' },
  { key: 'maxEuContribution', code: '', name: 'Max. EU contribution' },
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
    justificationItems,
    grandTotals,
    loading,
    saving,
    lockRow,
    unlockRow,
    lockAllRows,
    unlockAllRows,
    refetch: refetchBudgetRows,
  } = useBudgetRows(proposalId, proposalType);

  const queryClient = useQueryClient();
  const { roleTier } = useProposalRole(proposalId);
  const isAdmin = roleTier === 'coordinator';
  const [activeTab, setActiveTab] = useState('budget');
  const [validationOpen, setValidationOpen] = useState(false);
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [lockedEditWarning, setLockedEditWarning] = useState<{ participantId: string } | null>(null);

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

  // Compute per-category requested costs
  // For participants with hasInKind, use their explicit per-category requested values
  // For others, use proportional allocation (category cost × requested/total ratio)
  const categoryRequestedTotals = useMemo(() => {
    const catToRequestedField: Record<string, string> = {
      personnelCosts: 'requestedPersonnelCosts',
      subcontractingCosts: 'requestedSubcontracting',
      purchaseTravel: 'requestedTravel',
      purchaseEquipment: 'requestedEquipment',
      purchaseOtherGoods: 'requestedOtherGoods',
      financialSupportThirdParties: 'requestedFstp',
      internallyInvoiced: 'requestedInternallyInvoiced',
      indirectCosts: 'requestedIndirectCosts',
    };

    const result: Record<string, number> = {};
    for (const cat of COST_CATEGORIES) {
      if (!cat.key) continue;
      let total = 0;
      for (const row of rows) {
        const catValue = (row as any)[cat.key] || 0;
        if (row.hasInKind) {
          const reqField = catToRequestedField[cat.key];
          total += reqField ? ((row as any)[reqField] ?? catValue) : catValue;
        } else if (row.totalEligibleCosts > 0) {
          total += catValue * (row.requestedEuContribution / row.totalEligibleCosts);
        }
      }
      result[cat.key] = total;
    }
    return result;
  }, [rows]);

  const handleExportXlsx = async () => {
    const [XLSX, JSZipMod] = await Promise.all([
      import('xlsx-js-style'),
      import('jszip'),
    ]);
    const JSZip = JSZipMod.default;
    const wb = XLSX.utils.book_new();

    const colLetter = (c: number): string => {
      let s = '';
      let n = c;
      while (n >= 0) {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
      }
      return s;
    };

    const bold = { font: { bold: true } };
    const boldCurrency = { font: { bold: true }, numFmt: '#,##0.00' };
    const boldPct = { font: { bold: true }, numFmt: '0.0' };
    const currencyFmt = { numFmt: '#,##0.00' };
    const pctFmt = { numFmt: '0.0' };
    const pmFmt = { numFmt: '0.0' };

    // Helper to apply styles to header row
    const styleHeaders = (ws: XLSXNS.WorkSheet, rowNum: number, colCount: number) => {
      for (let c = 0; c < colCount; c++) {
        const ref = colLetter(c) + rowNum;
        if (ws[ref]) ws[ref].s = bold;
      }
    };

    // Helper to apply styles to a row
    const styleRow = (ws: XLSXNS.WorkSheet, rowNum: number, colCount: number, style: any) => {
      for (let c = 0; c < colCount; c++) {
        const ref = colLetter(c) + rowNum;
        if (ws[ref]) ws[ref].s = { ...ws[ref].s, ...style };
      }
    };

    // Helper to bold an entire column
    const styleCol = (ws: XLSXNS.WorkSheet, colIdx: number, startRow: number, endRow: number) => {
      const cl = colLetter(colIdx);
      for (let r = startRow; r <= endRow; r++) {
        const ref = cl + r;
        if (ws[ref]) ws[ref].s = { ...ws[ref].s, font: { bold: true } };
      }
    };

    // Helper to auto-fit column widths based on content
    const autoFitCols = (ws: XLSXNS.WorkSheet, aoa: any[][]) => {
      const colWidths: number[] = [];
      for (const row of aoa) {
        row.forEach((cell: any, i: number) => {
          let len = 0;
          if (cell == null) len = 0;
          else if (typeof cell === 'object' && cell.f) len = 12; // formula placeholder
          else len = String(cell).length;
          colWidths[i] = Math.max(colWidths[i] || 0, len);
        });
      }
      ws['!cols'] = colWidths.map(w => ({ wch: Math.max(w + 2, 8) }));
    };

    // ─── Sheet 1: Staff Effort ───
    const cachedWps = queryClient.getQueryData<{ id: string; number: number; short_name: string | null; title: string | null }[]>(['a3-effort-wps', proposalId]) || [];
    const cachedParticipants = queryClient.getQueryData<{ id: string; participant_number: number | null; organisation_short_name: string | null; organisation_name: string }[]>(['a3-effort-participants', proposalId]) || [];
    const cachedEffort = queryClient.getQueryData<{ wp_draft_id: string; participant_id: string; person_months: number }[]>(['a3-effort-data', proposalId]) || [];

    const wpCount = cachedWps.length;
    const partCount = cachedParticipants.length;
    const effortTotalCol = colLetter(1 + wpCount);

    const effortHeaders: any[] = ['Participant', ...cachedWps.map(wp => `WP${wp.number}`), 'Total'];
    const effortAoa: any[][] = [effortHeaders];

    cachedParticipants.forEach((p, pIdx) => {
      const excelRow = pIdx + 2;
      const wpValues = cachedWps.map(wp => {
        const entry = cachedEffort.find(e => e.participant_id === p.id && e.wp_draft_id === wp.id);
        return entry?.person_months || 0;
      });
      const firstWpCol = colLetter(1);
      const lastWpCol = colLetter(wpCount);
      const totalFormula = `=SUM(${firstWpCol}${excelRow}:${lastWpCol}${excelRow})`;
      effortAoa.push([`${p.participant_number}. ${p.organisation_short_name || p.organisation_name}`, ...wpValues, { f: totalFormula }]);
    });

    const totalRowIdx = partCount + 2;
    const effortTotalRow: any[] = ['Total'];
    for (let c = 1; c <= wpCount; c++) {
      const cl = colLetter(c);
      effortTotalRow.push({ f: `=SUM(${cl}2:${cl}${totalRowIdx - 1})` });
    }
    effortTotalRow.push({ f: `=SUM(${effortTotalCol}2:${effortTotalCol}${totalRowIdx - 1})` });
    effortAoa.push(effortTotalRow);

    const ws1 = XLSX.utils.aoa_to_sheet(effortAoa);
    const effortColCount = effortHeaders.length;

    // Bold headers
    styleHeaders(ws1, 1, effortColCount);
    // Bold participant names (column A) and total row
    for (let r = 2; r <= partCount + 1; r++) {
      const ref = `A${r}`;
      if (ws1[ref]) ws1[ref].s = bold;
    }
    // Bold total row
    styleRow(ws1, totalRowIdx, effortColCount, bold);
    // PM format for all data cells
    for (let r = 2; r <= totalRowIdx; r++) {
      for (let c = 1; c < effortColCount; c++) {
        const ref = colLetter(c) + r;
        if (ws1[ref]) ws1[ref].s = { ...ws1[ref].s, numFmt: '0.0' };
      }
    }

    // Bold Total column (last column) for all data + total rows
    const totalColIdx = effortColCount - 1;
    styleCol(ws1, totalColIdx, 1, totalRowIdx);
    // Auto-fit columns
    autoFitCols(ws1, effortAoa);

    XLSX.utils.book_append_sheet(wb, ws1, 'Staff Effort');

    // ─── Sheet 2: Summary by Participant ───
    // Combined participant column: "No. ShortName"
    // Columns: A=Participant, B=PM rate (€), C=Total PMs,
    //   D=A.Personnel (€), E=B.Subcontracting (€), F=C.1.Travel (€), G=C.2.Equipment (€), H=C.3.Other (€),
    //   I=D.1.FSTP (€), J=D.2.Internally inv (€), K=E.Indirect costs (€),
    //   L=Total costs (€), M=Max funding rate, N=Max EU contribution (€),
    //   O=Requested funding rate (%), P=Requested budget (€),
    //   Q=Share total budget (%), R=Share requested budget (%)
    const summaryHeaders = [
      'Participant', 'PM rate (€)', 'Total PMs',
      'A. Personnel costs (€)', 'B. Subcontracting costs (€)',
      'C.1. Travel & subsistence (€)', 'C.2. Equipment (€)', 'C.3. Other goods (€)',
      'D.1. Financial support to third parties (€)', 'D.2. Internally invoiced goods & services (€)',
      'E. Indirect costs (€)', 'Total costs (€)',
      'Max. eligible funding rate (%)', 'Max. EU contribution (€)',
      'Requested funding rate (%)', 'Requested budget (€)',
      'Share of total budget (%)', 'Share of requested budget (%)',
      'Share of requested budget, excl. FSTP (%)',
    ];
    const summaryAoa: any[][] = [summaryHeaders];
    const summaryTotalRowNum = partCount + 2;

    rows.forEach((row, rIdx) => {
      const r = rIdx + 2;
      const effortPIdx = cachedParticipants.findIndex(p => p.id === row.participantId);
      const effortRow = effortPIdx >= 0 ? effortPIdx + 2 : -1;

      // C: Total PMs linked to Staff Effort total column (shifted: now col C)
      const totalPMsVal = effortRow > 0
        ? { f: `='Staff Effort'!${effortTotalCol}${effortRow}` }
        : row.totalPersonMonths;

      // D: Personnel costs = ROUND(B*C, 0)
      const personnelFormula = row.pmRate != null && row.pmRate > 0
        ? { f: `=ROUND(B${r}*C${r},0)` }
        : row.personnelCosts;

      const subcontracting = row.subcontractingCosts;
      const travel = row.purchaseTravel;
      const equipment = row.purchaseEquipment;
      const otherGoods = row.purchaseOtherGoods;
      const fstp = row.financialSupportThirdParties;
      const internally = row.internallyInvoiced;

      // K: Indirect costs = ROUND((D+F+G+H+J)*0.25, 2) [excl sub E and fstp I]
      const indirectFormula = row.indirectCostsOverride != null
        ? row.indirectCostsOverride
        : { f: `=ROUND((D${r}+F${r}+G${r}+H${r}+J${r})*0.25,2)` };

      // L: Total costs = D+E+F+G+H+I+J+K
      const totalCostsFormula = { f: `=D${r}+E${r}+F${r}+G${r}+H${r}+I${r}+J${r}+K${r}` };

      const computedRow = rows[rIdx];
      // M: Max funding rate as percentage value (e.g., 100 for 100%)
      const fundingRate = computedRow.fundingRate;

      // N: Max EU contribution = ROUND(L*M/100, 2)
      const maxEuFormula = { f: `=ROUND(L${r}*M${r}/100,2)` };

      // O: Requested funding rate
      const hasCustomRequested = computedRow.requestedEuContributionOverride != null || computedRow.hasInKind;
      const requestedRate = hasCustomRequested
        ? { f: `=IF(L${r}>0,P${r}/L${r}*100,0)` }
        : fundingRate;

      // P: Requested budget
      // Use the same value the UI computes (handles both override and in-kind cases)
      const requestedBudget = hasCustomRequested
        ? computedRow.requestedEuContribution
        : { f: `=N${r}` };

      // Q: Share of total budget = L / L$total * 100
      const shareTotal = { f: `=IF(L$${summaryTotalRowNum}>0,L${r}/L$${summaryTotalRowNum}*100,0)` };

      // R: Share of requested budget = P / P$total * 100
      const shareRequested = { f: `=IF(P$${summaryTotalRowNum}>0,P${r}/P$${summaryTotalRowNum}*100,0)` };

      // S: Share of requested budget excl FSTP = (P-I) / (P$total-I$total) * 100
      const shareRequestedExclFstp = { f: `=IF((P$${summaryTotalRowNum}-I$${summaryTotalRowNum})>0,(P${r}-I${r})/(P$${summaryTotalRowNum}-I$${summaryTotalRowNum})*100,0)` };

      summaryAoa.push([
        `${row.participantNumber}. ${row.participantShortName || row.participantName}`,
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
        shareRequestedExclFstp,
      ]);
    });

    // Total row
    const sumCols = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const totalRow: any[] = ['Total', ''];
    sumCols.forEach(cl => {
      totalRow.push({ f: `=SUM(${cl}2:${cl}${summaryTotalRowNum - 1})` });
    });
    // M: funding rate - blank for total
    totalRow.push('');
    // N: Max EU contribution sum
    totalRow.push({ f: `=SUM(N2:N${summaryTotalRowNum - 1})` });
    // O: Requested rate - blank
    totalRow.push('');
    // P: Requested budget sum
    totalRow.push({ f: `=SUM(P2:P${summaryTotalRowNum - 1})` });
    // Q, R, S: 100
    totalRow.push(100);
    totalRow.push(100);
    totalRow.push(100);
    summaryAoa.push(totalRow);

    const ws2 = XLSX.utils.aoa_to_sheet(summaryAoa);
    const summaryColCount = summaryHeaders.length;

    // Bold headers
    styleHeaders(ws2, 1, summaryColCount);
    // Bold participant names (col A) and total row
    for (let r = 2; r <= partCount + 1; r++) {
      const ref = `A${r}`;
      if (ws2[ref]) ws2[ref].s = bold;
    }
    styleRow(ws2, summaryTotalRowNum, summaryColCount, bold);

    // Apply number formats
    // Currency columns: B(PM rate), D-K(cost cats), L(total), N(max EU), P(requested budget)
    const currCols = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15]; // 0-indexed
    // Percentage columns: M(12), O(14), Q(16), R(17), S(18)
    const pctCols = [12, 14, 16, 17, 18];
    // PM column: C(2)
    const pmCols = [2];

    for (let r = 2; r <= summaryTotalRowNum; r++) {
      currCols.forEach(c => {
        const ref = colLetter(c) + r;
        if (ws2[ref]) ws2[ref].s = { ...ws2[ref].s, numFmt: '#,##0.00' };
      });
      pctCols.forEach(c => {
        const ref = colLetter(c) + r;
        if (ws2[ref]) ws2[ref].s = { ...ws2[ref].s, numFmt: '0.0' };
      });
      pmCols.forEach(c => {
        const ref = colLetter(c) + r;
        if (ws2[ref]) ws2[ref].s = { ...ws2[ref].s, numFmt: '0.0' };
      });
    }

    // Bold Total costs column (L=11) and Requested budget column (P=15)
    styleCol(ws2, 11, 1, summaryTotalRowNum);
    styleCol(ws2, 15, 1, summaryTotalRowNum);
    // Auto-fit columns
    autoFitCols(ws2, summaryAoa);

    // Add cost justification comments to cells with values > 0
    // Column mapping: E=subcontracting(4), F=travel(5), G=equipment(6), H=other goods(7)
    rows.forEach((row, rIdx) => {
      const excelRow = rIdx + 2;
      const addComment = (colIdx: number, text: string) => {
        if (!text || !text.trim()) return;
        const ref = colLetter(colIdx) + excelRow;
        if (!ws2[ref]) return;
        ws2[ref].c = [{ a: 'Sitra', t: text.trim() }];
        ws2[ref].c.hidden = true;
      };

      const concatJustifications = (cat: 'subcontracting' | 'travel' | 'equipment' | 'other_goods') =>
        justificationItems
          .filter(i => i.budgetRowId === row.id && i.category === cat)
          .map(i => i.justification?.trim())
          .filter((s): s is string => !!s)
          .join('\n');

      // B. Subcontracting (col E = index 4)
      if (row.subcontractingCosts > 0) {
        addComment(4, concatJustifications('subcontracting'));
      }

      // C.1 Travel (col F = index 5)
      if (row.purchaseTravel > 0) {
        addComment(5, concatJustifications('travel'));
      }

      // C.2 Equipment (col G = index 6)
      if (row.purchaseEquipment > 0) {
        addComment(6, concatJustifications('equipment'));
      }

      // C.3 Other goods (col H = index 7)
      if (row.purchaseOtherGoods > 0) {
        addComment(7, concatJustifications('other_goods'));
      }
    });

    XLSX.utils.book_append_sheet(wb, ws2, 'Summary by Participant');

    // ─── Sheet 3: Budget Overview ───
    const sTotal = summaryTotalRowNum;

    // Map COST_CATEGORIES to new Summary columns (shifted by removing No. column)
    const catToSummaryCol: Record<string, string> = {
      personnelCosts: 'D',
      subcontractingCosts: 'E',
      purchaseTravel: 'F',
      purchaseEquipment: 'G',
      purchaseOtherGoods: 'H',
      financialSupportThirdParties: 'I',
      internallyInvoiced: 'J',
      indirectCosts: 'K',
    };

    const overviewAoa: any[][] = [['Category', 'Total budget (€)', 'Share of total budget (%)', 'Requested costs (€)', 'Share of requested budget (%)']];

    let overviewRowIdx = 2;
    const totalCostsRowTarget = 2 + COST_CATEGORIES.length; // row where "Total costs" will be

    for (const cat of COST_CATEGORIES) {
      const isGroup = 'isGroupHeader' in cat && cat.isGroupHeader;
      let amountCell: any;

      if (isGroup) {
        if (cat.code === 'C.') {
          amountCell = { f: `='Summary by Participant'!F${sTotal}+'Summary by Participant'!G${sTotal}+'Summary by Participant'!H${sTotal}` };
        } else if (cat.code === 'D.') {
          amountCell = { f: `='Summary by Participant'!I${sTotal}+'Summary by Participant'!J${sTotal}` };
        }
      } else if (cat.key && catToSummaryCol[cat.key]) {
        amountCell = { f: `='Summary by Participant'!${catToSummaryCol[cat.key]}${sTotal}` };
      } else {
        amountCell = 0;
      }

      const pctFormula = { f: `=IF(B$${totalCostsRowTarget}>0,B${overviewRowIdx}/B$${totalCostsRowTarget}*100,0)` };

      // Requested costs: sum per-participant category cost × (requested / total) for that participant
      const sFirstData = 2;
      const sLastData = sTotal - 1;
      const S = `'Summary by Participant'`;
      let requestedFormula: any;
      if (isGroup) {
        // Will be filled after subcategory rows are placed — use placeholder sum
        requestedFormula = 0; // will be overwritten below
      } else if (cat.key && catToSummaryCol[cat.key]) {
        const col = catToSummaryCol[cat.key];
        requestedFormula = { f: `=SUMPRODUCT(IFERROR(${S}!${col}${sFirstData}:${col}${sLastData}*${S}!P${sFirstData}:P${sLastData}/${S}!L${sFirstData}:L${sLastData},0))` };
      } else {
        requestedFormula = 0;
      }

      const requestedPctFormula = { f: `=IF(D$${totalCostsRowTarget}>0,D${overviewRowIdx}/D$${totalCostsRowTarget}*100,0)` };

      overviewAoa.push([`${cat.code} ${cat.name}`, amountCell, pctFormula, requestedFormula, requestedPctFormula]);
      overviewRowIdx++;
    }

    // Fix group header requested costs: sum their subcategory rows
    // C. is at row index 2 (0-based in overviewAoa = index 3 with header), subcats C.1, C.2, C.3 follow
    // D. similarly
    for (let i = 1; i < overviewAoa.length; i++) {
      const label = String(overviewAoa[i][0]);
      if (label.startsWith('C. ')) {
        // C.1, C.2, C.3 are at rows i+1, i+2, i+3 (1-based Excel = i+1, i+2, i+3)
        const excelRow = i + 1; // header is row 1
        overviewAoa[i][3] = { f: `=D${excelRow + 1}+D${excelRow + 2}+D${excelRow + 3}` };
      } else if (label.startsWith('D. ')) {
        const excelRow = i + 1;
        overviewAoa[i][3] = { f: `=D${excelRow + 1}+D${excelRow + 2}` };
      }
    }

    const totalCostsRowNum = overviewRowIdx;
    overviewAoa.push([
      'Total costs',
      { f: `='Summary by Participant'!L${sTotal}` },
      100,
      { f: `='Summary by Participant'!P${sTotal}` },
      100,
    ]);

    overviewAoa.push([
      'In-kind contributions',
      { f: `=B${totalCostsRowNum}-D${totalCostsRowNum}` },
      { f: `=IF(B${totalCostsRowNum}>0,B${totalCostsRowNum + 1}/B${totalCostsRowNum}*100,0)` },
      '',
      '',
    ]);

    const ws3 = XLSX.utils.aoa_to_sheet(overviewAoa);
    const overviewColCount = 5;

    // Bold headers
    styleHeaders(ws3, 1, overviewColCount);
    // Bold category names (col A) and total/summary rows
    for (let r = 2; r < overviewAoa.length + 1; r++) {
      const ref = `A${r}`;
      if (ws3[ref]) ws3[ref].s = bold;
    }
    // Bold total and summary rows
    for (let r = totalCostsRowNum; r <= totalCostsRowNum + 1; r++) {
      styleRow(ws3, r, overviewColCount, bold);
    }

    // Currency format for columns B, D; percentage format for columns C, E
    for (let r = 2; r < overviewAoa.length + 1; r++) {
      const bRef = `B${r}`;
      if (ws3[bRef]) ws3[bRef].s = { ...ws3[bRef].s, numFmt: '#,##0.00' };
      const cRef = `C${r}`;
      if (ws3[cRef]) ws3[cRef].s = { ...ws3[cRef].s, numFmt: '0.0' };
      const dRef = `D${r}`;
      if (ws3[dRef]) ws3[dRef].s = { ...ws3[dRef].s, numFmt: '#,##0.00' };
      const eRef = `E${r}`;
      if (ws3[eRef]) ws3[eRef].s = { ...ws3[eRef].s, numFmt: '0.0' };
    }

    // Bold Total budget column (B=1) and Requested costs column (D=3)
    const overviewLastRow = overviewAoa.length;
    styleCol(ws3, 1, 1, overviewLastRow);
    styleCol(ws3, 3, 1, overviewLastRow);
    // Auto-fit columns
    autoFitCols(ws3, overviewAoa);

    XLSX.utils.book_append_sheet(wb, ws3, 'Budget Overview');

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const acronym = proposalAcronym || 'Budget';

    // Post-process xlsx to resize comment note boxes via VML anchors
    const xlsxData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    try {
      const zip = await JSZip.loadAsync(xlsxData);
      const vmlFiles = Object.keys(zip.files).filter(f => f.match(/xl\/drawings\/vmlDrawing\d+\.vml/));
      for (const vmlPath of vmlFiles) {
        let vml = await zip.file(vmlPath)!.async('string');
        // Expand each note anchor: increase the bottom-right row & col offsets
        vml = vml.replace(/<x:Anchor>([^<]+)<\/x:Anchor>/g, (_match, anchor: string) => {
          const parts = anchor.split(',').map((s: string) => s.trim());
          if (parts.length === 8) {
            // parts: [col1, dx1, row1, dy1, col2, dx2, row2, dy2]
            const col1 = parseInt(parts[0]);
            const row1 = parseInt(parts[2]);
            // Make note box span ~5 cols wide and ~12 rows tall
            parts[4] = String(col1 + 2);
            parts[6] = String(row1 + 12);
            return `<x:Anchor>${parts.join(', ')}</x:Anchor>`;
          }
          return _match;
        });
        zip.file(vmlPath, vml);
      }
      const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${timestamp} ${acronym} Budget.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      // Fallback: save without resizing
      XLSX.writeFile(wb, `${timestamp} ${acronym} Budget.xlsx`);
    }
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
    <PartAPageLayout
      title="Part A3: Budget"
      maxWidth="max-w-full"
      guidelines={
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
      }
      saveIndicator={activeTab !== 'validation' ? <SaveIndicator saving={saving} lastSaved={null} onSaveNow={refetchBudgetRows} /> : undefined}
    >


        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="budget">Budget dashboard</TabsTrigger>
              {usesFstp && <TabsTrigger value="fstp">Financial support to third parties (FSTP)</TabsTrigger>}
              
            </TabsList>
            {activeTab !== 'fstp' && (
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
            )}
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
                    <table className="text-xs border-collapse w-full">
                      <colgroup>
                        <col style={{ width: `${1.2 / 5.2 * 100}%` }} />
                        <col style={{ width: `${1 / 5.2 * 100}%` }} />
                        <col style={{ width: `${1 / 5.2 * 100}%` }} />
                        <col style={{ width: `${1 / 5.2 * 100}%` }} />
                        <col style={{ width: `${1 / 5.2 * 100}%` }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b">
                          <th className="px-2 py-1.5 text-left border-r font-bold">Category</th>
                          <th className="px-2 py-1.5 text-left border-r font-bold">Total budget (€)</th>
                          <th className="px-2 py-1.5 text-left border-r font-bold">Share of total budget (%)</th>
                          <th className="px-2 py-1.5 text-left border-r font-bold">Requested costs (€)</th>
                          <th className="px-2 py-1.5 text-left border-r font-bold">Share of requested budget (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {COST_CATEGORIES.map((cat) => {
                          const isGroup = 'isGroupHeader' in cat && cat.isGroupHeader;
                          const amount = cat.key ? (categoryTotals[cat.key] || 0) : 0;
                          const isMajorStandalone = 'isMajor' in cat && cat.isMajor && !isGroup;

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

                          // Requested costs per category: sum of per-participant category cost × their requested ratio
                          let requestedAmount = 0;
                          if (cat.key) {
                            requestedAmount = categoryRequestedTotals[cat.key] || 0;
                          } else if (isGroup) {
                            const prefix = cat.code.replace('.', '');
                            requestedAmount = COST_CATEGORIES
                              .filter(c => !('isGroupHeader' in c) && !('isMajor' in c && c.isMajor) && c.key && c.code.startsWith(prefix))
                              .reduce((sum, c) => sum + (categoryRequestedTotals[c.key!] || 0), 0);
                          }
                          const requestedPct = grandTotals.requestedEuContribution > 0 && (cat.key || isGroup)
                            ? ((requestedAmount / grandTotals.requestedEuContribution) * 100).toFixed(1)
                            : '';

                          const isBold = isMajorStandalone || isGroup;

                          return (
                            <tr key={cat.code} className={cn('border-t', (isGroup || isMajorStandalone) && 'bg-muted/30')}>
                              <td className="px-2 py-1 text-left border-r">
                                <span className={cn(('isMajor' in cat && cat.isMajor) ? 'font-bold' : 'pl-4')}>
                                  {cat.code} {cat.name}
                                </span>
                              </td>
                              <td className={cn("px-2 py-1 text-right border-r tabular-nums font-mono whitespace-nowrap", isBold && 'font-bold')}>
                                {formatNumber(displayAmount, 2)}
                              </td>
                              <td className={cn("px-2 py-1 text-right border-r whitespace-nowrap", isBold && 'font-bold')}>
                                {percentage || ''}
                              </td>
                              <td className={cn("px-2 py-1 text-right border-r tabular-nums font-mono whitespace-nowrap", isBold && 'font-bold')}>
                                {(cat.key || isGroup) ? formatNumber(requestedAmount, 2) : ''}
                              </td>
                              <td className={cn("px-2 py-1 text-right border-r whitespace-nowrap", isBold && 'font-bold')}>
                                {requestedPct || ''}
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
                          <td className="px-2 py-1 text-right border-r font-bold">100.0</td>
                          <td className="px-2 py-1 text-right border-r tabular-nums font-mono font-bold whitespace-nowrap">
                            {formatNumber(grandTotals.requestedEuContribution, 2)}
                          </td>
                          <td className="px-2 py-1 text-right border-r font-bold">100.0</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-2 py-1 border-r">In-kind contributions</td>
                          <td className="px-2 py-1 text-right border-r tabular-nums font-mono whitespace-nowrap">
                            {formatNumber(grandTotals.totalEligibleCosts - grandTotals.requestedEuContribution, 2)}
                          </td>
                          <td className="px-2 py-1 text-right border-r">
                            {grandTotals.totalEligibleCosts > 0
                              ? (((grandTotals.totalEligibleCosts - grandTotals.requestedEuContribution) / grandTotals.totalEligibleCosts) * 100).toFixed(1)
                              : '0.0'}
                          </td>
                          <td className="px-2 py-1 text-right border-r" />
                          <td className="px-2 py-1 text-right border-r" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <A3EffortMatrix proposalId={proposalId} canEdit={canEdit} isCoordinator={isAdmin} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary by participant</CardTitle>
                <CardDescription className="flex flex-col">
                  <span>Justifications for subcontracting costs are mirrored to Tables 3.1.g.</span>
                  <span>Justifications for equipment purchase costs exceeding 15% of the same participant's personnel costs are mirrored to Table 3.1.h.</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                    <table className="text-xs border-collapse w-full">
                      <thead>
                        {/* Major category header row */}
                        <tr className="border-b">
                          <th rowSpan={2} className="sticky left-0 bg-background z-10 px-2 py-1.5 text-left border-r font-bold whitespace-nowrap align-middle">
                            <div className="flex items-center justify-between gap-1">
                              <span>Participant</span>
                              {isAdmin && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => {
                                        const allLocked = rows.every(r => r.isLocked);
                                        if (allLocked) {
                                          unlockAllRows();
                                        } else {
                                          lockAllRows();
                                        }
                                      }}
                                     aria-label="Lock" title="Lock">
                                      {rows.every(r => r.isLocked)
                                        ? <Lock className="w-3.5 h-3.5 text-destructive" />
                                        : <Unlock className="w-3.5 h-3.5 text-green-600" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {rows.every(r => r.isLocked) ? 'Unlock all participant budgets' : 'Lock all participant budgets'}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '50px' }}>PM rate<br/>(€)</th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '50px' }}>Total<br/>PMs</th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">A.</div><div className="leading-tight">Personnel costs (€)</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">B.</div><div className="leading-tight">Subcontracting costs (€)</div></th>
                          <th colSpan={3} className="px-2 py-1.5 text-left border-r font-bold border-b" style={{ minWidth: '60px' }}>C. Purchase costs (€)</th>
                          <th colSpan={2} className="px-2 py-1.5 text-left border-r font-bold border-b" style={{ minWidth: '60px' }}>D. Other cost categories (€)</th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">E.</div><div className="leading-tight">Indirect costs (€)</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">Total costs (€)</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">Max. eligible</div><div className="leading-tight">funding rate</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">Max. EU</div><div className="leading-tight">contribution (€)</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">Requested</div><div className="leading-tight">funding rate (%)</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}><div className="leading-tight">Requested</div><div className="leading-tight">budget (€)</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}>Share of<br/>total budget<br/>(%)</th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}>Share of<br/>requested<br/>budget (%)</th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-middle" style={{ minWidth: '60px' }}>Share of<br/>requested budget,<br/>excl. FSTP (%)</th>
                        </tr>
                        <tr className="border-b">
                          <th className="px-2 py-1.5 text-left border-r font-bold" style={{ minWidth: '60px' }}><div className="leading-tight">C.1.</div><div className="leading-tight">Travel & subsistence</div></th>
                          <th className="px-2 py-1.5 text-left border-r font-bold" style={{ minWidth: '60px' }}><div className="leading-tight">C.2.</div><div className="leading-tight">Equipment</div></th>
                          <th className="px-2 py-1.5 text-left border-r font-bold" style={{ minWidth: '60px' }}><div className="leading-tight">C.3.</div><div className="leading-tight">Other goods</div></th>
                          <th className="px-2 py-1.5 text-left border-r font-bold" style={{ minWidth: '60px' }}><div className="leading-tight">D.1.</div><div className="leading-tight">Financial support to third parties</div></th>
                          <th className="px-2 py-1.5 text-left border-r font-bold" style={{ minWidth: '60px' }}><div className="leading-tight">D.2.</div><div className="leading-tight">Internally invoiced goods & services</div></th>
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
                                  <span className="flex items-center gap-1">
                                    <ParticipantBubble
                                      style={{ fontSize: '10px', height: 'auto', padding: '2px 6px' }}
                                    >
                                      {row.participantNumber}. {row.participantShortName || row.participantName}
                                    </ParticipantBubble>
                                    {row.isLocked && !isAdmin && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                                  </span>
                                  <span className="flex items-center gap-1 shrink-0">
                                    {isAdmin && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => row.isLocked ? unlockRow(row.id) : lockRow(row.id)}
                                       aria-label="Lock" title="Lock">
                                        {row.isLocked ? <Lock className="w-3 h-3 text-destructive" /> : <Unlock className="w-3 h-3 text-green-600" />}
                                      </Button>
                                    )}
                                    {canEdit && (!row.isLocked || isAdmin) && (
                                      <Button
                                        size="sm"
                                        className="h-5 px-2 text-[10px] font-semibold whitespace-nowrap"
                                        onClick={() => {
                                          if (row.isLocked && isAdmin) {
                                            setLockedEditWarning({ participantId: row.participantId });
                                          } else {
                                            setEditingParticipantId(row.participantId);
                                          }
                                        }}
                                      >
                                        Edit
                                      </Button>
                                    )}
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-1 text-right border-r tabular-nums font-mono whitespace-nowrap">
                                {row.pmRate != null ? formatNumber(row.pmRate, 2) : '—'}
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
                                    : formatNumber((row as any)[c.key] as number, 2)}
                                </td>
                              ))}
                              <td className="px-2 py-1 text-right border-r whitespace-nowrap">{percentage}%</td>
                              <td className="px-2 py-1 text-right border-r whitespace-nowrap">{requestPercentage}%</td>
                              <td className="px-2 py-1 text-right border-r whitespace-nowrap">
                                {(() => {
                                  const totalRequestedExclFstp = grandTotals.requestedEuContribution - (grandTotals.financialSupportThirdParties || 0);
                                  const rowRequestedExclFstp = row.requestedEuContribution - (row.financialSupportThirdParties || 0);
                                  return totalRequestedExclFstp > 0
                                    ? ((rowRequestedExclFstp / totalRequestedExclFstp) * 100).toFixed(1)
                                    : '0';
                                })()}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-foreground/20 bg-muted/40 font-semibold">
                          <td className="sticky left-0 bg-muted z-10 px-2 py-1 border-r font-bold">Total</td>
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
                                : formatNumber((grandTotals as any)[c.key] || 0, 2)}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-right border-r font-bold">100%</td>
                          <td className="px-2 py-1 text-right border-r font-bold">100%</td>
                          <td className="px-2 py-1 text-right border-r font-bold">100%</td>
                        </tr>
                      </tfoot>
                    </table>
                </div>
              </CardContent>
            </Card>

            <B31OptionalJustificationsCard proposalId={proposalId} canEdit={isAdmin} />
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

      {/* Coordinator warning when editing a locked row */}
      <AlertDialog open={!!lockedEditWarning} onOpenChange={(open) => { if (!open) setLockedEditWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This budget is locked</AlertDialogTitle>
            <AlertDialogDescription>
              This participant's budget has been locked. Editing may cause discrepancies with the agreed figures. Do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (lockedEditWarning) {
                setEditingParticipantId(lockedEditWarning.participantId);
              }
              setLockedEditWarning(null);
            }}>
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PartAPageLayout>

  );
}
