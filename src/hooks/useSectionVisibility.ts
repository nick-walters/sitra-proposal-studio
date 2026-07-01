import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Independent-subsection lock model:
//  - Locks are stored per subsection (individual rows).
//  - Locking a major section writes a row for EACH child.
//  - Unlocking one child leaves siblings locked.
//  - The major-section icon is DERIVED from children (all locked = locked).
//  - Legacy 'part-a' / 'part-b' rows are auto-migrated on load.
export const PART_A_CHILD_IDS = ['a1', 'a2', 'a3', 'a4', 'a5'] as const;
export const PART_B_CHILD_IDS = ['b1-1', 'b1-2', 'b2-1', 'b2-2', 'b3-1', 'b3-2'] as const;

function childrenOfMajor(sectionId: string): readonly string[] | null {
  if (sectionId === 'part-a') return PART_A_CHILD_IDS;
  if (sectionId === 'part-b') return PART_B_CHILD_IDS;
  return null;
}

export function useSectionVisibility(proposalId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lockedSections, setLockedSections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
        return;
      }

      const ids = new Set((data || []).map(d => d.section_id));

      // Migrate legacy 'part-a' / 'part-b' rows -> expand to per-child rows.
      const hasLegacyA = ids.has('part-a');
      const hasLegacyB = ids.has('part-b');
      if (hasLegacyA || hasLegacyB) {
        try {
          if (user?.id) {
            const inserts: { proposal_id: string; section_id: string; locked_by: string }[] = [];
            if (hasLegacyA) {
              for (const c of PART_A_CHILD_IDS) if (!ids.has(c)) inserts.push({ proposal_id: proposalId, section_id: c, locked_by: user.id });
            }
            if (hasLegacyB) {
              for (const c of PART_B_CHILD_IDS) if (!ids.has(c)) inserts.push({ proposal_id: proposalId, section_id: c, locked_by: user.id });
            }
            if (inserts.length) {
              await supabase.from('section_visibility_locks').upsert(inserts, { onConflict: 'proposal_id,section_id', ignoreDuplicates: true });
            }
          }
          await supabase
            .from('section_visibility_locks')
            .delete()
            .eq('proposal_id', proposalId)
            .in('section_id', ['part-a', 'part-b']);
          if (hasLegacyA) { ids.delete('part-a'); PART_A_CHILD_IDS.forEach(c => ids.add(c)); }
          if (hasLegacyB) { ids.delete('part-b'); PART_B_CHILD_IDS.forEach(c => ids.add(c)); }
        } catch (e) {
          console.warn('Legacy lock-row migration failed (non-fatal):', e);
        }
      }

      setLockedSections(ids);
      setLoading(false);
    };

    fetchLocks();

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
  }, [proposalId, user?.id]);

  const toggleLock = useCallback(async (sectionId: string) => {
    if (!proposalId || !user?.id) return;

    const children = childrenOfMajor(sectionId);

    try {
      if (children) {
        // Major section: derived state — locked iff ALL children currently locked.
        const allLocked = children.every(c => lockedSections.has(c));
        if (allLocked) {
          // Unlock: delete every child row.
          const { error } = await supabase
            .from('section_visibility_locks')
            .delete()
            .eq('proposal_id', proposalId)
            .in('section_id', children as unknown as string[]);
          if (error) throw error;
          setLockedSections(prev => {
            const next = new Set(prev);
            children.forEach(c => next.delete(c));
            return next;
          });
          toast.success('Section unlocked — now visible to all users');
        } else {
          // Lock: insert a row for each child that is not yet locked.
          const rows = children
            .filter(c => !lockedSections.has(c))
            .map(c => ({ proposal_id: proposalId, section_id: c, locked_by: user.id }));
          if (rows.length) {
            const { error } = await supabase
              .from('section_visibility_locks')
              .upsert(rows, { onConflict: 'proposal_id,section_id', ignoreDuplicates: true });
            if (error) throw error;
          }
          setLockedSections(prev => {
            const next = new Set(prev);
            children.forEach(c => next.add(c));
            return next;
          });
          toast.success('Section locked — hidden from editors and viewers');
        }
      } else {
        // Individual subsection toggle.
        const isCurrentlyLocked = lockedSections.has(sectionId);
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
          setLockedSections(prev => {
            const next = new Set(prev);
            next.add(sectionId);
            return next;
          });
          toast.success('Section locked — hidden from editors and viewers');
        }
      }
    } catch (err) {
      console.error('Error toggling visibility lock:', err);
      toast.error('Failed to update section visibility');
    }
  }, [proposalId, user?.id, lockedSections]);

  return { lockedSections, toggleLock, loading };
}
