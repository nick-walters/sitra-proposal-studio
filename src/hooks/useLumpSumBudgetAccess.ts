import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

/** Distinct from ['ls-personnel', …], ['ls-costs', …], ['ls-depreciation', …]. */
const ACCESS_KEY = (proposalId: string) => ['ls-access', proposalId] as const;
/** Key owned by useCanEditParticipantBudget — invalidated together with the access key. */
const PERMISSIONS_KEY = (proposalId: string) => ['ls-personnel-permissions', proposalId] as const;

export type ParticipantLock = {
  participant_id: string;
  is_locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
};

export type ProposalMember = {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
};

export type PermissionOverride = {
  participant_id: string;
  user_id: string;
  can_edit: boolean;
};

export type ParticipantMemberRow = {
  participant_id: string;
  user_id: string | null;
  email: string | null;
};

function fail(message: string) {
  return (error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    toast.error(message, { description: detail });
  };
}

export function useLumpSumBudgetAccess(proposalId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ACCESS_KEY(proposalId),
    enabled: Boolean(proposalId),
    queryFn: async () => {
      const [participantsRes, budgetsRes, rolesRes, overridesRes] = await Promise.all([
        supabase.from('participants').select('id, participant_number, organisation_short_name, organisation_name').eq('proposal_id', proposalId).order('participant_number'),
        supabase.from('ls_participant_budget').select('participant_id, is_locked, locked_by, locked_at').eq('proposal_id', proposalId),
        supabase.from('user_roles').select('user_id, role').eq('proposal_id', proposalId),
        supabase.from('ls_budget_permission_overrides').select('participant_id, user_id, can_edit').eq('proposal_id', proposalId),
      ]);
      for (const res of [participantsRes, budgetsRes, rolesRes, overridesRes]) {
        if (res.error) throw res.error;
      }

      const participantIds = (participantsRes.data ?? []).map(participant => participant.id);
      let participantMembers: ParticipantMemberRow[] = [];
      if (participantIds.length) {
        const { data, error } = await supabase.from('participant_members').select('participant_id, user_id, email').in('participant_id', participantIds);
        if (error) throw error;
        participantMembers = data ?? [];
      }

      const userIds = Array.from(new Set((rolesRes.data ?? []).map(row => row.user_id)));
      let profiles: { id: string; full_name: string | null; email: string | null }[] = [];
      if (userIds.length) {
        const { data, error } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
        if (error) throw error;
        profiles = data ?? [];
      }

      const members: ProposalMember[] = (rolesRes.data ?? []).map(row => {
        const profile = profiles.find(candidate => candidate.id === row.user_id);
        return { user_id: row.user_id, role: String(row.role), full_name: profile?.full_name ?? null, email: profile?.email ?? null };
      });

      return {
        participantIds,
        locks: (budgetsRes.data ?? []) as ParticipantLock[],
        members,
        overrides: (overridesRes.data ?? []) as PermissionOverride[],
        participantMembers,
      };
    },
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ACCESS_KEY(proposalId) }),
      queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY(proposalId) }),
      queryClient.invalidateQueries({ queryKey: ['ls-personnel', proposalId] }),
    ]);
  };

  const writeLock = async (participantId: string, locked: boolean) => {
    const { error } = await supabase
      .from('ls_participant_budget')
      .upsert(
        {
          proposal_id: proposalId,
          participant_id: participantId,
          is_locked: locked,
          locked_by: locked ? user?.id ?? null : null,
          locked_at: locked ? new Date().toISOString() : null,
        },
        { onConflict: 'participant_id' },
      );
    if (error) throw error;
  };

  const setLock = useMutation({
    mutationFn: ({ participantId, locked }: { participantId: string; locked: boolean }) => writeLock(participantId, locked),
    onSuccess: invalidate,
    onError: fail('Could not change the lock'),
  });

  const setLockAll = useMutation({
    mutationFn: async (locked: boolean) => {
      for (const participantId of query.data?.participantIds ?? []) {
        await writeLock(participantId, locked);
      }
    },
    onSuccess: invalidate,
    onError: fail('Could not change the locks'),
  });

  const setOverride = useMutation({
    mutationFn: async ({ participantId, userId, canEdit }: { participantId: string; userId: string; canEdit: boolean }) => {
      const { error } = await supabase
        .from('ls_budget_permission_overrides')
        .upsert({ proposal_id: proposalId, participant_id: participantId, user_id: userId, can_edit: canEdit, set_by: user?.id ?? null }, { onConflict: 'participant_id,user_id' });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: fail('Could not change the permission'),
  });

  const clearOverride = useMutation({
    mutationFn: async ({ participantId, userId }: { participantId: string; userId: string }) => {
      const { error } = await supabase.from('ls_budget_permission_overrides').delete().eq('participant_id', participantId).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: fail('Could not reset the permission'),
  });

  const locks = query.data?.locks ?? [];
  const participantIds = query.data?.participantIds ?? [];
  const lockedCount = participantIds.filter(id => locks.find(lock => lock.participant_id === id)?.is_locked).length;
  const lockState: 'none' | 'some' | 'all' = lockedCount === 0 ? 'none' : lockedCount === participantIds.length ? 'all' : 'some';

  return {
    data: query.data,
    loading: query.isLoading,
    lockFor: (participantId: string) => locks.find(lock => lock.participant_id === participantId) ?? null,
    lockState,
    lockedCount,
    participantCount: participantIds.length,
    setLock: (participantId: string, locked: boolean) => setLock.mutate({ participantId, locked }),
    setLockAll: (locked: boolean) => setLockAll.mutate(locked),
    setOverride: (participantId: string, userId: string, canEdit: boolean) => setOverride.mutate({ participantId, userId, canEdit }),
    clearOverride: (participantId: string, userId: string) => clearOverride.mutate({ participantId, userId }),
  };
}
