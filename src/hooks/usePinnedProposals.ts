import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const MAX_PINNED = 3;

export function usePinnedProposals(userId: string | undefined) {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const savingRef = useRef(false);
  const pendingRef = useRef<string[] | null>(null);

  // Load from database on mount / userId change
  useEffect(() => {
    if (!userId) { setPinnedIds([]); setLoaded(false); return; }

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('pinned_proposals')
        .select('proposal_id, order_index')
        .eq('user_id', userId)
        .order('order_index', { ascending: true });

      if (!cancelled && data) {
        setPinnedIds(data.map(r => r.proposal_id));
      }
      if (!cancelled) setLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [userId]);

  const persistToDb = useCallback(async (ids: string[]) => {
    if (!userId) return;
    if (savingRef.current) {
      // Queue latest state instead of dropping
      pendingRef.current = ids;
      return;
    }
    savingRef.current = true;
    try {
      await supabase.from('pinned_proposals').delete().eq('user_id', userId);
      if (ids.length > 0) {
        await supabase.from('pinned_proposals').insert(
          ids.map((proposalId, i) => ({
            user_id: userId,
            proposal_id: proposalId,
            order_index: i,
          }))
        );
      }
    } finally {
      savingRef.current = false;
      // Flush queued state
      if (pendingRef.current !== null) {
        const queued = pendingRef.current;
        pendingRef.current = null;
        persistToDb(queued);
      }
    }
  }, [userId]);

  const togglePin = useCallback((proposalId: string) => {
    setPinnedIds(prev => {
      let next: string[];
      if (prev.includes(proposalId)) {
        next = prev.filter(id => id !== proposalId);
      } else {
        if (prev.length >= MAX_PINNED) return prev;
        next = [...prev, proposalId];
      }
      persistToDb(next);
      return next;
    });
  }, [persistToDb]);

  const isPinned = useCallback((proposalId: string) => {
    return pinnedIds.includes(proposalId);
  }, [pinnedIds]);

  const canPin = pinnedIds.length < MAX_PINNED;

  const reorderPinned = useCallback((fromIndex: number, toIndex: number) => {
    setPinnedIds(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      persistToDb(next);
      return next;
    });
  }, [persistToDb]);

  return { pinnedIds, togglePin, isPinned, canPin, reorderPinned };
}
