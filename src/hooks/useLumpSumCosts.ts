import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const LUMP_SUM_COSTS_QUERY_KEY = (proposalId: string) => ['ls-costs', proposalId] as const;

export type LumpSumCostWorkPackage = {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color: string;
};

export type LumpSumCostParticipant = {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
};

export type LumpSumCostItem = {
  id: string;
  proposal_id: string;
  participant_id: string;
  wp_draft_id: string;
  cost_line: string;
  quantity: number;
  unit_cost: number;
  amount: number | null;
  justification: string;
  order_index: number;
};

export type LumpSumCostsData = {
  items: LumpSumCostItem[];
  workPackages: LumpSumCostWorkPackage[];
  participants: LumpSumCostParticipant[];
  usesFstp: boolean;
};

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function ensureParticipantBudget(proposalId: string, participantId: string) {
  const { error } = await supabase
    .from('ls_participant_budget')
    .upsert({ proposal_id: proposalId, participant_id: participantId }, { onConflict: 'participant_id' });
  if (error) throw error;
}

export function useLumpSumCosts(proposalId: string) {
  const queryClient = useQueryClient();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const queryKey = LUMP_SUM_COSTS_QUERY_KEY(proposalId);

  const query = useQuery({
    queryKey,
    enabled: Boolean(proposalId),
    queryFn: async (): Promise<LumpSumCostsData> => {
      const [itemsResult, wpResult, participantResult, proposalResult] = await Promise.all([
        supabase.from('ls_cost_items').select('id, proposal_id, participant_id, wp_draft_id, cost_line, quantity, unit_cost, amount, justification, order_index').eq('proposal_id', proposalId).order('participant_id').order('cost_line').order('order_index'),
        supabase.from('wp_drafts').select('id, number, short_name, title, color').eq('proposal_id', proposalId).order('number'),
        supabase.from('participants').select('id, participant_number, organisation_short_name').eq('proposal_id', proposalId).order('participant_number'),
        supabase.from('proposals').select('uses_fstp').eq('id', proposalId).single(),
      ]);
      const failure = [itemsResult, wpResult, participantResult, proposalResult].find(result => result.error);
      if (failure?.error) throw failure.error;
      return {
        items: (itemsResult.data ?? []) as LumpSumCostItem[],
        workPackages: (wpResult.data ?? []) as LumpSumCostWorkPackage[],
        participants: (participantResult.data ?? []) as LumpSumCostParticipant[],
        usesFstp: Boolean(proposalResult.data?.uses_fstp),
      };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addItem = useMutation({
    mutationFn: async ({ participantId, costLine, wpDraftId }: { participantId: string; costLine: string; wpDraftId?: string }) => {
      const workPackage = wpDraftId
        ? query.data?.workPackages.find(wp => wp.id === wpDraftId)
        : query.data?.workPackages[0];
      if (!workPackage) throw new Error('No work packages are available for this proposal.');
      await ensureParticipantBudget(proposalId, participantId);
      const current = query.data?.items.filter(item => item.participant_id === participantId && item.cost_line === costLine) ?? [];
      const { error } = await supabase.from('ls_cost_items').insert({
        proposal_id: proposalId,
        participant_id: participantId,
        wp_draft_id: workPackage.id,
        cost_line: costLine,
        quantity: 1,
        unit_cost: 0,
        justification: '',
        order_index: current.length,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to add cost item: ${errorMessage(error)}`),
  });

  const updateItem = useMutation({
    mutationFn: async ({ itemId, field, value }: {
      itemId: string;
      field: 'quantity' | 'unit_cost' | 'justification' | 'wp_draft_id';
      value: number | string;
    }) => {
      if (field === 'quantity') {
        const { error } = await supabase.from('ls_cost_items').update({ quantity: Number(value) || 0 }).eq('id', itemId);
        if (error) throw error;
        return;
      }
      if (field === 'unit_cost') {
        const { error } = await supabase.from('ls_cost_items').update({ unit_cost: Number(value) || 0 }).eq('id', itemId);
        if (error) throw error;
        return;
      }
      const updates = field === 'justification' ? { justification: String(value) } : { wp_draft_id: String(value) };
      const { error } = await supabase.from('ls_cost_items').update(updates).eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to update cost item: ${errorMessage(error)}`),
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('ls_cost_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to delete cost item: ${errorMessage(error)}`),
  });

  const reorderItems = useMutation({
    mutationFn: async ({ orderedIds }: { orderedIds: string[] }) => {
      const results = await Promise.all(orderedIds.map((id, index) =>
        supabase.from('ls_cost_items').update({ order_index: index }).eq('id', id),
      ));
      const failed = results.find(result => result.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to reorder cost items: ${errorMessage(error)}`),
  });

  const saveDItem = useMutation({
    mutationFn: async ({ participantId, wpDraftId, costLine, unitCost, justification }: {
      participantId: string;
      wpDraftId: string;
      costLine: string;
      unitCost: number;
      justification: string;
    }) => {
      const existing = query.data?.items.find(item =>
        item.participant_id === participantId && item.wp_draft_id === wpDraftId && item.cost_line === costLine,
      );
      await ensureParticipantBudget(proposalId, participantId);
      if (existing) {
        const { error } = await supabase.from('ls_cost_items').update({ unit_cost: unitCost, justification }).eq('id', existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('ls_cost_items').insert({
        proposal_id: proposalId,
        participant_id: participantId,
        wp_draft_id: wpDraftId,
        cost_line: costLine,
        quantity: 1,
        unit_cost: unitCost,
        justification,
        order_index: 0,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to save cost amount: ${errorMessage(error)}`),
  });

  const debounced = (key: string, callback: () => void) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(callback, 350);
  };

  return {
    ...query,
    data: query.data,
    addItem: (participantId: string, costLine: string) => addItem.mutate({ participantId, costLine }),
    updateQuantity: (itemId: string, value: number) => debounced(`quantity-${itemId}`, () => updateItem.mutate({ itemId, field: 'quantity', value })),
    updateUnitCost: (itemId: string, value: number) => debounced(`unit-cost-${itemId}`, () => updateItem.mutate({ itemId, field: 'unit_cost', value })),
    updateJustification: (itemId: string, value: string) => debounced(`justification-${itemId}`, () => updateItem.mutate({ itemId, field: 'justification', value })),
    changeWorkPackage: (itemId: string, value: string) => updateItem.mutate({ itemId, field: 'wp_draft_id', value }),
    deleteItem: (itemId: string) => deleteItem.mutate(itemId),
    reorderItems: (orderedIds: string[]) => reorderItems.mutate({ orderedIds }),
    saveDItem: (participantId: string, wpDraftId: string, costLine: string, unitCost: number, justification: string) =>
      debounced(`d-${participantId}-${wpDraftId}-${costLine}`, () => saveDItem.mutate({ participantId, wpDraftId, costLine, unitCost, justification })),
    saving: addItem.isPending || updateItem.isPending || deleteItem.isPending || reorderItems.isPending || saveDItem.isPending,
  };
}
