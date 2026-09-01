import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProposalRole } from '@/hooks/useProposalRole';

const QUERY_KEY = (proposalId: string) => ['ls-personnel-permissions', proposalId] as const;

export function useCanEditParticipantBudget(proposalId: string) {
  const { user } = useAuth();
  const { roleTier, loading: roleLoading } = useProposalRole(proposalId);
  const isCoordinator = roleTier === 'coordinator';

  const query = useQuery({
    queryKey: QUERY_KEY(proposalId),
    enabled: Boolean(proposalId && user?.id && !roleLoading),
    queryFn: async () => {
      const { data: participants, error } = await supabase
        .from('participants')
        .select('id')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;

      const editable = await Promise.all(
        (participants ?? []).map(async (participant) => {
          const { data, error: rpcError } = await supabase.rpc('can_edit_participant_budget', {
            _user_id: user?.id ?? '',
            _participant_id: participant.id,
          });
          if (rpcError) throw rpcError;
          return data ? participant.id : null;
        }),
      );
      return new Set(editable.filter((id): id is string => Boolean(id)));
    },
  });

  return {
    editableParticipantIds: query.data ?? new Set<string>(),
    isCoordinator,
    loading: roleLoading || query.isLoading,
    error: query.error,
  };
}
