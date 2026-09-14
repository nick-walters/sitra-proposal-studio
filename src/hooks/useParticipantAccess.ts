import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

/**
 * Access, locking and per-participant permission overrides for A2 participant
 * information. Deliberately a sibling of useLumpSumBudgetAccess: same shape,
 * same conventions, but a SEPARATE override table
 * (participant_info_permission_overrides) so that granting someone budget
 * rights never grants them the right to edit an organisation's identity,
 * contacts or researchers.
 */
const ACCESS_KEY = (proposalId: string) => ['a2-access', proposalId] as const;

export type ParticipantInfoLock = {
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

export function useParticipantAccess(proposalId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ACCESS_KEY(proposalId),
    enabled: Boolean(proposalId),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [participantsRes, rolesRes, overridesRes, editableRes] = await Promise.all([
        supabase
          .from('participants')
          .select('id, participant_number, organisation_short_name, organisation_name, info_locked, info_locked_by, info_locked_at')
          .eq('proposal_id', proposalId)
          .order('participant_number'),
        supabase.from('user_roles').select('user_id, role').eq('proposal_id', proposalId),
        supabase
          .from('participant_info_permission_overrides')
          .select('participant_id, user_id, can_edit')
          .eq('proposal_id', proposalId),
        // ONE call for the whole proposal, never one per participant.
        supabase.rpc('info_editable_participant_ids', { _proposal_id: proposalId }),
      ]);
      for (const res of [participantsRes, rolesRes, overridesRes, editableRes]) {
        if (res.error) throw res.error;
      }

      const participants = participantsRes.data ?? [];
      const participantIds = participants.map(participant => participant.id);

      let participantMembers: ParticipantMemberRow[] = [];
      if (participantIds.length) {
        const { data, error } = await supabase
          .from('participant_members')
          .select('participant_id, user_id, email')
          .in('participant_id', participantIds);
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
        return {
          user_id: row.user_id,
          role: String(row.role),
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? null,
        };
      });

      const locks: ParticipantInfoLock[] = participants.map(participant => ({
        participant_id: participant.id,
        is_locked: Boolean(participant.info_locked),
        locked_by: participant.info_locked_by ?? null,
        locked_at: participant.info_locked_at ?? null,
      }));

      const editableRows = (editableRes.data ?? []) as unknown;
      const editableIds = Array.isArray(editableRows)
        ? editableRows.map(row => (typeof row === 'string' ? row : String((row as { id?: string })?.id ?? '')))
            .filter(Boolean)
        : [];

      return {
        participantIds,
        locks,
        members,
        overrides: (overridesRes.data ?? []) as PermissionOverride[],
        participantMembers,
        editableIds,
      };
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ACCESS_KEY(proposalId) });
  };

  type AccessData = NonNullable<typeof query.data>;

  /** Paint the new lock state straight away so every lock icon flips on click. */
  const patchLockCache = (participantIds: string[], locked: boolean) => {
    queryClient.setQueryData(ACCESS_KEY(proposalId), (current: AccessData | undefined) => {
      if (!current) return current;
      const stamp = locked ? new Date().toISOString() : null;
      const next = [...current.locks];
      for (const participantId of participantIds) {
        const index = next.findIndex(lock => lock.participant_id === participantId);
        const row: ParticipantInfoLock = {
          participant_id: participantId,
          is_locked: locked,
          locked_by: locked ? user?.id ?? null : null,
          locked_at: stamp,
        };
        if (index >= 0) next[index] = { ...next[index], ...row };
        else next.push(row);
      }
      return { ...current, locks: next };
    });
  };

  const writeLocks = async (participantIds: string[], locked: boolean) => {
    if (!participantIds.length) return;
    const { error } = await supabase
      .from('participants')
      .update({
        info_locked: locked,
        info_locked_by: locked ? user?.id ?? null : null,
        info_locked_at: locked ? new Date().toISOString() : null,
      })
      .eq('proposal_id', proposalId)
      .in('id', participantIds);
    if (error) throw error;
  };

  const setLock = useMutation({
    mutationFn: ({ participantId, locked }: { participantId: string; locked: boolean }) => writeLocks([participantId], locked),
    onMutate: ({ participantId, locked }: { participantId: string; locked: boolean }) => patchLockCache([participantId], locked),
    onSettled: invalidate,
    onError: fail('Could not change the lock'),
  });

  const setLockAll = useMutation({
    mutationFn: (locked: boolean) => writeLocks(query.data?.participantIds ?? [], locked),
    onMutate: (locked: boolean) => patchLockCache(query.data?.participantIds ?? [], locked),
    onSettled: invalidate,
    onError: fail('Could not change the locks'),
  });

  const setOverride = useMutation({
    mutationFn: async ({ participantId, userId, canEdit }: { participantId: string; userId: string; canEdit: boolean }) => {
      const { error } = await supabase
        .from('participant_info_permission_overrides')
        .upsert(
          { proposal_id: proposalId, participant_id: participantId, user_id: userId, can_edit: canEdit, created_by: user?.id ?? null },
          { onConflict: 'participant_id,user_id' },
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: fail('Could not change the permission'),
  });

  const clearOverride = useMutation({
    mutationFn: async ({ participantId, userId }: { participantId: string; userId: string }) => {
      const { error } = await supabase
        .from('participant_info_permission_overrides')
        .delete()
        .eq('participant_id', participantId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: fail('Could not reset the permission'),
  });

  const locks = query.data?.locks ?? [];
  const participantIds = query.data?.participantIds ?? [];
  const editableIds = query.data?.editableIds ?? [];
  const lockedCount = participantIds.filter(id => locks.find(lock => lock.participant_id === id)?.is_locked).length;
  const lockState: 'none' | 'some' | 'all' = lockedCount === 0
    ? 'none'
    : lockedCount === participantIds.length ? 'all' : 'some';

  const isLocked = (participantId: string) =>
    Boolean(locks.find(lock => lock.participant_id === participantId)?.is_locked);

  return {
    data: query.data,
    loading: query.isLoading,
    lockFor: (participantId: string) => locks.find(lock => lock.participant_id === participantId) ?? null,
    isLocked,
    /** Edit rights for a participant's information: never while locked. */
    canEditParticipant: (participantId: string) => !isLocked(participantId) && editableIds.includes(participantId),
    editableIds,
    lockState,
    lockedCount,
    participantCount: participantIds.length,
    setLock: (participantId: string, locked: boolean) => setLock.mutate({ participantId, locked }),
    setLockAll: (locked: boolean) => setLockAll.mutate(locked),
    setOverride: (participantId: string, userId: string, canEdit: boolean) => setOverride.mutate({ participantId, userId, canEdit }),
    clearOverride: (participantId: string, userId: string) => clearOverride.mutate({ participantId, userId }),
  };
}
