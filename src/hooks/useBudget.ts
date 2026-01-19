import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { BudgetType } from '@/types/proposal';

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

export interface BudgetChange {
  id: string;
  budgetItemId?: string;
  proposalId: string;
  userId: string;
  changeType: 'create' | 'update' | 'delete';
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
  userName?: string;
}

export function useBudget(proposalId: string) {
  const { user } = useAuth();
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [budgetChanges, setBudgetChanges] = useState<BudgetChange[]>([]);
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

  // Fetch budget changes history
  const fetchBudgetChanges = useCallback(async () => {
    if (!proposalId) return;

    const { data, error } = await supabase
      .from('budget_changes')
      .select(`
        *,
        profiles:user_id (full_name)
      `)
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching budget changes:', error);
      return;
    }

    setBudgetChanges(
      (data || []).map((change: any) => ({
        id: change.id,
        budgetItemId: change.budget_item_id,
        proposalId: change.proposal_id,
        userId: change.user_id,
        changeType: change.change_type,
        fieldChanged: change.field_changed,
        oldValue: change.old_value,
        newValue: change.new_value,
        createdAt: change.created_at,
        userName: change.profiles?.full_name || 'Unknown',
      }))
    );
  }, [proposalId]);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchBudgetItems(), fetchBudgetChanges()]);
      setLoading(false);
    };
    loadData();
  }, [fetchBudgetItems, fetchBudgetChanges]);

  // Record a change
  const recordChange = async (
    budgetItemId: string | null,
    changeType: 'create' | 'update' | 'delete',
    fieldChanged?: string,
    oldValue?: string,
    newValue?: string
  ) => {
    if (!user) return;

    await supabase.from('budget_changes').insert({
      budget_item_id: budgetItemId,
      proposal_id: proposalId,
      user_id: user.id,
      change_type: changeType,
      field_changed: fieldChanged,
      old_value: oldValue,
      new_value: newValue,
    });

    fetchBudgetChanges();
  };

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
      await recordChange(data.id, 'create', 'item', undefined, item.category);
      await fetchBudgetItems();
      toast.success('Budget item added');
    }
    setSaving(false);
  };

  // Update budget item with change tracking
  const updateBudgetItem = async (id: string, updates: Partial<BudgetItem>) => {
    const existingItem = budgetItems.find((i) => i.id === id);
    if (!existingItem) return;

    setSaving(true);

    // Track what changed
    const changedFields: { field: string; old: string; new: string }[] = [];
    
    if (updates.amount !== undefined && updates.amount !== existingItem.amount) {
      changedFields.push({
        field: 'amount',
        old: existingItem.amount.toString(),
        new: updates.amount.toString(),
      });
    }
    if (updates.description !== undefined && updates.description !== existingItem.description) {
      changedFields.push({
        field: 'description',
        old: existingItem.description || '',
        new: updates.description || '',
      });
    }
    if (updates.justification !== undefined && updates.justification !== existingItem.justification) {
      changedFields.push({
        field: 'justification',
        old: existingItem.justification || '',
        new: updates.justification || '',
      });
    }
    if (updates.personMonths !== undefined && updates.personMonths !== existingItem.personMonths) {
      changedFields.push({
        field: 'person_months',
        old: (existingItem.personMonths || 0).toString(),
        new: updates.personMonths.toString(),
      });
    }

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
      // Record each changed field
      for (const change of changedFields) {
        await recordChange(id, 'update', change.field, change.old, change.new);
      }
      await fetchBudgetItems();
    }
    setSaving(false);
  };

  // Delete budget item
  const deleteBudgetItem = async (id: string) => {
    const existingItem = budgetItems.find((i) => i.id === id);
    if (!existingItem) return;

    setSaving(true);
    
    // Record deletion before actually deleting
    await recordChange(id, 'delete', 'item', existingItem.category, undefined);

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
    budgetChanges,
    loading,
    saving,
    addBudgetItem,
    updateBudgetItem,
    deleteBudgetItem,
    refreshBudget: fetchBudgetItems,
    refreshChanges: fetchBudgetChanges,
  };
}
