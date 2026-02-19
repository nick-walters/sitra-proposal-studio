import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
}

export interface WPDraftRisk {
  id: string;
  wp_draft_id: string;
  number: number;
  title: string | null;
  likelihood: string | null;
  severity: string | null;
  mitigation: string | null;
  order_index: number;
}

export interface WPDraftMilestone {
  id: string;
  wp_draft_id: string;
  number: number;
  title: string | null;
  related_wps: string | null;
  due_month: number | null;
  means_of_verification: string | null;
  order_index: number;
}

export interface WPDraft {
  id: string;
  proposal_id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  lead_participant_id: string | null;
  methodology: string | null;
  objectives: string | null;
  color: string;
  theme_id: string | null;
  inputs_question: string | null;
  outputs_question: string | null;
  bottlenecks_question: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
  tasks?: WPDraftTask[];
  deliverables?: WPDraftDeliverable[];
  risks?: WPDraftRisk[];
  milestones?: WPDraftMilestone[];
}

export function useWPDrafts(proposalId: string | null) {
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
      // Fetch WP drafts with all related data
      const { data, error: fetchError } = await supabase
        .from('wp_drafts')
        .select(`
          *,
          tasks:wp_draft_tasks(
            *,
            participants:wp_draft_task_participants(participant_id),
            effort:wp_draft_task_effort(participant_id, person_months)
          ),
          deliverables:wp_draft_deliverables(*),
          risks:wp_draft_risks(*),
          milestones:wp_draft_milestones(*)
        `)
        .eq('proposal_id', proposalId)
        .order('order_index');

      if (fetchError) throw fetchError;

      // Sort nested data
      const sortedData = (data || []).map(wp => ({
        ...wp,
        tasks: (wp.tasks || []).sort((a: WPDraftTask, b: WPDraftTask) => a.order_index - b.order_index),
        deliverables: (wp.deliverables || []).sort((a: WPDraftDeliverable, b: WPDraftDeliverable) => a.order_index - b.order_index),
        risks: (wp.risks || []).sort((a: WPDraftRisk, b: WPDraftRisk) => a.order_index - b.order_index),
        milestones: (wp.milestones || []).sort((a: WPDraftMilestone, b: WPDraftMilestone) => a.order_index - b.order_index),
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

  // Update a single WP draft
  const updateWPDraft = useCallback(async (wpId: string, updates: Partial<WPDraft>) => {
    try {
      const { error } = await supabase
        .from('wp_drafts')
        .update(updates)
        .eq('id', wpId);

      if (error) throw error;

      setWPDrafts(prev => prev.map(wp => 
        wp.id === wpId ? { ...wp, ...updates } : wp
      ));

      return true;
    } catch (err) {
      console.error('Error updating WP draft:', err);
      toast.error('Failed to update work package');
      return false;
    }
  }, []);

  // Add a new WP
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

      // Create 3 empty tasks, 3 deliverables, and 2 risks
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

      const risksToCreate = [1, 2].map(num => ({
        wp_draft_id: data.id,
        number: num,
        order_index: num - 1,
      }));

      const milestonesToCreate = [1, 2].map(num => ({
        wp_draft_id: data.id,
        number: num,
        order_index: num - 1,
      }));

      await Promise.all([
        supabase.from('wp_draft_tasks').insert(tasksToCreate),
        supabase.from('wp_draft_deliverables').insert(deliverablesToCreate),
        supabase.from('wp_draft_risks').insert(risksToCreate),
        supabase.from('wp_draft_milestones').insert(milestonesToCreate),
      ]);

      await fetchWPDrafts();
      return data;
    } catch (err) {
      console.error('Error adding WP draft:', err);
      toast.error('Failed to add work package');
      return null;
    }
  }, [proposalId, wpDrafts, fetchWPDrafts]);

  // Delete a WP
  const deleteWPDraft = useCallback(async (wpId: string) => {
    try {
      const { error } = await supabase
        .from('wp_drafts')
        .delete()
        .eq('id', wpId);

      if (error) throw error;

      setWPDrafts(prev => prev.filter(wp => wp.id !== wpId));
      return true;
    } catch (err) {
      console.error('Error deleting WP draft:', err);
      toast.error('Failed to delete work package');
      return false;
    }
  }, []);

  // Reorder WPs
  const reorderWPDrafts = useCallback(async (newOrder: string[]) => {
    try {
      const updates = newOrder.map((id, index) => ({
        id,
        order_index: index,
        number: index + 1,
      }));

      // Update locally first for optimistic UI
      setWPDrafts(prev => {
        const wpMap = new Map(prev.map(wp => [wp.id, wp]));
        return newOrder.map((id, index) => ({
          ...wpMap.get(id)!,
          order_index: index,
          number: index + 1,
        }));
      });

      // Update in database
      for (const update of updates) {
        await supabase
          .from('wp_drafts')
          .update({ order_index: update.order_index, number: update.number })
          .eq('id', update.id);
      }

      return true;
    } catch (err) {
      console.error('Error reordering WP drafts:', err);
      toast.error('Failed to reorder work packages');
      await fetchWPDrafts(); // Revert on error
      return false;
    }
  }, [fetchWPDrafts]);

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
export function useWPDraftEditor(wpId: string | null) {
  const [wpDraft, setWPDraft] = useState<WPDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
          risks:wp_draft_risks(*),
          milestones:wp_draft_milestones(*)
        `)
        .eq('id', wpId)
        .single();

      if (error) throw error;

      // Sort nested data
      const sortedData = {
        ...data,
        tasks: (data.tasks || []).sort((a: WPDraftTask, b: WPDraftTask) => a.order_index - b.order_index),
        deliverables: (data.deliverables || []).sort((a: WPDraftDeliverable, b: WPDraftDeliverable) => a.order_index - b.order_index),
        risks: (data.risks || []).sort((a: WPDraftRisk, b: WPDraftRisk) => a.order_index - b.order_index),
        milestones: (data.milestones || []).sort((a: WPDraftMilestone, b: WPDraftMilestone) => a.order_index - b.order_index),
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

  // Update WP fields
  const updateField = useCallback(async (field: keyof WPDraft, value: any) => {
    if (!wpId) return false;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('wp_drafts')
        .update({ [field]: value })
        .eq('id', wpId);

      if (error) throw error;

      setWPDraft(prev => prev ? { ...prev, [field]: value } : null);
      return true;
    } catch (err) {
      console.error('Error updating WP field:', err);
      toast.error('Failed to save changes');
      return false;
    } finally {
      setSaving(false);
    }
  }, [wpId]);

  // Task operations
  const addTask = useCallback(async () => {
    if (!wpDraft) return null;

    try {
      const nextNumber = wpDraft.tasks && wpDraft.tasks.length > 0
        ? Math.max(...wpDraft.tasks.map(t => t.number)) + 1
        : 1;

      const { data, error } = await supabase
        .from('wp_draft_tasks')
        .insert({
          wp_draft_id: wpDraft.id,
          number: nextNumber,
          order_index: wpDraft.tasks?.length || 0,
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
    try {
      const { error } = await supabase
        .from('wp_draft_tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        tasks: prev.tasks?.map(t => t.id === taskId ? { ...t, ...updates } : t),
      } : null);

      return true;
    } catch (err) {
      console.error('Error updating task:', err);
      return false;
    }
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('wp_draft_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        tasks: prev.tasks?.filter(t => t.id !== taskId),
      } : null);

      return true;
    } catch (err) {
      console.error('Error deleting task:', err);
      toast.error('Failed to delete task');
      return false;
    }
  }, []);

  // Reorder tasks
  const reorderTasks = useCallback(async (newOrder: string[]) => {
    if (!wpDraft) return false;

    // Save previous order for undo
    const previousOrder = wpDraft.tasks ? wpDraft.tasks.map(t => t.id) : [];

    try {
      const updates = newOrder.map((id, index) => ({
        id,
        order_index: index,
        number: index + 1,
      }));

      // Update locally first for optimistic UI
      setWPDraft(prev => {
        if (!prev || !prev.tasks) return prev;
        const taskMap = new Map(prev.tasks.map(t => [t.id, t]));
        return {
          ...prev,
          tasks: newOrder.map((id, index) => ({
            ...taskMap.get(id)!,
            order_index: index,
            number: index + 1,
          })),
        };
      });

      // Update in database
      for (const update of updates) {
        await supabase
          .from('wp_draft_tasks')
          .update({ order_index: update.order_index, number: update.number })
          .eq('id', update.id);
      }

      toast.success('Tasks reordered', {
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const updates = previousOrder.map((id, index) => ({
                id,
                order_index: index,
                number: index + 1,
              }));
              setWPDraft(prev => {
                if (!prev || !prev.tasks) return prev;
                const taskMap = new Map(prev.tasks.map(t => [t.id, t]));
                return {
                  ...prev,
                  tasks: previousOrder.map((id, index) => ({
                    ...taskMap.get(id)!,
                    order_index: index,
                    number: index + 1,
                  })),
                };
              });
              for (const update of updates) {
                await supabase
                  .from('wp_draft_tasks')
                  .update({ order_index: update.order_index, number: update.number })
                  .eq('id', update.id);
              }
              toast.success('Reorder undone');
            } catch (err) {
              toast.error('Failed to undo');
            }
          },
        },
      });

      return true;
    } catch (err) {
      console.error('Error reordering tasks:', err);
      toast.error('Failed to reorder tasks');
      return false;
    }
  }, [wpDraft]);

  // Deliverable operations
  const addDeliverable = useCallback(async () => {
    if (!wpDraft) return null;

    try {
      const nextNumber = wpDraft.deliverables && wpDraft.deliverables.length > 0
        ? Math.max(...wpDraft.deliverables.map(d => d.number)) + 1
        : 1;

      const { data, error } = await supabase
        .from('wp_draft_deliverables')
        .insert({
          wp_draft_id: wpDraft.id,
          number: nextNumber,
          order_index: wpDraft.deliverables?.length || 0,
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
    try {
      const { error } = await supabase
        .from('wp_draft_deliverables')
        .update(updates)
        .eq('id', deliverableId);

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        deliverables: prev.deliverables?.map(d => d.id === deliverableId ? { ...d, ...updates } : d),
      } : null);

      return true;
    } catch (err) {
      console.error('Error updating deliverable:', err);
      return false;
    }
  }, []);

  const deleteDeliverable = useCallback(async (deliverableId: string) => {
    try {
      const { error } = await supabase
        .from('wp_draft_deliverables')
        .delete()
        .eq('id', deliverableId);

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        deliverables: prev.deliverables?.filter(d => d.id !== deliverableId),
      } : null);

      return true;
    } catch (err) {
      console.error('Error deleting deliverable:', err);
      toast.error('Failed to delete deliverable');
      return false;
    }
  }, []);

  // Reorder deliverables
  const reorderDeliverables = useCallback(async (newOrder: string[]) => {
    if (!wpDraft) return false;

    try {
      const updates = newOrder.map((id, index) => ({
        id,
        order_index: index,
        number: index + 1,
      }));

      // Update locally first for optimistic UI
      setWPDraft(prev => {
        if (!prev || !prev.deliverables) return prev;
        const deliverableMap = new Map(prev.deliverables.map(d => [d.id, d]));
        return {
          ...prev,
          deliverables: newOrder.map((id, index) => ({
            ...deliverableMap.get(id)!,
            order_index: index,
            number: index + 1,
          })),
        };
      });

      // Update in database
      for (const update of updates) {
        await supabase
          .from('wp_draft_deliverables')
          .update({ order_index: update.order_index, number: update.number })
          .eq('id', update.id);
      }

      return true;
    } catch (err) {
      console.error('Error reordering deliverables:', err);
      toast.error('Failed to reorder deliverables');
      return false;
    }
  }, [wpDraft]);

  // Risk operations
  const addRisk = useCallback(async () => {
    if (!wpDraft) return null;

    try {
      const nextNumber = wpDraft.risks && wpDraft.risks.length > 0
        ? Math.max(...wpDraft.risks.map(r => r.number)) + 1
        : 1;

      const { data, error } = await supabase
        .from('wp_draft_risks')
        .insert({
          wp_draft_id: wpDraft.id,
          number: nextNumber,
          order_index: wpDraft.risks?.length || 0,
        })
        .select()
        .single();

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        risks: [...(prev.risks || []), data],
      } : null);

      return data;
    } catch (err) {
      console.error('Error adding risk:', err);
      toast.error('Failed to add risk');
      return null;
    }
  }, [wpDraft]);

  const updateRisk = useCallback(async (riskId: string, updates: Partial<WPDraftRisk>) => {
    try {
      const { error } = await supabase
        .from('wp_draft_risks')
        .update(updates)
        .eq('id', riskId);

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        risks: prev.risks?.map(r => r.id === riskId ? { ...r, ...updates } : r),
      } : null);

      return true;
    } catch (err) {
      console.error('Error updating risk:', err);
      return false;
    }
  }, []);

  const deleteRisk = useCallback(async (riskId: string) => {
    try {
      const { error } = await supabase
        .from('wp_draft_risks')
        .delete()
        .eq('id', riskId);

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        risks: prev.risks?.filter(r => r.id !== riskId),
      } : null);

      return true;
    } catch (err) {
      console.error('Error deleting risk:', err);
      toast.error('Failed to delete risk');
      return false;
    }
  }, []);

  // Reorder risks
  const reorderRisks = useCallback(async (newOrder: string[]) => {
    if (!wpDraft) return false;

    try {
      const updates = newOrder.map((id, index) => ({
        id,
        order_index: index,
        number: index + 1,
      }));

      // Update locally first for optimistic UI
      setWPDraft(prev => {
        if (!prev || !prev.risks) return prev;
        const riskMap = new Map(prev.risks.map(r => [r.id, r]));
        return {
          ...prev,
          risks: newOrder.map((id, index) => ({
            ...riskMap.get(id)!,
            order_index: index,
            number: index + 1,
          })),
        };
      });

      // Update in database
      for (const update of updates) {
        await supabase
          .from('wp_draft_risks')
          .update({ order_index: update.order_index, number: update.number })
          .eq('id', update.id);
      }

      return true;
    } catch (err) {
      console.error('Error reordering risks:', err);
      toast.error('Failed to reorder risks');
      return false;
    }
  }, [wpDraft]);

  // Task effort operations
  const updateTaskEffort = useCallback(async (taskId: string, participantId: string, personMonths: number) => {
    try {
      const { error } = await supabase
        .from('wp_draft_task_effort')
        .upsert({
          task_id: taskId,
          participant_id: participantId,
          person_months: personMonths,
        }, {
          onConflict: 'task_id,participant_id',
        });

      if (error) throw error;

      setWPDraft(prev => {
        if (!prev) return null;
        return {
          ...prev,
          tasks: prev.tasks?.map(task => {
            if (task.id !== taskId) return task;
            const existingEffort = task.effort || [];
            const existingIndex = existingEffort.findIndex(e => e.participant_id === participantId);
            if (existingIndex >= 0) {
              return {
                ...task,
                effort: existingEffort.map((e, i) => 
                  i === existingIndex ? { ...e, person_months: personMonths } : e
                ),
              };
            } else {
              return {
                ...task,
                effort: [...existingEffort, { participant_id: participantId, person_months: personMonths }],
              };
            }
          }),
        };
      });

      return true;
    } catch (err) {
      console.error('Error updating task effort:', err);
      return false;
    }
  }, []);

  // Task participants operations
  const setTaskParticipants = useCallback(async (taskId: string, participantIds: string[]) => {
    try {
      // Delete existing participants
      await supabase
        .from('wp_draft_task_participants')
        .delete()
        .eq('task_id', taskId);

      // Insert new participants
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

  // Milestone operations
  const addMilestone = useCallback(async () => {
    if (!wpDraft) return null;

    try {
      const nextNumber = wpDraft.milestones && wpDraft.milestones.length > 0
        ? Math.max(...wpDraft.milestones.map(m => m.number)) + 1
        : 1;

      const { data, error } = await supabase
        .from('wp_draft_milestones')
        .insert({
          wp_draft_id: wpDraft.id,
          number: nextNumber,
          order_index: wpDraft.milestones?.length || 0,
        })
        .select()
        .single();

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        milestones: [...(prev.milestones || []), data],
      } : null);

      return data;
    } catch (err) {
      console.error('Error adding milestone:', err);
      toast.error('Failed to add milestone');
      return null;
    }
  }, [wpDraft]);

  const updateMilestone = useCallback(async (milestoneId: string, updates: Partial<WPDraftMilestone>) => {
    try {
      const { error } = await supabase
        .from('wp_draft_milestones')
        .update(updates)
        .eq('id', milestoneId);

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        milestones: prev.milestones?.map(m => m.id === milestoneId ? { ...m, ...updates } : m),
      } : null);

      return true;
    } catch (err) {
      console.error('Error updating milestone:', err);
      return false;
    }
  }, []);

  const deleteMilestone = useCallback(async (milestoneId: string) => {
    try {
      const { error } = await supabase
        .from('wp_draft_milestones')
        .delete()
        .eq('id', milestoneId);

      if (error) throw error;

      setWPDraft(prev => prev ? {
        ...prev,
        milestones: prev.milestones?.filter(m => m.id !== milestoneId),
      } : null);

      return true;
    } catch (err) {
      console.error('Error deleting milestone:', err);
      toast.error('Failed to delete milestone');
      return false;
    }
  }, []);

  const reorderMilestones = useCallback(async (newOrder: string[]) => {
    if (!wpDraft) return false;

    try {
      const updates = newOrder.map((id, index) => ({
        id,
        order_index: index,
        number: index + 1,
      }));

      setWPDraft(prev => {
        if (!prev || !prev.milestones) return prev;
        const milestoneMap = new Map(prev.milestones.map(m => [m.id, m]));
        return {
          ...prev,
          milestones: newOrder.map((id, index) => ({
            ...milestoneMap.get(id)!,
            order_index: index,
            number: index + 1,
          })),
        };
      });

      for (const update of updates) {
        await supabase
          .from('wp_draft_milestones')
          .update({ order_index: update.order_index, number: update.number })
          .eq('id', update.id);
      }

      return true;
    } catch (err) {
      console.error('Error reordering milestones:', err);
      toast.error('Failed to reorder milestones');
      return false;
    }
  }, [wpDraft]);

  return {
    wpDraft,
    loading,
    saving,
    refetch: fetchWPDraft,
    updateField,
    // Tasks
    addTask,
    updateTask,
    deleteTask,
    reorderTasks,
    updateTaskEffort,
    setTaskParticipants,
    // Deliverables
    addDeliverable,
    updateDeliverable,
    deleteDeliverable,
    reorderDeliverables,
    // Risks
    addRisk,
    updateRisk,
    deleteRisk,
    reorderRisks,
    // Milestones
    addMilestone,
    updateMilestone,
    deleteMilestone,
    reorderMilestones,
  };
}
