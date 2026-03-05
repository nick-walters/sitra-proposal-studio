import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Manages section visibility locks for a proposal.
 * Locked sections are hidden from non-coordinator users.
 */
export function useSectionVisibility(proposalId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lockedSections, setLockedSections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Fetch locked sections
  useEffect(() => {
    if (!proposalId) {
      setLoading(false);
      return;
    }

    const fetchLocks = async () => {
      const { data, error } = await supabase
        .from('section_visibility_locks')
        .select('section_id')
        .eq('proposal_id', proposalId);

      if (error) {
        console.error('Error fetching visibility locks:', error);
      } else {
        setLockedSections(new Set((data || []).map(d => d.section_id)));
      }
      setLoading(false);
    };

    fetchLocks();

    // Realtime subscription
    const channel = supabase
      .channel(`visibility-locks-${proposalId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'section_visibility_locks',
        filter: `proposal_id=eq.${proposalId}`,
      }, () => {
        fetchLocks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId]);

  const toggleLock = useCallback(async (sectionId: string) => {
    if (!proposalId || !user?.id) return;

    const isCurrentlyLocked = lockedSections.has(sectionId);

    try {
      if (isCurrentlyLocked) {
        const { error } = await supabase
          .from('section_visibility_locks')
          .delete()
          .eq('proposal_id', proposalId)
          .eq('section_id', sectionId);
        if (error) throw error;
        setLockedSections(prev => {
          const next = new Set(prev);
          next.delete(sectionId);
          return next;
        });
        toast.success('Section unlocked — now visible to all users');
      } else {
        const { error } = await supabase
          .from('section_visibility_locks')
          .insert({ proposal_id: proposalId, section_id: sectionId, locked_by: user.id });
        if (error) throw error;
        setLockedSections(prev => new Set([...prev, sectionId]));
        toast.success('Section locked — hidden from editors and viewers');
      }
    } catch (err) {
      console.error('Error toggling visibility lock:', err);
      toast.error('Failed to update section visibility');
    }
  }, [proposalId, user?.id, lockedSections]);

  return { lockedSections, toggleLock, loading };
}
