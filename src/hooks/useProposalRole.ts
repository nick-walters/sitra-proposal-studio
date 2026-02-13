import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type ProposalRoleTier = 'coordinator' | 'editor' | 'viewer' | 'none';

/**
 * Returns the current user's effective role tier for a specific proposal.
 * - coordinator: coordinator, admin, or owner
 * - editor: editor role
 * - viewer: viewer role
 * - none: no role on this proposal
 */
export function useProposalRole(proposalId: string | undefined): {
  roleTier: ProposalRoleTier;
  loading: boolean;
} {
  const { user } = useAuth();
  const [roleTier, setRoleTier] = useState<ProposalRoleTier>('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !proposalId) {
      setRoleTier('none');
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      setLoading(true);

      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('role, proposal_id')
        .eq('user_id', user.id);

      if (error || !roles) {
        setRoleTier('none');
        setLoading(false);
        return;
      }

      // Check global roles first
      const globalRoles = roles.filter(r => !r.proposal_id).map(r => r.role);
      if (globalRoles.includes('owner') || globalRoles.includes('admin')) {
        setRoleTier('coordinator');
        setLoading(false);
        return;
      }

      // Check proposal-specific role
      const proposalRoles = roles
        .filter(r => r.proposal_id === proposalId)
        .map(r => r.role);

      if (proposalRoles.includes('coordinator')) {
        setRoleTier('coordinator');
      } else if (proposalRoles.includes('editor')) {
        setRoleTier('editor');
      } else if (proposalRoles.includes('viewer')) {
        setRoleTier('viewer');
      } else {
        setRoleTier('none');
      }

      setLoading(false);
    };

    fetchRole();
  }, [user?.id, proposalId]);

  return { roleTier, loading };
}
