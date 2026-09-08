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
    // Permissions change rarely, and the permissions dialog invalidates this
    // key directly whenever a coordinator changes an override, so a short
    // cache plus a focus refetch is enough — no polling.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // One call for the whole proposal. The database function applies exactly
      // the same rules as can_edit_participant_budget, evaluated set-wise.
      const { data, error } = await supabase.rpc('editable_participant_ids', {
        _proposal_id: proposalId,
      });
      if (error) throw error;
      const ids = (data ?? []) as unknown as string[];
      return new Set(ids);
    },
  });

  return {
    editableParticipantIds: query.data ?? new Set<string>(),
    isCoordinator,
    loading: roleLoading || query.isLoading,
    error: query.error,
  };
}
