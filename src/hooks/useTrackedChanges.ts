import { useState, useCallback } from 'react';
import { TrackChange } from '@/extensions/TrackChanges';

interface UseTrackedChangesProps {
  proposalId: string;
  sectionId: string;
  enabled: boolean;
}

interface UseTrackedChangesReturn {
  changes: TrackChange[];
  loading: boolean;
  handleChangesUpdate: (newChanges: TrackChange[]) => void;
}

/**
 * Hook for managing track changes state.
 * Changes are now stored as marks in the document content itself,
 * so they persist automatically via the section content save mechanism.
 * This hook just manages the UI state.
 */
export function useTrackedChanges({
  proposalId,
  sectionId,
  enabled,
}: UseTrackedChangesProps): UseTrackedChangesReturn {
  const [changes, setChanges] = useState<TrackChange[]>([]);

  const handleChangesUpdate = useCallback((newChanges: TrackChange[]) => {
    setChanges(newChanges);
  }, []);

  return {
    changes,
    loading: false,
    handleChangesUpdate,
  };
}
