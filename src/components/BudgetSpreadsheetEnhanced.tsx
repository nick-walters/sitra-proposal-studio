import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/formatNumber';
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Participant, BudgetType } from '@/types/proposal';
import { BudgetItem, BudgetChange } from '@/hooks/useBudget';
import { BudgetChangeHistory } from './BudgetChangeHistory';
import { Plus, Trash2, Download, Euro, Calculator, History, Info, FileSpreadsheet, AlertCircle, BookOpen, Loader2, TableProperties } from 'lucide-react';
import { toast } from 'sonner';
import { PartAGuidelinesDialog } from './PartAGuidelinesDialog';
import { appendCostJustificationsToB31 } from '@/lib/b31Population';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';

// Detailed EU cost categories for standard budget
const STANDARD_CATEGORIES = [
  {
    id: 'A',
    label: 'A. Personnel costs',
    description: 'Costs of employees and natural persons working under a direct contract',
    subcategories: [
      { id: 'A.1', label: 'A.1 Employees (or equivalent)', description: 'Costs of employees working on the action' },
      { id: 'A.2', label: 'A.2 Natural persons under direct contract', description: 'Costs of natural persons working under a direct contract' },
      { id: 'A.3', label: 'A.3 Seconded persons', description: 'Costs of persons seconded by a third party against payment' },
      { id: 'A.4', label: 'A.4 SME owners and natural person beneficiaries', description: 'Unit costs for SME owners and natural person beneficiaries' },
    ],
  },
  {
    id: 'B',
    label: 'B. Subcontracting',
    description: 'Costs of subcontracting core tasks',
    subcategories: [],
  },
  {
    id: 'C',
    label: 'C. Purchase costs',
    description: 'Costs of purchasing goods, works, and services',
    subcategories: [
      { id: 'C.1', label: 'C.1 Travel and subsistence', description: 'Travel costs and related subsistence allowances' },
      { id: 'C.2', label: 'C.2 Equipment', description: 'Depreciation costs for equipment, infrastructure, or other assets' },
      { id: 'C.3', label: 'C.3 Other goods, works and services', description: 'Other purchases directly linked to the action' },
    ],
  },
  {
    id: 'D',
    label: 'D. Other cost categories',
    description: 'Costs falling under specific cost categories',
    subcategories: [
      { id: 'D.1', label: 'D.1 Financial support to third parties', description: 'Costs of providing financial support to third parties' },
      { id: 'D.2', label: 'D.2 Internally invoiced goods and services', description: 'Unit costs for internally invoiced goods and services' },
      { id: 'D.3', label: 'D.3 Transnational access to research infrastructures', description: 'Unit costs for transnational and virtual access' },
    ],
  },
  {
    id: 'E',
    label: 'E. Indirect costs',
    description: '25% flat rate on eligible direct costs (A-D, excluding subcontracting)',
    subcategories: [],
    isIndirect: true,
  },
];

// Lump sum categories (work package based)
const LUMP_SUM_CATEGORIES = [
  { id: 'WP1', label: 'Work Package 1', description: 'Project Management' },
  { id: 'WP2', label: 'Work Package 2', description: 'Research & Development' },
  { id: 'WP3', label: 'Work Package 3', description: 'Validation & Testing' },
  { id: 'WP4', label: 'Work Package 4', description: 'Dissemination & Exploitation' },
  { id: 'WP5', label: 'Work Package 5', description: 'Additional Activities' },
  { id: 'WP6', label: 'Work Package 6', description: 'Additional Activities' },
  { id: 'WP7', label: 'Work Package 7', description: 'Additional Activities' },
  { id: 'WP8', label: 'Work Package 8', description: 'Additional Activities' },
];

interface BudgetSpreadsheetEnhancedProps {
  budgetItems: BudgetItem[];
  budgetChanges: BudgetChange[];
  participants: Participant[];
  budgetType: BudgetType;
  totalBudget?: number;
  onAddBudgetItem: (item: Omit<BudgetItem, 'id'>) => void;
  onUpdateBudgetItem: (id: string, updates: Partial<BudgetItem>) => void;
  onDeleteBudgetItem: (id: string) => void;
  onChangeBudgetType: (type: BudgetType) => void;
  canEdit: boolean;
  proposalId: string;
  saving?: boolean;
  isCoordinator?: boolean;
  isFullProposal?: boolean;
}

export function BudgetSpreadsheetEnhanced({
  budgetItems,
  budgetChanges,
  participants,
  budgetType,
  totalBudget,
  onAddBudgetItem,
  onUpdateBudgetItem,
  onDeleteBudgetItem,
  onChangeBudgetType,
  canEdit,
  proposalId,
  saving = false,
  isCoordinator = false,
  isFullProposal = false,
}: BudgetSpreadsheetEnhancedProps) {
  const [selectedParticipant, setSelectedParticipant] = useState<string | 'all'>('all');
  const [showChangeHistory, setShowChangeHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [isCopying, setIsCopying] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const categories = budgetType === 'traditional' ? STANDARD_CATEGORIES : LUMP_SUM_CATEGORIES;

  const filteredItems = useMemo(() => {
    if (selectedParticipant === 'all') return budgetItems;
    return budgetItems.filter((item) => item.participantId === selectedParticipant);
  }, [budgetItems, selectedParticipant]);

  // Calculate totals
  const totals = useMemo(() => {
    const byParticipant: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let directCosts = 0;
    let subcontractingCosts = 0;

    budgetItems.forEach((item) => {
      byParticipant[item.participantId] = (byParticipant[item.participantId] || 0) + item.amount;
      byCategory[item.category] = (byCategory[item.category] || 0) + item.amount;
      
      if (item.category === 'B') {
        subcontractingCosts += item.amount;
      } else if (item.category !== 'E') {
        directCosts += item.amount;
      }
    });

    // Calculate indirect costs (25% of direct costs excluding subcontracting)
    const indirectCostsBase = directCosts - subcontractingCosts;
    const calculatedIndirectCosts = indirectCostsBase * 0.25;
    
    const overall = directCosts + calculatedIndirectCosts;

    return { 
      byParticipant, 
      byCategory, 
      overall, 
      directCosts, 
      subcontractingCosts,
      indirectCostsBase,
      calculatedIndirectCosts,
    };
  }, [budgetItems]);

  // formatCurrency imported from shared utility

  const handleAddItem = (participantId: string, category: string, subcategory?: string) => {
    onAddBudgetItem({
      proposalId,
      participantId,
      category,
      subcategory,
      amount: 0,
      costType: 'actual',
      quantity: 1,
    });
  };

  const handleExportCSV = () => {
    const headers = ['Participant', 'Category', 'Subcategory', 'Description', 'Amount (€)', 'Justification'];
    const rows = budgetItems.map((item) => {
      const participant = participants.find((p) => p.id === item.participantId);
      const category = categories.find((c) => c.id === item.category);
      return [
        participant?.organisationShortName || participant?.organisationName || '',
        category?.label || item.category,
        item.subcategory || '',
        item.description || '',
        item.amount.toString(),
        item.justification || '',
      ];
    });

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget_${proposalId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Budget exported to CSV');
  };

  const handleCopyCostJustifications = async () => {
    if (!user?.id) {
      toast.error('You must be logged in');
      return;
    }
    setIsCopying(true);
    try {
      const result = await appendCostJustificationsToB31(proposalId, user.id);
      if (result.success) {
        toast.success('Cost justifications copied to Part B3.1 (Tables 3.1g & 3.1h)');
        queryClient.invalidateQueries({ queryKey: ['section-content'] });
      } else {
        toast.error(result.error || 'Failed to copy cost justifications');
      }
    } catch (error) {
      console.error('Error copying cost justifications:', error);
      toast.error('Failed to copy cost justifications');
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Guidelines Button */}
        <PartAGuidelinesDialog
          sectionTitle="Part A3: Budget"
          officialGuidelines={[{
            id: 'budget-info',
            title: 'Budget Guidelines',
            content: 'The estimated budget should include all eligible costs for the action.\n\nKey budget categories:\n• A. Personnel costs - Employees, direct contracts, seconded persons, SME owners\n• B. Subcontracting - Tasks performed by third parties\n• C. Purchase costs - Travel, equipment, other goods/services\n• D. Other cost categories - Financial support to third parties (if applicable)\n• E. Indirect costs - Calculated automatically as 25% of eligible direct costs\n\nImportant notes:\n• All costs must be directly linked to the project activities\n• Subcontracting should be limited and justified\n• Indirect costs (overheads) are calculated as a flat rate\n• Budget must be realistic and consistent with the work plan'
          }]}
          sitraTips={[{
            id: 'budget-tip',
            title: 'Budget planning tips',
            content: 'Start by estimating person-months per work package, then convert to costs.\n\nCommon pitfalls to avoid:\n• Underestimating travel and meeting costs\n• Forgetting equipment depreciation rules\n• Not accounting for inflation over multi-year projects\n• Overloading budget on one partner\n\nRecommendations:\n• Distribute effort proportionally across partners\n• Include buffer for unexpected costs where rules allow\n• Ensure consistency between budget and work package descriptions'
          }]}
        />
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-foreground">Part A3: Budget</h1>
              {saving && (
                <Badge variant="secondary" className="animate-pulse">
                  Saving...
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {budgetType === 'traditional' 
                ? 'Detailed budget breakdown by EU cost categories' 
                : 'Lump sum budget allocation by work package'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={budgetType === 'lump_sum' ? 'default' : 'secondary'}>
              {budgetType === 'lump_sum' ? 'Lump sum' : 'Actual costs'}
            </Badge>
            <Sheet open={showChangeHistory} onOpenChange={setShowChangeHistory}>
              <SheetTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <History className="w-4 h-4" />
                  History
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] sm:w-[540px]">
                <SheetHeader>
                  <SheetTitle>Budget Change History</SheetTitle>
                  <SheetDescription>
                    Track all changes made to the budget
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  <BudgetChangeHistory changes={budgetChanges} />
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
              <Download className="w-4 h-4" />
              Export
            </Button>
            {isFullProposal && isCoordinator && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleCopyCostJustifications}
                disabled={isCopying}
              >
                {isCopying ? <Loader2 className="w-4 h-4 animate-spin" /> : <TableProperties className="w-4 h-4" />}
                Copy justifications to B3.1
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Euro className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Request</p>
                  <p className="text-xl font-bold">{formatCurrency(totals.overall)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Topic Budget</p>
                  <p className="text-xl font-bold">
                    {totalBudget ? formatCurrency(totalBudget) : 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  totalBudget && totals.overall > totalBudget 
                    ? 'bg-destructive/10' 
                    : 'bg-amber-500/10'
                }`}>
                  {totalBudget && totals.overall > totalBudget ? (
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  ) : (
                    <Euro className="w-5 h-5 text-amber-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Remaining</p>
                  <p className={`text-xl font-bold ${
                    totalBudget && totals.overall > totalBudget ? 'text-destructive' : ''
                  }`}>
                    {totalBudget ? formatCurrency(totalBudget - totals.overall) : '—'}
                  </p>
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
                  <p className="text-xl font-bold">{formatCurrency(totals.calculatedIndirectCosts)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Budget Type Indicator */}
        <Card className={budgetType === 'lump_sum' ? 'border-amber-500/50' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {budgetType === 'traditional' ? 'Actual Costs Budget Model' : 'Lump Sum Budget Model'}
              </CardTitle>
              <Badge variant={budgetType === 'traditional' ? 'default' : 'secondary'}>
                {budgetType === 'traditional' ? 'Actual costs' : 'Fixed lump sums'}
              </Badge>
            </div>
            <CardDescription>
              {budgetType === 'traditional'
                ? 'Costs are reported based on actual eligible costs with 25% indirect cost flat rate'
                : 'Budget is allocated by work package with fixed amounts agreed at grant signature'}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="detailed">Detailed Entry</TabsTrigger>
            <TabsTrigger value="summary">Summary by Participant</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Budget Overview by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Category</TableHead>
                      <TableHead className="text-right">Amount (€)</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((cat) => {
                      const amount = totals.byCategory[cat.id] || 0;
                      const isIndirect = 'isIndirect' in cat && cat.isIndirect;
                      const displayAmount = isIndirect ? totals.calculatedIndirectCosts : amount;
                      const percentage = totals.overall > 0 
                        ? ((displayAmount / totals.overall) * 100).toFixed(1) 
                        : '0';

                      return (
                        <TableRow key={cat.id}>
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
                            {formatCurrency(displayAmount)}
                          </TableCell>
                          <TableCell className="text-right">{percentage}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-bold">Total EU Contribution Request</TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {formatCurrency(totals.overall)}
                      </TableCell>
                      <TableCell className="text-right font-bold">100%</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Detailed Entry Tab */}
          <TabsContent value="detailed" className="space-y-4">
            {/* Filter */}
            <div className="flex items-center gap-4">
              <Label>Filter by participant:</Label>
              <Select value={selectedParticipant} onValueChange={setSelectedParticipant}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="All participants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All participants</SelectItem>
                  {participants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.organisationShortName || p.organisationName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category tabs for detailed entry */}
            <Tabs defaultValue={categories[0]?.id}>
              <TabsList className="flex-wrap h-auto gap-1 p-1">
                {categories.filter(c => !('isIndirect' in c && c.isIndirect)).map((cat) => (
                  <TabsTrigger key={cat.id} value={cat.id} className="text-xs">
                    {cat.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {categories.filter(c => !('isIndirect' in c && c.isIndirect)).map((category) => {
                const categoryItems = filteredItems.filter((item) => item.category === category.id);
                const categoryTotal = categoryItems.reduce((sum, item) => sum + item.amount, 0);
                const subcategories = 'subcategories' in category && Array.isArray(category.subcategories) 
                  ? category.subcategories as { id: string; label: string; description: string }[]
                  : [];

                return (
                  <TabsContent key={category.id} value={category.id}>
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>{category.label}</CardTitle>
                            <CardDescription>{category.description}</CardDescription>
                          </div>
                          <span className="text-lg font-semibold">{formatCurrency(categoryTotal)}</span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Participant</TableHead>
                              {subcategories.length > 0 && <TableHead>Subcategory</TableHead>}
                              <TableHead>Description</TableHead>
                              {budgetType === 'traditional' && category.id === 'A' && (
                                <TableHead className="text-right">Person-Months</TableHead>
                              )}
                              <TableHead className="text-right">Amount (€)</TableHead>
                              <TableHead>Justification</TableHead>
                              {canEdit && <TableHead className="w-[50px]"></TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {categoryItems.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={canEdit ? 7 : 6}
                                  className="text-center text-muted-foreground py-8"
                                >
                                  No budget items in this category.
                                  {canEdit && participants.length > 0 && (
                                    <Button
                                      variant="link"
                                      className="ml-2"
                                      onClick={() => handleAddItem(
                                        participants[0].id, 
                                        category.id,
                                        subcategories.length > 0 ? subcategories[0].id : undefined
                                      )}
                                    >
                                      Add first item
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ) : (
                              categoryItems.map((item) => {
                                const participant = participants.find((p) => p.id === item.participantId);
                                return (
                                  <TableRow key={item.id}>
                                    <TableCell>
                                      {participant?.organisationShortName || participant?.organisationName || 'Unknown'}
                                    </TableCell>
                                    {subcategories.length > 0 && (
                                      <TableCell>
                                        <Select
                                          value={item.subcategory || ''}
                                          onValueChange={(v) =>
                                            onUpdateBudgetItem(item.id, { subcategory: v })
                                          }
                                          disabled={!canEdit}
                                        >
                                          <SelectTrigger className="h-8 w-[180px]">
                                            <SelectValue placeholder="Select..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {subcategories.map((sub) => (
                                              <SelectItem key={sub.id} value={sub.id}>
                                                {sub.label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </TableCell>
                                    )}
                                    <TableCell>
                                      <Input
                                        value={item.description || ''}
                                        onChange={(e) =>
                                          onUpdateBudgetItem(item.id, { description: e.target.value })
                                        }
                                        disabled={!canEdit}
                                        placeholder="Description"
                                        className="h-8"
                                      />
                                    </TableCell>
                                    {budgetType === 'traditional' && category.id === 'A' && (
                                      <TableCell className="text-right">
                                        <Input
                                          type="number"
                                          step="0.5"
                                          value={item.personMonths || ''}
                                          onChange={(e) =>
                                            onUpdateBudgetItem(item.id, {
                                              personMonths: parseFloat(e.target.value) || 0,
                                            })
                                          }
                                          disabled={!canEdit}
                                          className="h-8 w-20 text-right"
                                        />
                                      </TableCell>
                                    )}
                                    <TableCell className="text-right">
                                      <FormattedNumberInput
                                        value={item.amount || ''}
                                        onChange={(val) =>
                                          onUpdateBudgetItem(item.id, { amount: val })
                                        }
                                        disabled={!canEdit}
                                        className="h-8 w-28 text-right font-mono"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={item.justification || ''}
                                        onChange={(e) =>
                                          onUpdateBudgetItem(item.id, { justification: e.target.value })
                                        }
                                        disabled={!canEdit}
                                        placeholder="Justification"
                                        className="h-8"
                                      />
                                    </TableCell>
                                    {canEdit && (
                                      <TableCell>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                          onClick={() => onDeleteBudgetItem(item.id)}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                          {categoryItems.length > 0 && (
                            <TableFooter>
                              <TableRow>
                                <TableCell colSpan={subcategories.length > 0 ? 3 : 2} className="font-medium">
                                  Category Total
                                </TableCell>
                                {budgetType === 'traditional' && category.id === 'A' && (
                                  <TableCell className="text-right font-mono">
                                    {categoryItems.reduce((sum, i) => sum + (i.personMonths || 0), 0).toFixed(1)}
                                  </TableCell>
                                )}
                                <TableCell className="text-right font-bold font-mono">
                                  {formatCurrency(categoryTotal)}
                                </TableCell>
                                <TableCell colSpan={canEdit ? 2 : 1}></TableCell>
                              </TableRow>
                            </TableFooter>
                          )}
                        </Table>

                        {canEdit && participants.length > 0 && (
                          <div className="mt-4 flex items-center gap-2">
                            <Select
                              onValueChange={(participantId) => handleAddItem(
                                participantId, 
                                category.id,
                                subcategories.length > 0 ? subcategories[0].id : undefined
                              )}
                            >
                              <SelectTrigger className="w-[250px]">
                                <SelectValue placeholder="Add item for participant..." />
                              </SelectTrigger>
                              <SelectContent>
                                {participants.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    <Plus className="w-4 h-4 inline mr-2" />
                                    {p.organisationShortName || p.organisationName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
            </Tabs>
          </TabsContent>

          {/* Summary Tab */}
          <TabsContent value="summary">
            <Card>
              <CardHeader>
                <CardTitle>Summary by Participant</CardTitle>
                <CardDescription>
                  Overview of budget allocation across consortium partners
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Participant</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Direct Costs (€)</TableHead>
                      <TableHead className="text-right">Indirect Costs (€)</TableHead>
                      <TableHead className="text-right">Total (€)</TableHead>
                      <TableHead className="text-right">% of Budget</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.map((p) => {
                      const participantDirect = budgetItems
                        .filter((i) => i.participantId === p.id && i.category !== 'E' && i.category !== 'B')
                        .reduce((sum, i) => sum + i.amount, 0);
                      const participantSubcontracting = budgetItems
                        .filter((i) => i.participantId === p.id && i.category === 'B')
                        .reduce((sum, i) => sum + i.amount, 0);
                      const participantIndirect = participantDirect * 0.25;
                      const participantTotal = participantDirect + participantSubcontracting + participantIndirect;
                      const percentage =
                        totals.overall > 0 ? ((participantTotal / totals.overall) * 100).toFixed(1) : '0';

                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {p.organisationShortName || p.organisationName}
                          </TableCell>
                          <TableCell>{p.country || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {p.organisationType === 'beneficiary' ? 'BEN' : p.organisationType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(participantDirect + participantSubcontracting)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(participantIndirect)}
                          </TableCell>
                          <TableCell className="text-right font-bold font-mono">
                            {formatCurrency(participantTotal)}
                          </TableCell>
                          <TableCell className="text-right">{percentage}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="font-bold">
                        Consortium Total
                      </TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {formatCurrency(totals.directCosts)}
                      </TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {formatCurrency(totals.calculatedIndirectCosts)}
                      </TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {formatCurrency(totals.overall)}
                      </TableCell>
                      <TableCell className="text-right font-bold">100%</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
