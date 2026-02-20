import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'pinned-proposals';
const MAX_PINNED = 3;

export function usePinnedProposals(userId: string | undefined) {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    if (!userId) return;
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}-${userId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setPinnedIds(parsed.slice(0, MAX_PINNED));
      }
    } catch {
      // ignore
    }
  }, [userId]);

  const persist = useCallback((ids: string[]) => {
    if (!userId) return;
    localStorage.setItem(`${STORAGE_KEY}-${userId}`, JSON.stringify(ids));
  }, [userId]);

  const togglePin = useCallback((proposalId: string) => {
    setPinnedIds(prev => {
      let next: string[];
      if (prev.includes(proposalId)) {
        next = prev.filter(id => id !== proposalId);
      } else {
        if (prev.length >= MAX_PINNED) return prev; // silently refuse
        next = [...prev, proposalId];
      }
      persist(next);
      return next;
    });
  }, [persist]);

  const isPinned = useCallback((proposalId: string) => {
    return pinnedIds.includes(proposalId);
  }, [pinnedIds]);

  const canPin = pinnedIds.length < MAX_PINNED;

  const reorderPinned = useCallback((fromIndex: number, toIndex: number) => {
    setPinnedIds(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      persist(next);
      return next;
    });
  }, [persist]);

  return { pinnedIds, togglePin, isPinned, canPin, reorderPinned };
}
