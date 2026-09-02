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

export type LumpSumEffortReconciliationRow = {
  participantId: string;
  participantNumber: number | null;
  participantName: string;
  wpDraftId: string;
  wpNumber: number;
  currentPersonMonths: number;
  proposedPersonMonths: number;
};

const PERSONNEL_COST_LINES = ['A.1', 'A.2', 'A.3', 'A.4'];

function roundPersonMonths(value: number) {
  return Math.round(value * 10) / 10;
}

async function getLumpSumEffortTotals(proposalId: string, participantId: string, wpDraftIds: string[]) {
  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .select('budget_type')
    .eq('id', proposalId)
    .maybeSingle();
  if (proposalError) throw proposalError;
  if (proposal?.budget_type !== 'lump_sum' || wpDraftIds.length === 0) return new Map<string, number>();

  const { data: roles, error: rolesError } = await supabase
    .from('ls_personnel_roles')
    .select('id')
    .eq('proposal_id', proposalId)
    .eq('participant_id', participantId)
    .in('cost_line', PERSONNEL_COST_LINES);
  if (rolesError) throw rolesError;

  const roleIds = (roles ?? []).map(role => role.id);
  if (roleIds.length === 0) return new Map(wpDraftIds.map(wpDraftId => [wpDraftId, 0]));

  const { data: efforts, error: effortsError } = await supabase
    .from('ls_personnel_effort')
    .select('role_id, wp_draft_id, person_months')
    .eq('proposal_id', proposalId)
    .in('role_id', roleIds)
    .in('wp_draft_id', wpDraftIds);
  if (effortsError) throw effortsError;

  const totals = new Map(wpDraftIds.map(wpDraftId => [wpDraftId, 0]));
  for (const effort of efforts ?? []) {
    totals.set(effort.wp_draft_id, roundPersonMonths((totals.get(effort.wp_draft_id) ?? 0) + Number(effort.person_months || 0)));
  }
  return totals;
}

async function syncParticipantWpEffort(proposalId: string, participantId: string, wpDraftIds: string[]) {
  const totals = await getLumpSumEffortTotals(proposalId, participantId, wpDraftIds);
  if (totals.size === 0) return;

  for (const [wpDraftId, total] of totals) {
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

/** Read-only reconciliation preview. It never writes to either effort table. */
export async function previewLumpSumEffortReconciliation(proposalId: string): Promise<LumpSumEffortReconciliationRow[]> {
  const [wpResult, participantResult, roleResult, lsEffortResult, currentResult] = await Promise.all([
    supabase.from('wp_drafts').select('id, number').eq('proposal_id', proposalId).order('number'),
    supabase.from('participants').select('id, participant_number, organisation_short_name, organisation_name').eq('proposal_id', proposalId).order('participant_number'),
    supabase.from('ls_personnel_roles').select('id, participant_id, cost_line').eq('proposal_id', proposalId).in('cost_line', PERSONNEL_COST_LINES),
    supabase.from('ls_personnel_effort').select('role_id, wp_draft_id, person_months').eq('proposal_id', proposalId),
    supabase.from('wp_draft_effort').select('wp_draft_id, participant_id, person_months, wp_drafts!inner(proposal_id)').eq('wp_drafts.proposal_id', proposalId),
  ]);
  const failure = [wpResult, participantResult, roleResult, lsEffortResult, currentResult].find(result => result.error);
  if (failure?.error) throw failure.error;

  const wpIds = (wpResult.data ?? []).map(wp => wp.id);
  const rolesByParticipant = new Map<string, string[]>();
  for (const role of roleResult.data ?? []) {
    const roleIds = rolesByParticipant.get(role.participant_id) ?? [];
    roleIds.push(role.id);
    rolesByParticipant.set(role.participant_id, roleIds);
  }
  const proposed = new Map<string, number>();
  for (const effort of lsEffortResult.data ?? []) {
    const participantId = [...rolesByParticipant.entries()].find(([, roleIds]) => roleIds.includes(effort.role_id))?.[0];
    if (!participantId) continue;
    const key = `${participantId}|${effort.wp_draft_id}`;
    proposed.set(key, roundPersonMonths((proposed.get(key) ?? 0) + Number(effort.person_months || 0)));
  }
  const current = new Map<string, number>();
  for (const effort of currentResult.data ?? []) {
    current.set(`${effort.participant_id}|${effort.wp_draft_id}`, Number(effort.person_months || 0));
  }

  return (participantResult.data ?? []).flatMap(participant => (wpResult.data ?? []).map(wp => ({
    participantId: participant.id,
    participantNumber: participant.participant_number,
    participantName: participant.organisation_short_name || participant.organisation_name,
    wpDraftId: wp.id,
    wpNumber: wp.number,
    currentPersonMonths: current.get(`${participant.id}|${wp.id}`) ?? 0,
    proposedPersonMonths: proposed.get(`${participant.id}|${wp.id}`) ?? 0,
  })));
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
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
  const invalidateMirrors = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['a3-effort-data', proposalId] }),
      queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] }),
      queryClient.invalidateQueries({ queryKey: ['b31-budget-rows', proposalId] }),
    ]);
  };

  const addRole = useMutation({
    mutationFn: async ({ participantId, costLine }: { participantId: string; costLine: string }) => {
      const { error: budgetError } = await supabase
        .from('ls_participant_budget')
        .upsert({ proposal_id: proposalId, participant_id: participantId }, { onConflict: 'participant_id' });
      if (budgetError) throw budgetError;
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
      await invalidateMirrors();
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
      const { error: budgetError } = await supabase
        .from('ls_participant_budget')
        .upsert({ proposal_id: proposalId, participant_id: role.participant_id }, { onConflict: 'participant_id' });
      if (budgetError) throw budgetError;
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
      await invalidateMirrors();
    },
    onError: (error: unknown) => toast.error(`Failed to save effort: ${errorMessage(error)}`),
  });

  const setA4UnitCost = useMutation({
    mutationFn: async ({ participantId, value }: { participantId: string; value: number }) => {
      const { error: budgetError } = await supabase
        .from('ls_participant_budget')
        .upsert({ proposal_id: proposalId, participant_id: participantId }, { onConflict: 'participant_id' });
      if (budgetError) throw budgetError;
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
