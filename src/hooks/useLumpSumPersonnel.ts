import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const LUMP_SUM_PERSONNEL_QUERY_KEY = (proposalId: string) => ['ls-personnel', proposalId] as const;

export type LumpSumWorkPackage = {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color: string;
};

export type LumpSumParticipant = {
  id: string;
  participant_number: number | null;
  organisation_name: string;
  organisation_short_name: string | null;
  organisation_category: string | null;
};

export type LumpSumRole = {
  id: string;
  proposal_id: string;
  participant_id: string;
  cost_line: string;
  role_name: string;
  he_category: string | null;
  pm_rate: number;
  order_index: number;
};

export type LumpSumEffort = {
  id: string;
  role_id: string;
  wp_draft_id: string;
  person_months: number;
};

export type LumpSumParticipantBudget = {
  id: string;
  participant_id: string;
  a4_unit_cost: number | null;
  is_locked: boolean;
};

export type LumpSumPersonnelData = {
  workPackages: LumpSumWorkPackage[];
  participants: LumpSumParticipant[];
  roles: LumpSumRole[];
  efforts: LumpSumEffort[];
  participantBudgets: LumpSumParticipantBudget[];
};

async function ensureParticipantBudget(proposalId: string, participantId: string) {
  const { error } = await supabase
    .from('ls_participant_budget')
    .upsert({ proposal_id: proposalId, participant_id: participantId }, { onConflict: 'participant_id' });
  if (error) throw error;
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
}

const PERSONNEL_COST_LINES = ['A.1', 'A.2', 'A.3', 'A.4'];

async function syncParticipantWpEffort(proposalId: string, participantId: string, wpDraftIds: string[]) {
  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .select('budget_type')
    .eq('id', proposalId)
    .maybeSingle();
  if (proposalError) throw proposalError;
  if (proposal?.budget_type !== 'lump_sum') return;
  if (wpDraftIds.length === 0) return;

  const { data: roles, error: rolesError } = await supabase
    .from('ls_personnel_roles')
    .select('id, cost_line')
    .eq('proposal_id', proposalId)
    .eq('participant_id', participantId)
    .in('cost_line', PERSONNEL_COST_LINES);
  if (rolesError) throw rolesError;

  const roleIds = (roles ?? []).map(role => role.id);
  const { data: efforts, error: effortsError } = roleIds.length === 0
    ? { data: [], error: null }
    : await supabase
      .from('ls_personnel_effort')
      .select('role_id, wp_draft_id, person_months')
      .eq('proposal_id', proposalId)
      .in('role_id', roleIds)
      .in('wp_draft_id', wpDraftIds);
  if (effortsError) throw effortsError;

  for (const wpDraftId of wpDraftIds) {
    const total = Math.round((efforts ?? [])
      .filter(effort => effort.wp_draft_id === wpDraftId)
      .reduce((sum, effort) => sum + Number(effort.person_months || 0), 0) * 10) / 10;

    if (total === 0) {
      const { error } = await supabase
        .from('wp_draft_effort')
        .delete()
        .eq('wp_draft_id', wpDraftId)
        .eq('participant_id', participantId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('wp_draft_effort')
        .upsert({ wp_draft_id: wpDraftId, participant_id: participantId, person_months: total }, {
          onConflict: 'wp_draft_id,participant_id',
        });
      if (error) throw error;
    }
  }
}


export function useLumpSumPersonnel(proposalId: string) {
  const queryClient = useQueryClient();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const queryKey = LUMP_SUM_PERSONNEL_QUERY_KEY(proposalId);

  const query = useQuery({
    queryKey,
    enabled: Boolean(proposalId),
    queryFn: async (): Promise<LumpSumPersonnelData> => {
      const [wpResult, participantResult, roleResult, effortResult, budgetResult] = await Promise.all([
        supabase.from('wp_drafts').select('id, number, short_name, title, color').eq('proposal_id', proposalId).order('number'),
        supabase.from('participants').select('id, participant_number, organisation_name, organisation_short_name, organisation_category').eq('proposal_id', proposalId).order('participant_number'),
        supabase.from('ls_personnel_roles').select('id, proposal_id, participant_id, cost_line, role_name, he_category, pm_rate, order_index').eq('proposal_id', proposalId).order('participant_id').order('cost_line').order('order_index'),
        supabase.from('ls_personnel_effort').select('id, role_id, wp_draft_id, person_months').eq('proposal_id', proposalId),
        supabase.from('ls_participant_budget').select('id, participant_id, a4_unit_cost, is_locked').eq('proposal_id', proposalId),
      ]);
      const failure = [wpResult, participantResult, roleResult, effortResult, budgetResult].find(result => result.error);
      if (failure?.error) throw failure.error;
      return {
        workPackages: (wpResult.data ?? []) as LumpSumWorkPackage[],
        participants: (participantResult.data ?? []) as LumpSumParticipant[],
        roles: (roleResult.data ?? []) as LumpSumRole[],
        efforts: (effortResult.data ?? []) as LumpSumEffort[],
        participantBudgets: (budgetResult.data ?? []) as LumpSumParticipantBudget[],
      };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addRole = useMutation({
    mutationFn: async ({ participantId, costLine }: { participantId: string; costLine: string }) => {
      await ensureParticipantBudget(proposalId, participantId);
      const current = query.data?.roles.filter(role => role.participant_id === participantId && role.cost_line === costLine) ?? [];
      const { error } = await supabase.from('ls_personnel_roles').insert({
        proposal_id: proposalId,
        participant_id: participantId,
        cost_line: costLine,
        role_name: '',
        he_category: costLine === 'A.1' ? null : 'others',
        pm_rate: 0,
        order_index: current.length,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to add role: ${errorMessage(error)}`),
  });

  const updateRole = useMutation({
    mutationFn: async ({ roleId, field, value }: { roleId: string; field: 'role_name' | 'he_category' | 'pm_rate'; value: string | number | null }) => {
      const updates = field === 'role_name'
        ? { role_name: String(value ?? '') }
        : field === 'he_category'
          ? { he_category: value === null ? null : String(value) }
          : { pm_rate: Number(value) || 0 };
      const { error } = await supabase.from('ls_personnel_roles').update(updates).eq('id', roleId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to update role: ${errorMessage(error)}`),
  });

  const deleteRole = useMutation({
    mutationFn: async (roleId: string) => {
      const role = query.data?.roles.find(item => item.id === roleId);
      const { error } = await supabase.from('ls_personnel_roles').delete().eq('id', roleId);
      if (error) throw error;
      if (role) await syncParticipantWpEffort(proposalId, role.participant_id, query.data?.workPackages.map(wp => wp.id) ?? []);
    },
    onSuccess: async () => {
      await invalidate();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['a3-effort-data', proposalId] }),
        queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] }),
        queryClient.invalidateQueries({ queryKey: ['b31-budget-rows', proposalId] }),
      ]);
    },
    onError: (error: unknown) => toast.error(`Failed to delete role: ${errorMessage(error)}`),
  });

  const reorderRoles = useMutation({
    mutationFn: async ({ orderedIds }: { orderedIds: string[] }) => {
      const results = await Promise.all(orderedIds.map((id, index) =>
        supabase.from('ls_personnel_roles').update({ order_index: index }).eq('id', id),
      ));
      const failed = results.find(result => result.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to reorder roles: ${errorMessage(error)}`),
  });

  const setEffort = useMutation({
    mutationFn: async ({ roleId, wpDraftId, personMonths }: { roleId: string; wpDraftId: string; personMonths: number }) => {
      const role = query.data?.roles.find(item => item.id === roleId);
      if (!role) return;
      await ensureParticipantBudget(proposalId, role.participant_id);
      const { error } = await supabase.from('ls_personnel_effort').upsert({
        proposal_id: proposalId,
        role_id: roleId,
        wp_draft_id: wpDraftId,
        person_months: personMonths,
      }, { onConflict: 'role_id,wp_draft_id' });
      if (error) throw error;
      await syncParticipantWpEffort(proposalId, role.participant_id, [wpDraftId]);
    },
    onSuccess: async () => {
      await invalidate();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['a3-effort-data', proposalId] }),
        queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] }),
        queryClient.invalidateQueries({ queryKey: ['b31-budget-rows', proposalId] }),
      ]);
    },
    onError: (error: unknown) => toast.error(`Failed to save effort: ${errorMessage(error)}`),
  });

  const setA4UnitCost = useMutation({
    mutationFn: async ({ participantId, value }: { participantId: string; value: number }) => {
      await ensureParticipantBudget(proposalId, participantId);
      const { error } = await supabase.from('ls_participant_budget').update({ a4_unit_cost: value }).eq('proposal_id', proposalId).eq('participant_id', participantId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to save A.4 unit cost: ${errorMessage(error)}`),
  });

  const debounced = <T,>(key: string, callback: () => void) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(callback, 350);
  };

  return {
    ...query,
    data: query.data,
    addRole: (participantId: string, costLine: string) => addRole.mutate({ participantId, costLine }),
    updateRole: (roleId: string, field: 'role_name' | 'he_category' | 'pm_rate', value: string | number | null) => {
      debounced(`role-${roleId}-${field}`, () => updateRole.mutate({ roleId, field, value }));
    },
    deleteRole: (roleId: string) => deleteRole.mutate(roleId),
    reorderRoles: (orderedIds: string[]) => reorderRoles.mutate({ orderedIds }),
    setEffort: (roleId: string, wpDraftId: string, personMonths: number) => {
      debounced(`effort-${roleId}-${wpDraftId}`, () => setEffort.mutate({ roleId, wpDraftId, personMonths }));
    },
    setA4UnitCost: (participantId: string, value: number) => {
      debounced(`a4-${participantId}`, () => setA4UnitCost.mutate({ participantId, value }));
    },
    saving: addRole.isPending || updateRole.isPending || deleteRole.isPending || reorderRoles.isPending || setEffort.isPending || setA4UnitCost.isPending,
  };
}
