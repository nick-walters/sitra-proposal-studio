import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Strip legacy Word/XML artifacts from HTML content.
 * Removes xmlns attributes, MsoNormal classes, mso-* style properties,
 * XML processing instructions, and empty spans left behind.
 */
function stripWordXml(html: string): string {
  if (!html || typeof html !== 'string') return html;
  if (!/xmlns|MsoNormal|mso-|<o:|<w:|<m:|class="Mso/i.test(html)) return html;

  let clean = html;
  clean = clean.replace(/<\?xml[^>]*\?>/gi, '');
  clean = clean.replace(/<\/?[owm]:[^>]*>/gi, '');
  clean = clean.replace(/\s+xmlns(?::[a-z]+)?="[^"]*"/gi, '');
  clean = clean.replace(/\s+class="Mso[^"]*"/gi, '');
  clean = clean.replace(/style="([^"]*)"/gi, (match, styles: string) => {
    const cleaned = styles
      .split(';')
      .filter((s: string) => !/^\s*mso-/i.test(s.trim()))
      .join(';')
      .trim();
    return cleaned ? `style="${cleaned}"` : '';
  });
  clean = clean.replace(/<span\s*>\s*<\/span>/gi, '');
  clean = clean.replace(/\s+style=""/g, '');
  return clean;
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
  tasks?: WPDraftTask[];
  deliverables?: WPDraftDeliverable[];
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
    try {
      const { error } = await supabase
        .from('wp_drafts')
        .update(updates as any)
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

  const reorderWPDrafts = useCallback(async (newOrder: string[]) => {
    try {
      const updates = newOrder.map((id, index) => ({
        id,
        order_index: index,
        number: index + 1,
      }));

      setWPDrafts(prev => {
        const wpMap = new Map(prev.map(wp => [wp.id, wp]));
        return newOrder.map((id, index) => ({
          ...wpMap.get(id)!,
          order_index: index,
          number: index + 1,
        }));
      });

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
      await fetchWPDrafts();
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

      const fixItems = <T extends { id: string; number: number; order_index: number }>(
        items: T[],
        updateFn: (id: string, number: number, order_index: number) => void,
      ): T[] => {
        const needsFix = items.some((item, i) => item.number !== i + 1 || item.order_index !== i);
        if (!needsFix) return items;
        const fixed = items.map((item, i) => ({ ...item, number: i + 1, order_index: i }));
        fixed.forEach((item) => updateFn(item.id, item.number, item.order_index));
        return fixed;
      };

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
        tasks: fixItems(cleanedTasks, (id, num, idx) => {
          supabase.from('wp_draft_tasks').update({ number: num, order_index: idx }).eq('id', id).then();
        }),
        deliverables: fixItems(sortedDeliverables, (id, num, idx) => {
          supabase.from('wp_draft_deliverables').update({ number: num, order_index: idx }).eq('id', id).then();
        }),
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
      const { error } = await supabase
        .from('wp_drafts')
        .update({ [field]: cleanValue })
        .eq('id', wpId);

      if (error) throw error;

      setWPDraft(prev => prev ? { ...prev, [field]: value } : null);
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
        .update(updates as any)
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

      setWPDraft(prev => {
        if (!prev?.tasks) return prev;
        const remaining = prev.tasks
          .filter(t => t.id !== taskId)
          .sort((a, b) => a.number - b.number)
          .map((t, i) => ({ ...t, number: i + 1, order_index: i }));

        remaining.forEach((t, i) => {
          supabase
            .from('wp_draft_tasks')
            .update({ number: i + 1, order_index: i })
            .eq('id', t.id)
            .then();
        });

        return { ...prev, tasks: remaining };
      });

      return true;
    } catch (err) {
      console.error('Error deleting task:', err);
      toast.error('Failed to delete task');
      return false;
    }
  }, []);

  const reorderTasks = useCallback(async (newOrder: string[]) => {
    if (!wpDraft) return false;

    const previousOrder = wpDraft.tasks ? wpDraft.tasks.map(t => t.id) : [];

    try {
      const updates = newOrder.map((id, index) => ({
        id,
        order_index: index,
        number: index + 1,
      }));

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
        .update(updates as any)
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

      setWPDraft(prev => {
        if (!prev) return null;
        const remaining = (prev.deliverables || [])
          .filter(d => d.id !== deliverableId)
          .sort((a, b) => a.order_index - b.order_index)
          .map((d, i) => ({ ...d, number: i + 1, order_index: i }));

        remaining.forEach((d) => {
          supabase
            .from('wp_draft_deliverables')
            .update({ number: d.number, order_index: d.order_index })
            .eq('id', d.id)
            .then();
        });

        return { ...prev, deliverables: remaining };
      });

      return true;
    } catch (err) {
      console.error('Error deleting deliverable:', err);
      toast.error('Failed to delete deliverable');
      return false;
    }
  }, []);

  const reorderDeliverables = useCallback(async (newOrder: string[]) => {
    if (!wpDraft) return false;

    try {
      const updates = newOrder.map((id, index) => ({
        id,
        order_index: index,
        number: index + 1,
      }));

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

  // Move task to another WP
  const moveTaskToWP = useCallback(async (taskId: string, targetWpDraftId: string) => {
    if (!wpDraft) return false;

    try {
      const { data: targetTasks, error: fetchErr } = await supabase
        .from('wp_draft_tasks')
        .select('number, order_index')
        .eq('wp_draft_id', targetWpDraftId)
        .order('order_index', { ascending: false })
        .limit(1);

      if (fetchErr) throw fetchErr;

      const nextNumber = targetTasks && targetTasks.length > 0 ? targetTasks[0].number + 1 : 1;
      const nextOrderIndex = targetTasks && targetTasks.length > 0 ? targetTasks[0].order_index + 1 : 0;

      const { error } = await supabase
        .from('wp_draft_tasks')
        .update({ wp_draft_id: targetWpDraftId, number: nextNumber, order_index: nextOrderIndex })
        .eq('id', taskId);

      if (error) throw error;

      const remaining = (wpDraft.tasks || [])
        .filter(t => t.id !== taskId)
        .sort((a, b) => a.order_index - b.order_index);

      for (let i = 0; i < remaining.length; i++) {
        await supabase
          .from('wp_draft_tasks')
          .update({ number: i + 1, order_index: i })
          .eq('id', remaining[i].id);
      }

      setWPDraft(prev => {
        if (!prev?.tasks) return prev;
        const updated = prev.tasks
          .filter(t => t.id !== taskId)
          .map((t, i) => ({ ...t, number: i + 1, order_index: i }));
        return { ...prev, tasks: updated };
      });

      toast.success('Task moved successfully');
      return true;
    } catch (err) {
      console.error('Error moving task:', err);
      toast.error('Failed to move task');
      return false;
    }
  }, [wpDraft]);

  const moveDeliverableToWP = useCallback(async (deliverableId: string, targetWpDraftId: string) => {
    if (!wpDraft) return false;

    try {
      const { data: targetDeliverables, error: fetchErr } = await supabase
        .from('wp_draft_deliverables')
        .select('number, order_index')
        .eq('wp_draft_id', targetWpDraftId)
        .order('order_index', { ascending: false })
        .limit(1);

      if (fetchErr) throw fetchErr;

      const nextNumber = targetDeliverables && targetDeliverables.length > 0 ? targetDeliverables[0].number + 1 : 1;
      const nextOrderIndex = targetDeliverables && targetDeliverables.length > 0 ? targetDeliverables[0].order_index + 1 : 0;

      const { error } = await supabase
        .from('wp_draft_deliverables')
        .update({ wp_draft_id: targetWpDraftId, number: nextNumber, order_index: nextOrderIndex })
        .eq('id', deliverableId);

      if (error) throw error;

      const remaining = (wpDraft.deliverables || [])
        .filter(d => d.id !== deliverableId)
        .sort((a, b) => a.order_index - b.order_index);

      for (let i = 0; i < remaining.length; i++) {
        await supabase
          .from('wp_draft_deliverables')
          .update({ number: i + 1, order_index: i })
          .eq('id', remaining[i].id);
      }

      setWPDraft(prev => {
        if (!prev?.deliverables) return prev;
        const updated = prev.deliverables
          .filter(d => d.id !== deliverableId)
          .map((d, i) => ({ ...d, number: i + 1, order_index: i }));
        return { ...prev, deliverables: updated };
      });

      toast.success('Deliverable moved successfully');
      return true;
    } catch (err) {
      console.error('Error moving deliverable:', err);
      toast.error('Failed to move deliverable');
      return false;
    }
  }, [wpDraft]);

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
