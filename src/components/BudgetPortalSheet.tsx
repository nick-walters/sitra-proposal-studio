import { useBudgetRows } from '@/hooks/useBudgetRows';
import { useProposalRole } from '@/hooks/useProposalRole';
import { formatCurrency } from '@/lib/formatNumber';
import { BudgetValidationEngine } from '@/components/BudgetValidationEngine';
import { SaveIndicator } from '@/components/SaveIndicator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
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

  const { roleTier } = useProposalRole(proposalId);
  const isAdmin = roleTier === 'coordinator';
  const [activeTab, setActiveTab] = useState('overview');
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

  const handleExportCSV = () => {
    const headers = ['No.', 'Participant', 'Country', ...PARTICIPANT_COLUMNS.map(c => `${c.code} ${c.name}`.trim())];
    const csvRows = rows.map(row => [
      row.participantNumber,
      row.participantShortName || row.participantName,
      row.country || '',
      ...PARTICIPANT_COLUMNS.map(c => (row as any)[c.key] || 0),
    ]);
    const totalRow = ['', 'TOTAL', '', ...PARTICIPANT_COLUMNS.map(c => (grandTotals as any)[c.key] || 0)];
    const csv = [headers, ...csvRows, totalRow].map(r => r.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget_${proposalId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Budget exported to CSV');
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
      <div className={cn("mx-auto space-y-6", activeTab === 'summary' ? 'max-w-full' : 'max-w-7xl')}>
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
          <div className="flex items-center gap-3">
            <Badge variant={proposalType === 'lump_sum' ? 'default' : 'secondary'}>
              {proposalType === 'lump_sum' ? 'Lump sum' : 'Actual costs'}
            </Badge>
            <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="summary">Summary by participant</TabsTrigger>
            {usesFstp && <TabsTrigger value="fstp">Financial support to third parties (FSTP)</TabsTrigger>}
            {isAdmin && <TabsTrigger value="validation">Validation</TabsTrigger>}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Budget overview by category</CardTitle>
              </CardHeader>
              <CardContent>
                <Table className="w-auto">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left font-bold">Category</TableHead>
                      <TableHead className="text-left font-bold">Amount (€)</TableHead>
                      <TableHead className="text-left font-bold">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {COST_CATEGORIES.map((cat) => {
                      const isGroup = 'isGroupHeader' in cat && cat.isGroupHeader;
                      const amount = cat.key ? (categoryTotals[cat.key] || 0) : 0;
                      const percentage = grandTotals.totalEligibleCosts > 0 && cat.key
                        ? ((amount / grandTotals.totalEligibleCosts) * 100).toFixed(1)
                        : '';

                      return (
                        <TableRow key={cat.code} className={isGroup ? 'bg-muted/30' : ''}>
                          <TableCell className="px-2 py-1 text-left">
                            <span className={cn('isMajor' in cat && cat.isMajor ? 'font-bold' : 'pl-4')}>
                              {cat.code} {cat.name}
                            </span>
                          </TableCell>
                          <TableCell className="text-left font-mono px-2 py-1">
                            {isGroup ? '' : formatCurrency(amount)}
                          </TableCell>
                          <TableCell className="text-left px-2 py-1">{percentage ? `${percentage}%` : ''}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-bold px-2 py-1">Total costs</TableCell>
                      <TableCell className="text-left font-bold font-mono px-2 py-1">
                        {formatCurrency(grandTotals.totalEligibleCosts)}
                      </TableCell>
                      <TableCell className="text-left font-bold px-2 py-1">100%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-bold px-2 py-1">Requested EU contribution</TableCell>
                      <TableCell className="text-left font-bold font-mono px-2 py-1">
                        {formatCurrency(grandTotals.requestedEuContribution)}
                      </TableCell>
                      <TableCell className="text-left font-bold px-2 py-1">
                        {grandTotals.totalEligibleCosts > 0
                          ? ((grandTotals.requestedEuContribution / grandTotals.totalEligibleCosts) * 100).toFixed(1)
                          : '0'}%
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-bold px-2 py-1">In-kind contributions</TableCell>
                      <TableCell className="text-left font-bold font-mono px-2 py-1">
                        {formatCurrency(grandTotals.totalEligibleCosts - grandTotals.requestedEuContribution)}
                      </TableCell>
                      <TableCell className="text-left font-bold px-2 py-1">
                        {grandTotals.totalEligibleCosts > 0
                          ? (((grandTotals.totalEligibleCosts - grandTotals.requestedEuContribution) / grandTotals.totalEligibleCosts) * 100).toFixed(1)
                          : '0'}%
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
            <A3EffortMatrix proposalId={proposalId} canEdit={canEdit} />
          </TabsContent>

          {/* Summary by Participant Tab */}
          <TabsContent value="summary" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Summary by participant</CardTitle>
                <CardDescription>
                  Overview of budget allocation across consortium partners
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                    <table className="text-xs border-collapse w-full">
                      <thead>
                        {/* Major category header row */}
                        <tr className="border-b">
                          <th rowSpan={2} className="sticky left-0 bg-background z-10 px-2 py-1.5 text-left border-r font-bold whitespace-nowrap align-bottom">Participant</th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '50px' }}>PM<br/>rate</th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '50px' }}>Total<br/>PMs</th>
                          {/* A. Personnel costs - standalone */}
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '60px' }}><div className="leading-tight">A.</div><div className="leading-tight">Personnel costs</div></th>
                          {/* B. Subcontracting costs - standalone */}
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '60px' }}><div className="leading-tight">B.</div><div className="leading-tight">Subcontracting costs</div></th>
                          {/* C. Purchase costs - spans 3 */}
                          <th colSpan={3} className="px-2 py-1.5 text-left border-r font-bold border-b" style={{ minWidth: '60px' }}>C. Purchase costs</th>
                          {/* D. Other cost categories - spans 2 */}
                          <th colSpan={2} className="px-2 py-1.5 text-left border-r font-bold border-b" style={{ minWidth: '60px' }}>D. Other cost categories</th>
                          {/* E. Indirect costs - standalone */}
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '60px' }}><div className="leading-tight">E.</div><div className="leading-tight">Indirect costs</div></th>
                          {/* Remaining columns - standalone */}
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '60px' }}><div className="leading-tight">Total costs</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '60px' }}><div className="leading-tight">Max. eligible</div><div className="leading-tight">funding rate</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '60px' }}><div className="leading-tight">Max EU</div><div className="leading-tight">contribution</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '60px' }}><div className="leading-tight">Requested</div><div className="leading-tight">funding rate (%)</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '60px' }}><div className="leading-tight">Requested</div><div className="leading-tight">budget</div></th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '60px' }}>Share of<br/>total budget<br/>(%)</th>
                          <th rowSpan={2} className="px-2 py-1.5 text-left border-r font-bold align-bottom" style={{ minWidth: '60px' }}>Share of<br/>requested<br/>budget (%)</th>
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

          {isAdmin && (
            <TabsContent value="validation">
              <BudgetValidationEngine proposalId={proposalId} />
            </TabsContent>
          )}
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
