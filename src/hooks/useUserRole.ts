import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/templates';

interface UserRoleState {
  isOwner: boolean;
  isAdmin: boolean;
  isAdminOrOwner: boolean;
  isGlobalAdmin: boolean;
  hasAnyCoordinatorRole: boolean;
  loading: boolean;
}

export function useUserRole(): UserRoleState {
  const [state, setState] = useState<UserRoleState>({
    isOwner: false,
    isAdmin: false,
    isAdminOrOwner: false,
    isGlobalAdmin: false,
    hasAnyCoordinatorRole: false,
    loading: true,
  });

  useEffect(() => {
    const checkRoles = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState({
          isOwner: false,
          isAdmin: false,
          isAdminOrOwner: false,
          isGlobalAdmin: false,
          hasAnyCoordinatorRole: false,
          loading: false,
        });
        return;
      }

      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('role, proposal_id')
        .eq('user_id', user.id);

      if (error) {
        setState({
          isOwner: false,
          isAdmin: false,
          isAdminOrOwner: false,
          isGlobalAdmin: false,
          hasAnyCoordinatorRole: false,
          loading: false,
        });
        return;
      }

      const globalRoles = (roles || []).filter(r => !r.proposal_id).map(r => r.role);
      const proposalRoles = (roles || []).filter(r => r.proposal_id).map(r => r.role);
      
      const isOwner = globalRoles.includes('owner');
      const isGlobalAdmin = globalRoles.includes('admin');
      const hasAnyCoordinatorRole = proposalRoles.includes('coordinator') || isOwner || isGlobalAdmin;

      setState({
        isOwner,
        isAdmin: isOwner || isGlobalAdmin,
        isAdminOrOwner: isOwner || isGlobalAdmin,
        isGlobalAdmin,
        hasAnyCoordinatorRole,
        loading: false,
      });
    };

    checkRoles();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        checkRoles();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
