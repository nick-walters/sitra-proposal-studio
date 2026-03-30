import { useBudgetRows } from '@/hooks/useBudgetRows';
import { useProposalRole } from '@/hooks/useProposalRole';
import { formatCurrency } from '@/lib/formatNumber';
import { BudgetValidationEngine } from '@/components/BudgetValidationEngine';
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
import { Lock, Unlock, Loader2, Euro, Calculator, FileSpreadsheet, Download, History, TableProperties, AlertCircle, Info } from 'lucide-react';
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
  { key: 'personnelCosts', label: 'A. Personnel costs', description: 'Costs of employees and natural persons working under a direct contract' },
  { key: 'subcontractingCosts', label: 'B. Subcontracting', description: 'Costs of subcontracting core tasks' },
  { key: 'purchaseTravel', label: 'C.1 Travel and subsistence', description: 'Travel costs and related subsistence allowances' },
  { key: 'purchaseEquipment', label: 'C.2 Equipment', description: 'Depreciation costs for equipment, infrastructure, or other assets' },
  { key: 'purchaseOtherGoods', label: 'C.3 Other goods, works and services', description: 'Other purchases directly linked to the action' },
  { key: 'internallyInvoiced', label: 'D. Internally invoiced goods and services', description: 'Unit costs for internally invoiced goods and services' },
  { key: 'indirectCosts', label: 'E. Indirect costs', description: '25% flat rate on eligible direct costs (excluding subcontracting and internally invoiced)', isIndirect: true },
] as const;

const PARTICIPANT_COLUMNS = [
  { key: 'personnelCosts', label: 'A. Personnel' },
  { key: 'subcontractingCosts', label: 'B. Subcontracting' },
  { key: 'purchaseTravel', label: 'C.1 Travel' },
  { key: 'purchaseEquipment', label: 'C.2 Equipment' },
  { key: 'purchaseOtherGoods', label: 'C.3 Other goods' },
  { key: 'internallyInvoiced', label: 'D. Internally inv.' },
  { key: 'indirectCosts', label: 'E. Indirect costs' },
  { key: 'totalEligibleCosts', label: 'Total eligible' },
  { key: 'requestedEuContribution', label: 'EU contribution' },
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
  } = useBudgetRows(proposalId, proposalType);

  const { roleTier } = useProposalRole(proposalId);
  const isAdmin = roleTier === 'coordinator';
  const [activeTab, setActiveTab] = useState('overview');

  const categoryTotals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const cat of COST_CATEGORIES) {
      result[cat.key] = (grandTotals as any)[cat.key] || 0;
    }
    return result;
  }, [grandTotals]);

  const handleExportCSV = () => {
    const headers = ['No.', 'Participant', 'Country', ...PARTICIPANT_COLUMNS.map(c => c.label)];
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
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">Part A3: Budget</h1>
            {saving && (
              <Badge variant="secondary" className="animate-pulse">
                Saving...
              </Badge>
            )}
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
            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Euro className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Eligible Costs</p>
                      <p className="text-xl font-bold">{formatCurrency(grandTotals.totalEligibleCosts)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Indirect Costs (25%)</p>
                      <p className="text-xl font-bold">{formatCurrency(grandTotals.indirectCosts)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Calculator className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">EU Contribution</p>
                      <p className="text-xl font-bold">{formatCurrency(grandTotals.requestedEuContribution)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Euro className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Estimated Income</p>
                      <p className="text-xl font-bold">{formatCurrency(grandTotals.totalEstimatedIncome)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Budget Type Indicator */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {proposalType === 'lump_sum' ? 'Lump Sum Budget Model' : 'Actual Costs Budget Model'}
                  </CardTitle>
                  <Badge variant={proposalType === 'lump_sum' ? 'secondary' : 'default'}>
                    {proposalType === 'lump_sum' ? 'Fixed lump sums' : 'Actual costs'}
                  </Badge>
                </div>
                <CardDescription>
                  {proposalType === 'lump_sum'
                    ? 'Budget is allocated by work package with fixed amounts agreed at grant signature'
                    : 'Costs are reported based on actual eligible costs with 25% indirect cost flat rate'}
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Budget Overview by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[350px]">Category</TableHead>
                      <TableHead className="text-right">Amount (€)</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {COST_CATEGORIES.map((cat) => {
                      const amount = categoryTotals[cat.key] || 0;
                      const percentage = grandTotals.totalEligibleCosts > 0
                        ? ((amount / grandTotals.totalEligibleCosts) * 100).toFixed(1)
                        : '0';

                      return (
                        <TableRow key={cat.key}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{cat.label}</span>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Info className="w-4 h-4 text-muted-foreground" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    {cat.description}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(amount)}
                          </TableCell>
                          <TableCell className="text-right">{percentage}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-bold">Total Eligible Costs</TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {formatCurrency(grandTotals.totalEligibleCosts)}
                      </TableCell>
                      <TableCell className="text-right font-bold">100%</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Summary by Participant Tab */}
          <TabsContent value="summary" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Summary by Participant</CardTitle>
                <CardDescription>
                  Overview of budget allocation across consortium partners
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex">
                  <div className="relative flex-1 min-w-0 overflow-auto">
                    <table className="text-sm border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="sticky left-0 bg-background z-10 px-3 py-3 text-left border-r font-bold whitespace-nowrap">Participant</th>
                          {PARTICIPANT_COLUMNS.map(c => (
                            <th key={c.key} className="px-3 py-3 text-right border-r font-bold whitespace-nowrap">{c.label}</th>
                          ))}
                          <th className="px-3 py-3 text-right border-r font-bold whitespace-nowrap">%</th>
                          {isAdmin && <th className="px-3 py-3 text-center font-bold">Lock</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(row => {
                          const percentage = grandTotals.totalEligibleCosts > 0
                            ? ((row.totalEligibleCosts / grandTotals.totalEligibleCosts) * 100).toFixed(1)
                            : '0';

                          return (
                            <tr key={row.id} className={cn('border-t hover:bg-muted/50', row.isLocked && !isAdmin && 'opacity-60')}>
                              <td className="sticky left-0 bg-background z-10 px-3 py-2 border-r whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <span>{row.participantNumber}. {row.participantShortName || row.participantName}</span>
                                  {row.isLocked && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                                </div>
                              </td>
                              
                              {PARTICIPANT_COLUMNS.map(c => (
                                <td key={c.key} className="px-3 py-2 text-right border-r tabular-nums font-mono text-sm whitespace-nowrap">
                                  {formatCurrency(row[c.key] as number)}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-right border-r whitespace-nowrap">{percentage}%</td>
                              {isAdmin && (
                                <td className="px-3 py-2 text-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => row.isLocked ? unlockRow(row.id) : lockRow(row.id)}
                                  >
                                    {row.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5 text-muted-foreground" />}
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-foreground/20 bg-muted/40 font-semibold">
                          <td className="sticky left-0 bg-muted/40 z-10 px-3 py-2 border-r font-bold">TOTAL</td>
                          
                          {PARTICIPANT_COLUMNS.map(c => (
                            <td key={c.key} className="px-3 py-2 text-right border-r tabular-nums font-mono font-bold whitespace-nowrap">
                              {formatCurrency((grandTotals as any)[c.key] || 0)}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right border-r font-bold">100%</td>
                          {isAdmin && <td />}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {canEdit && onNavigateToParticipantBudget && rows.length > 0 && (
                    <div className="flex-shrink-0 ml-1">
                      {/* Header spacer */}
                      <div className="px-3 py-3 whitespace-nowrap">&nbsp;</div>
                      {/* One button per row */}
                      {rows.map(row => (
                        <div key={row.id} className="px-3 py-2 flex items-center justify-center">
                          <Button
                            size="sm"
                            className="h-auto py-1 px-3 text-xs font-semibold whitespace-nowrap"
                            onClick={() => onNavigateToParticipantBudget(row.participantId)}
                          >
                            Edit
                          </Button>
                        </div>
                      ))}
                      {/* Footer spacer */}
                      <div className="px-3 py-2">&nbsp;</div>
                    </div>
                  )}
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
    </div>
  );
}
