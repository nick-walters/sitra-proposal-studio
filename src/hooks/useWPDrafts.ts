import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { stripWordHtml } from '@/lib/stripWordHtml';
import {
  saveVersionedRow,
  reorderVersionedRows,
  deleteAndResequence,
  moveChildToWpRpc,
  type ReorderItem,
} from '@/lib/versionedSave';


/** Options shared by both WP hooks. */
export interface WPDraftHookOptions {
  /**
   * Called when a save is rejected because the row moved on. Receives the text
   * the user was trying to write so it can be offered back for copying.
   */
  onConflict?: (lostValue: unknown) => void;
}

/** Picks the first string in a patch, for the "here is what you typed" dialog. */
function firstTextValue(updates: Record<string, any>): unknown {
  const entry = Object.values(updates || {}).find(v => typeof v === 'string' && v.trim() !== '');
  return entry ?? null;
}

// Legacy name retained for call-site stability — delegates to the shared
// DOM-based cleaner. Preserves custom cross-ref nodes and keeps basic
// formatting; strips Word/MSO junk.
function stripWordXml(html: string): string {
  if (!html || typeof html !== 'string') return html;
  return stripWordHtml(html);
}


export interface WPDraftTask {
  id: string;
  wp_draft_id: string;
  number: number;
  title: string | null;
  description: string | null;
  lead_participant_id: string | null;
  start_month: number | null;
  end_month: number | null;
  order_index: number;
  version: number;
  participants?: { participant_id: string }[];
  effort?: { participant_id: string; person_months: number }[];
}

export interface WPDraftDeliverable {
  id: string;
  wp_draft_id: string;
  number: number;
  title: string | null;
  type: string | null;
  dissemination_level: string | null;
  responsible_participant_id: string | null;
  due_month: number | null;
  description: string | null;
  order_index: number;
  version: number;
}

export interface WPDraft {
  id: string;
  proposal_id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  lead_participant_id: string | null;
  objectives: string | null;
  description_before_tasks: string | null;
  color: string;
  theme_id: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
  version: number;
  tasks?: WPDraftTask[];
  deliverables?: WPDraftDeliverable[];
}

export function useWPDrafts(proposalId: string | null, options?: WPDraftHookOptions) {
  const onConflict = options?.onConflict;
  const [wpDrafts, setWPDrafts] = useState<WPDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWPDrafts = useCallback(async () => {
    if (!proposalId) {
      setWPDrafts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('wp_drafts')
        .select(`
          *,
          tasks:wp_draft_tasks(
            *,
            participants:wp_draft_task_participants(participant_id),
            effort:wp_draft_task_effort(participant_id, person_months)
          ),
          deliverables:wp_draft_deliverables(*)
        `)
        .eq('proposal_id', proposalId)
        .order('order_index');

      if (fetchError) throw fetchError;

      const sortedData = (data || []).map(wp => ({
        ...wp,
        tasks: (wp.tasks || []).sort((a: WPDraftTask, b: WPDraftTask) => a.order_index - b.order_index),
        deliverables: (wp.deliverables || []).sort((a: WPDraftDeliverable, b: WPDraftDeliverable) => a.order_index - b.order_index),
      }));

      setWPDrafts(sortedData);
    } catch (err) {
      console.error('Error fetching WP drafts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch WP drafts');
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    fetchWPDrafts();
  }, [fetchWPDrafts]);

  const updateWPDraft = useCallback(async (wpId: string, updates: Partial<WPDraft>) => {
    const known = wpDrafts.find(wp => wp.id === wpId);
    const res = await saveVersionedRow('wp_drafts', wpId, updates as any, known?.version ?? null);
    if (res.conflict) {
      toast.error('This work package was changed elsewhere — reloading the latest version.');
      onConflict?.(firstTextValue(updates));
      await fetchWPDrafts();
      return false;
    }
    if (!res.ok) {
      console.error('Error updating WP draft:', res.error);
      toast.error('Failed to update work package');
      return false;
    }
    setWPDrafts(prev => prev.map(wp =>
      wp.id === wpId ? { ...wp, ...updates, version: res.version ?? wp.version } : wp
    ));
    return true;
  }, [wpDrafts, fetchWPDrafts, onConflict]);


  const addWPDraft = useCallback(async () => {
    if (!proposalId) return null;

    try {
      const nextNumber = wpDrafts.length > 0
        ? Math.max(...wpDrafts.map(wp => wp.number)) + 1
        : 1;

      const { data, error } = await supabase
        .from('wp_drafts')
        .insert({
          proposal_id: proposalId,
          number: nextNumber,
          order_index: wpDrafts.length,
        })
        .select()
        .single();

      if (error) throw error;

      const tasksToCreate = [1, 2, 3].map(num => ({
        wp_draft_id: data.id,
        number: num,
        order_index: num - 1,
      }));

      const deliverablesToCreate = [1, 2, 3].map(num => ({
        wp_draft_id: data.id,
        number: num,
        order_index: num - 1,
      }));

      await Promise.all([
        supabase.from('wp_draft_tasks').insert(tasksToCreate),
        supabase.from('wp_draft_deliverables').insert(deliverablesToCreate),
      ]);

      await fetchWPDrafts();
      return data;
    } catch (err) {
      console.error('Error adding WP draft:', err);
      toast.error('Failed to add work package');
      return null;
    }
  }, [proposalId, wpDrafts, fetchWPDrafts]);

  const deleteWPDraft = useCallback(async (wpId: string) => {
    // Delete and renumber the surviving work packages atomically.
    const known = wpDrafts.find(wp => wp.id === wpId);
    const res = await deleteAndResequence('wp_drafts', wpId, known?.version ?? null);
    if (!res.ok) {
      toast.error(res.conflict
        ? 'This work package changed elsewhere — it was not deleted. Reloading.'
        : (res.error || 'Failed to delete work package'));
      await fetchWPDrafts();
      return false;
    }
    await fetchWPDrafts();
    return true;
  }, [wpDrafts, fetchWPDrafts]);


  const reorderWPDrafts = useCallback(async (newOrder: string[]) => {
    const versionById = new Map(wpDrafts.map(wp => [wp.id, wp.version]));
    const items: ReorderItem[] = newOrder.map((id, index) => ({
      id,
      expected_version: versionById.get(id) ?? null,
      order_index: index,
      number: index + 1,
    }));

    const res = await reorderVersionedRows('wp_drafts', items);
    if (!res.ok) {
      if (res.conflict) {
        toast.error('Work packages changed elsewhere — the reorder was not applied. Reloading.');
      } else {
        console.error('Error reordering WP drafts:', res.error);
        toast.error('Failed to reorder work packages');
      }
      await fetchWPDrafts();
      return false;
    }

    await fetchWPDrafts();
    return true;
  }, [wpDrafts, fetchWPDrafts]);


  return {
    wpDrafts,
    loading,
    error,
    refetch: fetchWPDrafts,
    updateWPDraft,
    addWPDraft,
    deleteWPDraft,
    reorderWPDrafts,
  };
}

// Hook for a single WP draft with full editing capabilities
export function useWPDraftEditor(wpId: string | null, options?: WPDraftHookOptions) {
  const onConflict = options?.onConflict;
  const [wpDraft, setWPDraft] = useState<WPDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchWPDraft = useCallback(async () => {
    if (!wpId) {
      setWPDraft(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('wp_drafts')
        .select(`
          *,
          tasks:wp_draft_tasks(
            *,
            participants:wp_draft_task_participants(participant_id),
            effort:wp_draft_task_effort(participant_id, person_months)
          ),
          deliverables:wp_draft_deliverables(*),
          wp_effort:wp_draft_effort(participant_id, person_months)
        `)
        .eq('id', wpId)
        .single();

      if (error) throw error;

      const sortedTasks = (data.tasks || []).sort((a: WPDraftTask, b: WPDraftTask) => a.order_index - b.order_index);
      const sortedDeliverables = (data.deliverables || []).sort((a: WPDraftDeliverable, b: WPDraftDeliverable) => a.order_index - b.order_index);

      // NOTE: numbering is NOT repaired on load. Load-time repair writes are
      // what allowed a stale tab to silently revert a deliberate renumber.
      // Use `repairNumbering()` (explicit user gesture) instead.
      const htmlFields = ['objectives', 'description_before_tasks'] as const;
      const cleanedData = { ...data };
      for (const f of htmlFields) {
        if (cleanedData[f] && typeof cleanedData[f] === 'string') {
          cleanedData[f] = stripWordXml(cleanedData[f] as string);
        }
      }
      const cleanedTasks = sortedTasks.map((t: any) => ({
        ...t,
        description: t.description ? stripWordXml(t.description) : t.description,
      }));

      const sortedData = {
        ...cleanedData,
        tasks: cleanedTasks,
        deliverables: sortedDeliverables,
      };

      setWPDraft(sortedData);
    } catch (err) {
      console.error('Error fetching WP draft:', err);
      toast.error('Failed to load work package');
    } finally {
      setLoading(false);
    }
  }, [wpId]);

  useEffect(() => {
    fetchWPDraft();
  }, [fetchWPDraft]);

  const updateField = useCallback(async (field: keyof WPDraft, value: any) => {
    if (!wpId) return false;

    const htmlFields = ['objectives', 'description_before_tasks'];
    const cleanValue = htmlFields.includes(field) && typeof value === 'string' ? stripWordXml(value) : value;

    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveVersionedRow(
        'wp_drafts',
        wpId,
        { [field]: cleanValue },
        wpDraft?.version ?? null,
      );
      if (res.conflict) {
        setSaveError('Changed elsewhere — not saved');
        toast.error('This work package was changed elsewhere — your change was not saved.');
        onConflict?.(cleanValue);
        await fetchWPDraft();
        return false;
      }
      if (!res.ok) throw new Error(res.error || 'save failed');

      setWPDraft(prev => prev ? { ...prev, [field]: value, version: res.version ?? prev.version } : null);
      setLastSaved(new Date());
      return true;
    } catch (err) {
      console.error('Error updating WP field:', err);
      setSaveError('Failed to save changes');
      toast.error('Failed to save changes');
      return false;
    } finally {
      setSaving(false);
    }
  }, [wpId, wpDraft?.version, fetchWPDraft, onConflict]);

  /**
   * Shared all-or-nothing renumber for the child lists. Every row carries the
   * version this session loaded, so a stale tab cannot re-impose old numbering.
   */
  const applyOrder = useCallback(async (
    table: 'wp_draft_tasks' | 'wp_draft_deliverables',
    rows: { id: string; version: number }[],
    label: string,
  ) => {
    const items: ReorderItem[] = rows.map((r, index) => ({
      id: r.id,
      expected_version: r.version ?? null,
      number: index + 1,
      order_index: index,
    }));
    const res = await reorderVersionedRows(table, items);
    if (!res.ok) {
      if (res.conflict) {
        toast.error(`${label} changed elsewhere — the reorder was not applied. Reloading.`);
      } else {
        console.error(`Error reordering ${table}:`, res.error);
        toast.error(`Failed to reorder ${label.toLowerCase()}`);
      }
      await fetchWPDraft();
      return false;
    }
    await fetchWPDraft();
    return true;
  }, [fetchWPDraft]);

  // Task operations
  const addTask = useCallback(async () => {
    if (!wpDraft) return null;

    try {
      // Number and index are derived from the same list length so a pre-existing
      // gap cannot make them diverge.
      const existing = (wpDraft.tasks || []).length;
      const nextNumber = Math.max(
        existing + 1,
        ...(wpDraft.tasks || []).map(t => t.number + 1),
      );

      const { data, error } = await supabase
        .from('wp_draft_tasks')
        .insert({
          wp_draft_id: wpDraft.id,
          number: nextNumber,
          order_index: existing,
        })
        .select()
        .single();

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        tasks: [...(prev.tasks || []), { ...data, participants: [], effort: [] }],
      } : null);

      return data;
    } catch (err) {
      console.error('Error adding task:', err);
      toast.error('Failed to add task');
      return null;
    }
  }, [wpDraft]);

  const updateTask = useCallback(async (taskId: string, updates: Partial<WPDraftTask>) => {
    const known = wpDraft?.tasks?.find(t => t.id === taskId);
    const res = await saveVersionedRow('wp_draft_tasks', taskId, updates as any, known?.version ?? null);
    if (res.conflict) {
      toast.error('This task was changed elsewhere — your change was not saved.');
      onConflict?.(firstTextValue(updates as any));
      await fetchWPDraft();
      return false;
    }
    if (!res.ok) {
      console.error('Error updating task:', res.error);
      return false;
    }
    setWPDraft(prev => prev ? {
      ...prev,
      tasks: prev.tasks?.map(t => t.id === taskId ? { ...t, ...updates, version: res.version ?? t.version } : t),
    } : null);
    return true;
  }, [wpDraft?.tasks, fetchWPDraft, onConflict]);

  const deleteTask = useCallback(async (taskId: string) => {
    // Delete + renumber survivors in one transaction: a half-applied delete is
    // what used to leave gaps such as a T2.3 with no T2.2. `bin_target_row`
    // wraps that same call and first snapshots the row (and its effort,
    // participant and deliverable links) into the 90-day recycle bin.
    const known = (wpDraft?.tasks || []).find(t => t.id === taskId);
    const { data, error } = await supabase.rpc('bin_target_row', {
      p_target_type: 'wp_draft_task',
      p_target_id: taskId,
      p_expected_version: known?.version ?? undefined,
    });
    const res = (data || {}) as { ok?: boolean; conflict?: boolean; error?: string };
    if (error || !res.ok) {
      toast.error(res.conflict
        ? 'This task changed elsewhere — it was not deleted. Reloading.'
        : (error?.message || res.error || 'Failed to delete task'));
      await fetchWPDraft();
      return false;
    }
    await fetchWPDraft();
    return true;
  }, [wpDraft?.tasks, fetchWPDraft]);



  const reorderTasks = useCallback(async (newOrder: string[]) => {
    if (!wpDraft) return false;

    const byId = new Map((wpDraft.tasks || []).map(t => [t.id, t]));
    const previous = (wpDraft.tasks || []).map(t => ({ id: t.id, version: t.version }));
    const ok = await applyOrder(
      'wp_draft_tasks',
      newOrder.map(id => ({ id, version: byId.get(id)?.version ?? null as any })),
      'Tasks',
    );
    if (!ok) return false;

    toast.success('Tasks reordered', {
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: async () => {
          // Re-read versions: our own reorder has just bumped them.
          const { data } = await supabase
            .from('wp_draft_tasks')
            .select('id, version')
            .eq('wp_draft_id', wpDraft.id);
          const freshVersions = new Map((data || []).map((r: any) => [r.id, r.version]));
          const undone = await applyOrder(
            'wp_draft_tasks',
            previous.map(p => ({ id: p.id, version: freshVersions.get(p.id) ?? null as any })),
            'Tasks',
          );
          if (undone) toast.success('Reorder undone');
        },
      },
    });
    return true;
  }, [wpDraft, applyOrder]);


  // Deliverable operations
  const addDeliverable = useCallback(async () => {
    if (!wpDraft) return null;

    try {
      const existing = (wpDraft.deliverables || []).length;
      const nextNumber = Math.max(
        existing + 1,
        ...(wpDraft.deliverables || []).map(d => d.number + 1),
      );

      const { data, error } = await supabase
        .from('wp_draft_deliverables')
        .insert({
          wp_draft_id: wpDraft.id,
          number: nextNumber,
          order_index: existing,
        })
        .select()
        .single();

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        deliverables: [...(prev.deliverables || []), data],
      } : null);

      return data;
    } catch (err) {
      console.error('Error adding deliverable:', err);
      toast.error('Failed to add deliverable');
      return null;
    }
  }, [wpDraft]);

  const updateDeliverable = useCallback(async (deliverableId: string, updates: Partial<WPDraftDeliverable>) => {
    const known = wpDraft?.deliverables?.find(d => d.id === deliverableId);
    const res = await saveVersionedRow('wp_draft_deliverables', deliverableId, updates as any, known?.version ?? null);
    if (res.conflict) {
      toast.error('This deliverable was changed elsewhere — your change was not saved.');
      onConflict?.(firstTextValue(updates as any));
      await fetchWPDraft();
      return false;
    }
    if (!res.ok) {
      console.error('Error updating deliverable:', res.error);
      return false;
    }
    setWPDraft(prev => prev ? {
      ...prev,
      deliverables: prev.deliverables?.map(d =>
        d.id === deliverableId ? { ...d, ...updates, version: res.version ?? d.version } : d),
    } : null);
    return true;
  }, [wpDraft?.deliverables, fetchWPDraft, onConflict]);

  const deleteDeliverable = useCallback(async (deliverableId: string) => {
    const known = (wpDraft?.deliverables || []).find(d => d.id === deliverableId);
    const res = await deleteAndResequence('wp_draft_deliverables', deliverableId, known?.version ?? null);
    if (!res.ok) {
      toast.error(res.conflict
        ? 'This deliverable changed elsewhere — it was not deleted. Reloading.'
        : (res.error || 'Failed to delete deliverable'));
      await fetchWPDraft();
      return false;
    }
    await fetchWPDraft();
    return true;
  }, [wpDraft?.deliverables, fetchWPDraft]);



  const reorderDeliverables = useCallback(async (newOrder: string[]) => {
    if (!wpDraft) return false;
    const byId = new Map((wpDraft.deliverables || []).map(d => [d.id, d]));
    return applyOrder(
      'wp_draft_deliverables',
      newOrder.map(id => ({ id, version: byId.get(id)?.version ?? null as any })),
      'Deliverables',
    );
  }, [wpDraft, applyOrder]);


  // WP-level effort operations
  const updateWPEffort = useCallback(async (participantId: string, personMonths: number) => {
    if (!wpDraft) return false;
    try {
      const { error } = await supabase
        .from('wp_draft_effort')
        .upsert({
          wp_draft_id: wpDraft.id,
          participant_id: participantId,
          person_months: personMonths,
        }, {
          onConflict: 'wp_draft_id,participant_id',
        });

      if (error) throw error;

      setWPDraft(prev => {
        if (!prev) return null;
        const existingEffort = (prev as any).wp_effort || [];
        const existingIndex = existingEffort.findIndex((e: any) => e.participant_id === participantId);
        const newEntry = { participant_id: participantId, person_months: personMonths };
        const updatedEffort = existingIndex >= 0
          ? existingEffort.map((e: any, i: number) => i === existingIndex ? newEntry : e)
          : [...existingEffort, newEntry];
        return { ...prev, wp_effort: updatedEffort };
      });

      return true;
    } catch (err) {
      console.error('Error updating WP effort:', err);
      return false;
    }
  }, [wpDraft]);

  const setTaskParticipants = useCallback(async (taskId: string, participantIds: string[]) => {
    try {
      await supabase
        .from('wp_draft_task_participants')
        .delete()
        .eq('task_id', taskId);

      if (participantIds.length > 0) {
        const { error } = await supabase
          .from('wp_draft_task_participants')
          .insert(participantIds.map(pid => ({
            task_id: taskId,
            participant_id: pid,
          })));

        if (error) throw error;
      }

      setWPDraft(prev => {
        if (!prev) return null;
        return {
          ...prev,
          tasks: prev.tasks?.map(task => {
            if (task.id !== taskId) return task;
            return {
              ...task,
              participants: participantIds.map(pid => ({ participant_id: pid })),
            };
          }),
        };
      });

      return true;
    } catch (err) {
      console.error('Error setting task participants:', err);
      return false;
    }
  }, []);

  /**
   * Moves one child row to another WP. Move, source renumber and target append
   * all happen inside one server transaction, so the half-applied move that
   * produced duplicates such as two deliverables numbered 2 can no longer
   * happen.
   */
  const moveChildToWP = useCallback(async (
    table: 'wp_draft_tasks' | 'wp_draft_deliverables',
    rowId: string,
    targetWpDraftId: string,
    label: string,
  ) => {
    if (!wpDraft) return false;
    const siblings = table === 'wp_draft_tasks' ? (wpDraft.tasks || []) : (wpDraft.deliverables || []);
    const moved = siblings.find(r => r.id === rowId);

    const res = await moveChildToWpRpc(table, rowId, targetWpDraftId, moved?.version ?? null);
    if (!res.ok) {
      toast.error(res.conflict
        ? `This ${label} changed elsewhere — the move was not applied.`
        : (res.error || `Failed to move ${label}`));
      await fetchWPDraft();
      return false;
    }

    await fetchWPDraft();
    toast.success(`${label === 'task' ? 'Task' : 'Deliverable'} moved successfully`);
    return true;
  }, [wpDraft, fetchWPDraft]);


  const moveTaskToWP = useCallback(
    (taskId: string, targetWpDraftId: string) =>
      moveChildToWP('wp_draft_tasks', taskId, targetWpDraftId, 'task'),
    [moveChildToWP],
  );

  const moveDeliverableToWP = useCallback(
    (deliverableId: string, targetWpDraftId: string) =>
      moveChildToWP('wp_draft_deliverables', deliverableId, targetWpDraftId, 'deliverable'),
    [moveChildToWP],
  );

  // Numbering repair no longer exists on the client: the database resequencing
  // triggers keep tasks and deliverables numbered on every write path.


  return {
    wpDraft,
    loading,
    saving,
    lastSaved,
    saveError,
    refetch: fetchWPDraft,
    updateField,
    // Tasks
    addTask,
    updateTask,
    deleteTask,
    reorderTasks,
    updateWPEffort,
    setTaskParticipants,
    moveTaskToWP,
    // Deliverables
    addDeliverable,
    updateDeliverable,
    deleteDeliverable,
    reorderDeliverables,
    moveDeliverableToWP,
  };

}
