import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/templates';

interface UserRoleState {
  isOwner: boolean;
  isAdmin: boolean;
  isAdminOrOwner: boolean;
  loading: boolean;
}

export function useUserRole(): UserRoleState {
  const [state, setState] = useState<UserRoleState>({
    isOwner: false,
    isAdmin: false,
    isAdminOrOwner: false,
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
          loading: false,
        });
        return;
      }

      // Check for owner role (global, proposal_id is null or check for any owner role)
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) {
        setState({
          isOwner: false,
          isAdmin: false,
          isAdminOrOwner: false,
          loading: false,
        });
        return;
      }

      const roleSet = new Set(roles?.map(r => r.role) || []);
      const isOwner = roleSet.has('owner');
      const isAdmin = roleSet.has('admin');

      setState({
        isOwner,
        isAdmin,
        isAdminOrOwner: isOwner || isAdmin,
        loading: false,
      });
    };

    checkRoles();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkRoles();
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
