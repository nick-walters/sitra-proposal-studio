import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BudgetItem,
  Participant,
  BudgetType,
  BUDGET_CATEGORIES_TRADITIONAL,
  BUDGET_CATEGORIES_LUMP_SUM,
} from '@/types/proposal';
import { Plus, Trash2, Download, Euro, Calculator } from 'lucide-react';
import { toast } from 'sonner';

interface BudgetSpreadsheetProps {
  budgetItems: BudgetItem[];
  participants: Participant[];
  budgetType: BudgetType;
  totalBudget?: number;
  onAddBudgetItem: (item: Omit<BudgetItem, 'id'>) => void;
  onUpdateBudgetItem: (id: string, updates: Partial<BudgetItem>) => void;
  onDeleteBudgetItem: (id: string) => void;
  onChangeBudgetType: (type: BudgetType) => void;
  canEdit: boolean;
  proposalId: string;
}

export function BudgetSpreadsheet({
  budgetItems,
  participants,
  budgetType,
  totalBudget,
  onAddBudgetItem,
  onUpdateBudgetItem,
  onDeleteBudgetItem,
  onChangeBudgetType,
  canEdit,
  proposalId,
}: BudgetSpreadsheetProps) {
  const [selectedParticipant, setSelectedParticipant] = useState<string | 'all'>('all');

  const categories = budgetType === 'traditional' ? BUDGET_CATEGORIES_TRADITIONAL : BUDGET_CATEGORIES_LUMP_SUM;

  const filteredItems = useMemo(() => {
    if (selectedParticipant === 'all') return budgetItems;
    return budgetItems.filter((item) => item.participantId === selectedParticipant);
  }, [budgetItems, selectedParticipant]);

  const totals = useMemo(() => {
    const byParticipant: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let overall = 0;

    budgetItems.forEach((item) => {
      byParticipant[item.participantId] = (byParticipant[item.participantId] || 0) + item.amount;
      byCategory[item.category] = (byCategory[item.category] || 0) + item.amount;
      overall += item.amount;
    });

    return { byParticipant, byCategory, overall };
  }, [budgetItems]);

  const handleAddItem = (participantId: string, category: string) => {
    onAddBudgetItem({
      proposalId,
      participantId,
      category,
      amount: 0,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Budget</h1>
            <p className="text-muted-foreground">Detailed budget breakdown for the proposal</p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={budgetType}
              onValueChange={(v) => onChangeBudgetType(v as BudgetType)}
              disabled={!canEdit}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="traditional">Traditional Budget</SelectItem>
                <SelectItem value="lump_sum">Lump Sum Budget</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
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
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Available Budget</p>
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
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Euro className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Remaining</p>
                  <p className="text-xl font-bold">
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
                  <span className="text-lg font-bold text-muted-foreground">
                    {participants.length}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Participants</p>
                  <p className="text-xl font-bold">Partners</p>
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
                {budgetType === 'traditional' ? 'Traditional Budget Model' : 'Lump Sum Budget Model'}
              </CardTitle>
              <Badge variant={budgetType === 'traditional' ? 'default' : 'secondary'}>
                {budgetType === 'traditional' ? 'Cost Categories' : 'Work Packages'}
              </Badge>
            </div>
            <CardDescription>
              {budgetType === 'traditional'
                ? 'Budget breakdown by cost category (personnel, equipment, travel, etc.)'
                : 'Budget allocation by work package with fixed lump sums'}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Filter by Participant */}
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

        {/* Budget Table by Category */}
        <Tabs defaultValue={categories[0]?.id}>
          <TabsList className="flex-wrap h-auto gap-1 p-1">
            {categories.map((cat) => (
              <TabsTrigger key={cat.id} value={cat.id} className="text-xs">
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map((category) => {
            const categoryItems = filteredItems.filter((item) => item.category === category.id);
            const categoryTotal = categoryItems.reduce((sum, item) => sum + item.amount, 0);

            return (
              <TabsContent key={category.id} value={category.id}>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle>{category.label}</CardTitle>
                      <span className="text-lg font-semibold">{formatCurrency(categoryTotal)}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Participant</TableHead>
                          <TableHead>Description</TableHead>
                          {category.subcategories.length > 0 && (
                            <TableHead>Subcategory</TableHead>
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
                              colSpan={canEdit ? 6 : 5}
                              className="text-center text-muted-foreground py-8"
                            >
                              No budget items in this category.
                              {canEdit && participants.length > 0 && (
                                <Button
                                  variant="link"
                                  className="ml-2"
                                  onClick={() => handleAddItem(participants[0].id, category.id)}
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
                                {category.subcategories.length > 0 && (
                                  <TableCell>
                                    <Select
                                      value={item.subcategory || ''}
                                      onValueChange={(v) =>
                                        onUpdateBudgetItem(item.id, { subcategory: v })
                                      }
                                      disabled={!canEdit}
                                    >
                                      <SelectTrigger className="h-8">
                                        <SelectValue placeholder="Select..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {category.subcategories.map((sub) => (
                                          <SelectItem key={sub} value={sub}>
                                            {sub}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                )}
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    value={item.amount || ''}
                                    onChange={(e) =>
                                      onUpdateBudgetItem(item.id, {
                                        amount: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                    disabled={!canEdit}
                                    className="h-8 text-right"
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
                    </Table>

                    {canEdit && participants.length > 0 && (
                      <div className="mt-4 flex items-center gap-2">
                        <Select
                          onValueChange={(participantId) => handleAddItem(participantId, category.id)}
                        >
                          <SelectTrigger className="w-[250px]">
                            <SelectValue placeholder="Add item for participant..." />
                          </SelectTrigger>
                          <SelectContent>
                            {participants.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
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

        {/* Summary by Participant */}
        <Card>
          <CardHeader>
            <CardTitle>Summary by Participant</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participant</TableHead>
                  <TableHead className="text-right">Total (€)</TableHead>
                  <TableHead className="text-right">% of Budget</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {participants.map((p) => {
                  const participantTotal = totals.byParticipant[p.id] || 0;
                  const percentage =
                    totals.overall > 0 ? ((participantTotal / totals.overall) * 100).toFixed(1) : '0';

                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.organisationShortName || p.organisationName}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(participantTotal)}</TableCell>
                      <TableCell className="text-right">{percentage}%</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.overall)}</TableCell>
                  <TableCell className="text-right">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
