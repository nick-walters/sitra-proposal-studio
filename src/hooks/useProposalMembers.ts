import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProposalMember {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url?: string | null;
}

/**
 * Everyone holding a role on a proposal — the people who can be @tagged in a
 * comment or given one to deal with. Read from `user_roles` and the public
 * `profiles_basic` view, so no private profile fields are exposed.
 */
export function useProposalMembers(proposalId?: string) {
  return useQuery({
    queryKey: ['proposal-members', proposalId],
    enabled: !!proposalId,
    staleTime: 60_000,
    queryFn: async (): Promise<ProposalMember[]> => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('proposal_id', proposalId!);
      if (error) throw error;

      const ids = [...new Set((data ?? []).map((r) => r.user_id))];
      if (ids.length === 0) return [];

      const { data: profiles, error: pErr } = await supabase
        .from('profiles_basic')
        .select('id, full_name, email, avatar_url')
        .in('id', ids);
      if (pErr) throw pErr;

      return (profiles ?? []).map((p) => ({
        id: p.id as string,
        full_name: (p.full_name as string | null) ?? null,
        email: (p.email as string) ?? '',
        avatar_url: (p.avatar_url as string | null) ?? null,
      }));
    },
  });
}
