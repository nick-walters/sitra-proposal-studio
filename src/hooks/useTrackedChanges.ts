import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  acceptChange: (changeId: string) => Promise<void>;
  rejectChange: (changeId: string) => Promise<void>;
  acceptAllChanges: () => Promise<void>;
  rejectAllChanges: () => Promise<void>;
}

/**
 * Hook for persisting track changes to the database.
 * Loads changes when section is opened and saves changes as they occur.
 */
export function useTrackedChanges({
  proposalId,
  sectionId,
  enabled,
}: UseTrackedChangesProps): UseTrackedChangesReturn {
  const [changes, setChanges] = useState<TrackChange[]>([]);
  const [loading, setLoading] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef<TrackChange[]>([]);

  // Load changes from database when section is opened
  useEffect(() => {
    if (!proposalId || !sectionId) {
      setLoading(false);
      return;
    }

    const loadChanges = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('section_tracked_changes')
          .select('*')
          .eq('proposal_id', proposalId)
          .eq('section_id', sectionId)
          .order('created_at');

        if (error) throw error;

        const loadedChanges: TrackChange[] = (data || []).map((row) => ({
          id: row.change_id,
          type: row.change_type as 'insertion' | 'deletion',
          authorId: row.author_id || '',
          authorName: row.author_name,
          authorColor: row.author_color,
          timestamp: new Date(row.created_at),
          from: row.from_pos,
          to: row.to_pos,
          content: row.content || undefined,
        }));

        setChanges(loadedChanges);
        pendingChangesRef.current = loadedChanges;
      } catch (error) {
        console.error('Error loading tracked changes:', error);
      } finally {
        setLoading(false);
      }
    };

    loadChanges();
  }, [proposalId, sectionId]);

  // Debounced save function
  const saveChanges = useCallback(async (changesToSave: TrackChange[]) => {
    if (!proposalId || !sectionId) return;

    try {
      // Get current changes from DB to determine what needs to be added/removed
      const { data: existingData } = await supabase
        .from('section_tracked_changes')
        .select('change_id')
        .eq('proposal_id', proposalId)
        .eq('section_id', sectionId);

      const existingIds = new Set((existingData || []).map((r) => r.change_id));
      const newIds = new Set(changesToSave.map((c) => c.id));

      // Delete removed changes
      const toDelete = [...existingIds].filter((id) => !newIds.has(id));
      if (toDelete.length > 0) {
        await supabase
          .from('section_tracked_changes')
          .delete()
          .eq('proposal_id', proposalId)
          .eq('section_id', sectionId)
          .in('change_id', toDelete);
      }

      // Insert new changes
      const toInsert = changesToSave.filter((c) => !existingIds.has(c.id));
      if (toInsert.length > 0) {
        const rows = toInsert.map((c) => ({
          proposal_id: proposalId,
          section_id: sectionId,
          change_id: c.id,
          change_type: c.type,
          author_id: c.authorId || null,
          author_name: c.authorName,
          author_color: c.authorColor,
          from_pos: c.from,
          to_pos: c.to,
          content: c.content || null,
        }));

        await supabase.from('section_tracked_changes').insert(rows);
      }

      // Update existing changes (positions may have shifted)
      const toUpdate = changesToSave.filter((c) => existingIds.has(c.id));
      for (const change of toUpdate) {
        await supabase
          .from('section_tracked_changes')
          .update({
            from_pos: change.from,
            to_pos: change.to,
            content: change.content || null,
          })
          .eq('proposal_id', proposalId)
          .eq('section_id', sectionId)
          .eq('change_id', change.id);
      }
    } catch (error) {
      console.error('Error saving tracked changes:', error);
    }
  }, [proposalId, sectionId]);

  // Handle changes from the editor with debouncing
  const handleChangesUpdate = useCallback((newChanges: TrackChange[]) => {
    setChanges(newChanges);
    pendingChangesRef.current = newChanges;

    // Debounce save to avoid excessive DB writes
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveChanges(pendingChangesRef.current);
    }, 1000);
  }, [saveChanges]);

  // Accept a single change
  const acceptChange = useCallback(async (changeId: string) => {
    const newChanges = changes.filter((c) => c.id !== changeId);
    setChanges(newChanges);
    pendingChangesRef.current = newChanges;

    // Immediate delete for accept/reject actions
    await supabase
      .from('section_tracked_changes')
      .delete()
      .eq('proposal_id', proposalId)
      .eq('section_id', sectionId)
      .eq('change_id', changeId);
  }, [changes, proposalId, sectionId]);

  // Reject a single change
  const rejectChange = useCallback(async (changeId: string) => {
    const newChanges = changes.filter((c) => c.id !== changeId);
    setChanges(newChanges);
    pendingChangesRef.current = newChanges;

    await supabase
      .from('section_tracked_changes')
      .delete()
      .eq('proposal_id', proposalId)
      .eq('section_id', sectionId)
      .eq('change_id', changeId);
  }, [changes, proposalId, sectionId]);

  // Accept all changes
  const acceptAllChanges = useCallback(async () => {
    setChanges([]);
    pendingChangesRef.current = [];

    await supabase
      .from('section_tracked_changes')
      .delete()
      .eq('proposal_id', proposalId)
      .eq('section_id', sectionId);
  }, [proposalId, sectionId]);

  // Reject all changes
  const rejectAllChanges = useCallback(async () => {
    setChanges([]);
    pendingChangesRef.current = [];

    await supabase
      .from('section_tracked_changes')
      .delete()
      .eq('proposal_id', proposalId)
      .eq('section_id', sectionId);
  }, [proposalId, sectionId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        // Save any pending changes before unmounting
        if (pendingChangesRef.current.length > 0) {
          saveChanges(pendingChangesRef.current);
        }
      }
    };
  }, [saveChanges]);

  return {
    changes,
    loading,
    handleChangesUpdate,
    acceptChange,
    rejectChange,
    acceptAllChanges,
    rejectAllChanges,
  };
}
