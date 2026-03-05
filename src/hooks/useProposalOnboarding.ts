import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Triggers first-access onboarding for a proposal:
 * welcome message, starter tasks, and notifications.
 */
export function useProposalOnboarding(proposalId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const calledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || !proposalId) return;
    // Only call once per proposalId per session
    const key = `${proposalId}-${user.id}`;
    if (calledRef.current === key) return;
    calledRef.current = key;

    const run = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboard-user`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ proposalId }),
          }
        );
        const result = await res.json();
        if (result.success) {
          // Refresh messages, tasks, notifications
          queryClient.invalidateQueries({ queryKey: ['proposal-messages', proposalId] });
          queryClient.invalidateQueries({ queryKey: ['proposal-tasks', proposalId] });
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      } catch (err) {
        console.error('Onboarding error:', err);
      }
    };

    run();
  }, [user?.id, proposalId, queryClient]);
}
