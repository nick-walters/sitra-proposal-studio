import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const LUMP_SUM_DEPRECIATION_QUERY_KEY = (proposalId: string) => ['ls-depreciation', proposalId] as const;

export const DEPRECIATION_COMMENT_LIMIT = 100;

export type DepreciationWorkPackage = {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color: string;
};

export type DepreciationParticipant = {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
};

export type DepreciationItem = {
  id: string;
  proposal_id: string;
  participant_id: string;
  wp_draft_id: string;
  resource_type: string;
  short_name: string;
  purchase_date: string | null;
  purchase_cost: number;
  pct_project: number;
  pct_useful_life: number;
  comments: string | null;
  include_in_c2: boolean;
  order_index: number;
  charged_depreciation: number | null;
};

export type DepreciationData = {
  items: DepreciationItem[];
  workPackages: DepreciationWorkPackage[];
  participants: DepreciationParticipant[];
};

export type DepreciationField =
  | 'wp_draft_id'
  | 'resource_type'
  | 'short_name'
  | 'purchase_date'
  | 'purchase_cost'
  | 'pct_project'
  | 'pct_useful_life'
  | 'comments'
  | 'include_in_c2';

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
}

async function ensureParticipantBudget(proposalId: string, participantId: string) {
  const { error } = await supabase
    .from('ls_participant_budget')
    .upsert({ proposal_id: proposalId, participant_id: participantId }, { onConflict: 'participant_id' });
  if (error) throw error;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function useLumpSumDepreciation(proposalId: string) {
  const queryClient = useQueryClient();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const queryKey = LUMP_SUM_DEPRECIATION_QUERY_KEY(proposalId);

  const query = useQuery({
    queryKey,
    enabled: Boolean(proposalId),
    queryFn: async (): Promise<DepreciationData> => {
      const [itemResult, wpResult, participantResult] = await Promise.all([
        supabase
          .from('ls_depreciation_items')
          .select('id, proposal_id, participant_id, wp_draft_id, resource_type, short_name, purchase_date, purchase_cost, pct_project, pct_useful_life, comments, include_in_c2, order_index, charged_depreciation')
          .eq('proposal_id', proposalId)
          .order('participant_id')
          .order('order_index'),
        supabase.from('wp_drafts').select('id, number, short_name, title, color').eq('proposal_id', proposalId).order('number'),
        supabase.from('participants').select('id, participant_number, organisation_short_name').eq('proposal_id', proposalId).order('participant_number'),
      ]);
      const failure = [itemResult, wpResult, participantResult].find(result => result.error);
      if (failure?.error) throw failure.error;
      return {
        items: (itemResult.data ?? []) as DepreciationItem[],
        workPackages: (wpResult.data ?? []) as DepreciationWorkPackage[],
        participants: (participantResult.data ?? []) as DepreciationParticipant[],
      };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addItem = useMutation({
    mutationFn: async ({ participantId }: { participantId: string }) => {
      const workPackage = query.data?.workPackages[0];
      if (!workPackage) throw new Error('No work packages are available for this proposal.');
      await ensureParticipantBudget(proposalId, participantId);
      const current = query.data?.items.filter(item => item.participant_id === participantId) ?? [];
      const { error } = await supabase.from('ls_depreciation_items').insert({
        proposal_id: proposalId,
        participant_id: participantId,
        wp_draft_id: workPackage.id,
        resource_type: 'equipment',
        short_name: '',
        purchase_cost: 0,
        pct_project: 0,
        pct_useful_life: 0,
        include_in_c2: true,
        order_index: current.length,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to add investment: ${errorMessage(error)}`),
  });

  const updateItem = useMutation({
    mutationFn: async ({ itemId, field, value }: { itemId: string; field: DepreciationField; value: string | number | boolean | null }) => {
      type DepreciationUpdate = {
        wp_draft_id?: string;
        resource_type?: string;
        short_name?: string;
        purchase_date?: string | null;
        purchase_cost?: number;
        pct_project?: number;
        pct_useful_life?: number;
        comments?: string | null;
        include_in_c2?: boolean;
      };
      let updates: DepreciationUpdate;
      switch (field) {
        case 'purchase_cost':
          updates = { purchase_cost: Number(value) || 0 };
          break;
        case 'pct_project':
          updates = { pct_project: clampPercent(Number(value)) };
          break;
        case 'pct_useful_life':
          updates = { pct_useful_life: clampPercent(Number(value)) };
          break;
        case 'include_in_c2':
          updates = { include_in_c2: Boolean(value) };
          break;
        case 'comments':
          updates = { comments: String(value ?? '').slice(0, DEPRECIATION_COMMENT_LIMIT) };
          break;
        case 'purchase_date':
          updates = { purchase_date: value ? String(value) : null };
          break;
        case 'short_name':
          updates = { short_name: String(value ?? '') };
          break;
        case 'resource_type':
          updates = { resource_type: String(value ?? 'equipment') };
          break;
        default:
          updates = { wp_draft_id: String(value ?? '') };
      }
      const { error } = await supabase.from('ls_depreciation_items').update(updates).eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to update investment: ${errorMessage(error)}`),
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('ls_depreciation_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to delete investment: ${errorMessage(error)}`),
  });

  const reorderItems = useMutation({
    mutationFn: async ({ orderedIds }: { orderedIds: string[] }) => {
      const results = await Promise.all(orderedIds.map((id, index) =>
        supabase.from('ls_depreciation_items').update({ order_index: index }).eq('id', id),
      ));
      const failed = results.find(result => result.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to reorder investments: ${errorMessage(error)}`),
  });

  const debounced = (key: string, callback: () => void) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(callback, 350);
  };

  return {
    ...query,
    data: query.data,
    addItem: (participantId: string) => addItem.mutate({ participantId }),
    updateItem: (itemId: string, field: DepreciationField, value: string | number | boolean | null) => {
      if (field === 'include_in_c2' || field === 'wp_draft_id' || field === 'resource_type') {
        updateItem.mutate({ itemId, field, value });
        return;
      }
      debounced(`dep-${itemId}-${field}`, () => updateItem.mutate({ itemId, field, value }));
    },
    deleteItem: (itemId: string) => deleteItem.mutate(itemId),
    reorderItems: (orderedIds: string[]) => reorderItems.mutate({ orderedIds }),
    saving: addItem.isPending || updateItem.isPending || deleteItem.isPending || reorderItems.isPending,
  };
}
