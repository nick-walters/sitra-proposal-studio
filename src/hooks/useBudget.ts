import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface BudgetItem {
  id: string;
  proposalId: string;
  participantId: string;
  category: string;
  subcategory?: string;
  description?: string;
  amount: number;
  justification?: string;
  workPackage?: string;
  personMonths?: number;
  unitCost?: number;
  quantity?: number;
  costType?: 'actual' | 'unit' | 'flat_rate';
}

export function useBudget(proposalId: string) {
  const { user: _user } = useAuth();
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch budget items
  const fetchBudgetItems = useCallback(async () => {
    if (!proposalId) return;

    const { data, error } = await supabase
      .from('budget_items')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching budget items:', error);
      return;
    }

    setBudgetItems(
      (data || []).map((item) => ({
        id: item.id,
        proposalId: item.proposal_id,
        participantId: item.participant_id,
        category: item.category,
        subcategory: item.subcategory || undefined,
        description: item.description || undefined,
        amount: item.amount,
        justification: item.justification || undefined,
        workPackage: item.work_package || undefined,
        personMonths: item.person_months || undefined,
        unitCost: item.unit_cost || undefined,
        quantity: item.quantity || 1,
        costType: (item.cost_type as 'actual' | 'unit' | 'flat_rate') || 'actual',
      }))
    );
  }, [proposalId]);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchBudgetItems();
      setLoading(false);
    };
    loadData();
  }, [fetchBudgetItems]);

  // Add budget item
  const addBudgetItem = async (item: Omit<BudgetItem, 'id'>) => {
    setSaving(true);
    const { data, error } = await supabase
      .from('budget_items')
      .insert({
        proposal_id: item.proposalId,
        participant_id: item.participantId,
        category: item.category,
        subcategory: item.subcategory,
        description: item.description,
        amount: item.amount,
        justification: item.justification,
        work_package: item.workPackage,
        person_months: item.personMonths,
        unit_cost: item.unitCost,
        quantity: item.quantity || 1,
        cost_type: item.costType || 'actual',
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add budget item');
      console.error(error);
    } else if (data) {
      await fetchBudgetItems();
      toast.success('Budget item added');
    }
    setSaving(false);
  };

  // Update budget item
  const updateBudgetItem = async (id: string, updates: Partial<BudgetItem>) => {
    const existingItem = budgetItems.find((i) => i.id === id);
    if (!existingItem) return;

    setSaving(true);

    const { error } = await supabase
      .from('budget_items')
      .update({
        category: updates.category,
        subcategory: updates.subcategory,
        description: updates.description,
        amount: updates.amount,
        justification: updates.justification,
        work_package: updates.workPackage,
        person_months: updates.personMonths,
        unit_cost: updates.unitCost,
        quantity: updates.quantity,
        cost_type: updates.costType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update budget item');
      console.error(error);
    } else {
      await fetchBudgetItems();
    }
    setSaving(false);
  };

  // Delete budget item
  const deleteBudgetItem = async (id: string) => {
    const existingItem = budgetItems.find((i) => i.id === id);
    if (!existingItem) return;

    setSaving(true);

    const { error } = await supabase.from('budget_items').delete().eq('id', id);

    if (error) {
      toast.error('Failed to delete budget item');
      console.error(error);
    } else {
      await fetchBudgetItems();
      toast.success('Budget item deleted');
    }
    setSaving(false);
  };

  return {
    budgetItems,
    loading,
    saving,
    addBudgetItem,
    updateBudgetItem,
    deleteBudgetItem,
    refreshBudget: fetchBudgetItems,
  };
}
