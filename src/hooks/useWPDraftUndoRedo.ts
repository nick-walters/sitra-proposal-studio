import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WPDraftTask, WPDraftDeliverable } from './useWPDrafts';

type ItemType = 'task' | 'deliverable';

interface DeleteAction {
  type: 'delete';
  itemType: ItemType;
  item: WPDraftTask | WPDraftDeliverable;
  taskParticipants?: { participant_id: string }[];
  taskEffort?: { participant_id: string; person_months: number }[];
}

interface AddAction {
  type: 'add';
  itemType: ItemType;
  itemId: string;
}

type UndoAction = DeleteAction | AddAction;

export function useWPDraftUndoRedo(wpDraftId: string | null) {
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);
  const [processing, setProcessing] = useState(false);

  const getTable = (itemType: ItemType) => {
    const map = {
      task: 'wp_draft_tasks' as const,
      deliverable: 'wp_draft_deliverables' as const,
    };
    return map[itemType];
  };

  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack(prev => [...prev, action]);
    setRedoStack([]); // Clear redo on new action
  }, []);

  // Record a deletion for undo
  const recordDelete = useCallback((itemType: ItemType, item: any, extra?: { participants?: any[]; effort?: any[] }) => {
    const action: DeleteAction = {
      type: 'delete',
      itemType,
      item: { ...item },
      taskParticipants: extra?.participants,
      taskEffort: extra?.effort,
    };
    pushUndo(action);
  }, [pushUndo]);

  // Record an add for undo (so undo = delete the added item)
  const recordAdd = useCallback((itemType: ItemType, itemId: string) => {
    pushUndo({ type: 'add', itemType, itemId });
  }, [pushUndo]);

  // Undo: reverse the last action
  const undo = useCallback(async (): Promise<{ actionType: string; itemType: ItemType; refetch: boolean } | null> => {
    if (undoStack.length === 0 || processing) return null;
    setProcessing(true);

    const action = undoStack[undoStack.length - 1];
    
    try {
      if (action.type === 'delete') {
        // Re-insert the deleted item
        const table = getTable(action.itemType);
        const { id, participants, effort, ...insertData } = action.item as any;

        // Re-insert with same id
        const { error } = await supabase
          .from(table)
          .insert({ ...insertData, id });

        if (error) throw error;

        // Re-insert task participants if any
        if (action.itemType === 'task' && action.taskParticipants?.length) {
          await supabase
            .from('wp_draft_task_participants')
            .insert(action.taskParticipants.map(p => ({ task_id: id, participant_id: p.participant_id })));
        }

        // Re-insert task effort if any
        if (action.itemType === 'task' && action.taskEffort?.length) {
          await supabase
            .from('wp_draft_task_effort')
            .insert(action.taskEffort.map(e => ({ task_id: id, participant_id: e.participant_id, person_months: e.person_months })));
        }

        // Move to redo stack (as an add, so redo = delete again)
        setUndoStack(prev => prev.slice(0, -1));
        setRedoStack(prev => [...prev, { type: 'add', itemType: action.itemType, itemId: id } as AddAction]);

        toast.success(`${action.itemType.charAt(0).toUpperCase() + action.itemType.slice(1)} restored`);
        return { actionType: 'restore', itemType: action.itemType, refetch: true };

      } else if (action.type === 'add') {
        // Undo an add = delete it
        const table = getTable(action.itemType);

        // Fetch full item data before deleting (for redo)
        const { data: itemData } = await supabase
          .from(table)
          .select('*')
          .eq('id', action.itemId)
          .single();

        if (!itemData) throw new Error('Item not found');

        let participants: any[] = [];
        let effort: any[] = [];
        if (action.itemType === 'task') {
          const { data: p } = await supabase
            .from('wp_draft_task_participants')
            .select('participant_id')
            .eq('task_id', action.itemId);
          participants = p || [];
          const { data: e } = await supabase
            .from('wp_draft_task_effort')
            .select('participant_id, person_months')
            .eq('task_id', action.itemId);
          effort = e || [];
        }

        const { error } = await supabase
          .from(table)
          .delete()
          .eq('id', action.itemId);

        if (error) throw error;

        setUndoStack(prev => prev.slice(0, -1));
        setRedoStack(prev => [...prev, {
          type: 'delete',
          itemType: action.itemType,
          item: itemData,
          taskParticipants: participants,
          taskEffort: effort,
        } as DeleteAction]);

        toast.success(`${action.itemType.charAt(0).toUpperCase() + action.itemType.slice(1)} removed`);
        return { actionType: 'delete', itemType: action.itemType, refetch: true };
      }
    } catch (err) {
      console.error('Undo failed:', err);
      toast.error('Undo failed');
    } finally {
      setProcessing(false);
    }
    return null;
  }, [undoStack, processing]);

  // Redo: reverse the last undo
  const redo = useCallback(async (): Promise<{ actionType: string; itemType: ItemType; refetch: boolean } | null> => {
    if (redoStack.length === 0 || processing) return null;
    setProcessing(true);

    const action = redoStack[redoStack.length - 1];

    try {
      if (action.type === 'delete') {
        // Redo a delete = re-insert
        const table = getTable(action.itemType);
        const { id, participants, effort, ...insertData } = action.item as any;

        const { error } = await supabase
          .from(table)
          .insert({ ...insertData, id });

        if (error) throw error;

        if (action.itemType === 'task' && action.taskParticipants?.length) {
          await supabase
            .from('wp_draft_task_participants')
            .insert(action.taskParticipants.map(p => ({ task_id: id, participant_id: p.participant_id })));
        }

        if (action.itemType === 'task' && action.taskEffort?.length) {
          await supabase
            .from('wp_draft_task_effort')
            .insert(action.taskEffort.map(e => ({ task_id: id, participant_id: e.participant_id, person_months: e.person_months })));
        }

        setRedoStack(prev => prev.slice(0, -1));
        setUndoStack(prev => [...prev, { type: 'add', itemType: action.itemType, itemId: id } as AddAction]);

        toast.success(`${action.itemType.charAt(0).toUpperCase() + action.itemType.slice(1)} restored`);
        return { actionType: 'restore', itemType: action.itemType, refetch: true };

      } else if (action.type === 'add') {
        // Redo an add = delete it again
        const table = getTable(action.itemType);

        const { data: itemData } = await supabase
          .from(table)
          .select('*')
          .eq('id', action.itemId)
          .single();

        if (!itemData) throw new Error('Item not found');

        let participants: any[] = [];
        let effort: any[] = [];
        if (action.itemType === 'task') {
          const { data: p } = await supabase
            .from('wp_draft_task_participants')
            .select('participant_id')
            .eq('task_id', action.itemId);
          participants = p || [];
          const { data: e } = await supabase
            .from('wp_draft_task_effort')
            .select('participant_id, person_months')
            .eq('task_id', action.itemId);
          effort = e || [];
        }

        const { error } = await supabase
          .from(table)
          .delete()
          .eq('id', action.itemId);

        if (error) throw error;

        setRedoStack(prev => prev.slice(0, -1));
        setUndoStack(prev => [...prev, {
          type: 'delete',
          itemType: action.itemType,
          item: itemData,
          taskParticipants: participants,
          taskEffort: effort,
        } as DeleteAction]);

        toast.success(`${action.itemType.charAt(0).toUpperCase() + action.itemType.slice(1)} removed`);
        return { actionType: 'delete', itemType: action.itemType, refetch: true };
      }
    } catch (err) {
      console.error('Redo failed:', err);
      toast.error('Redo failed');
    } finally {
      setProcessing(false);
    }
    return null;
  }, [redoStack, processing]);

  // Reset stacks when WP changes
  const reset = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    canUndo: undoStack.length > 0 && !processing,
    canRedo: redoStack.length > 0 && !processing,
    undoLabel: undoStack.length > 0 ? `Undo ${undoStack[undoStack.length - 1].type === 'delete' ? 'delete' : 'add'} ${undoStack[undoStack.length - 1].itemType}` : 'Nothing to undo',
    redoLabel: redoStack.length > 0 ? `Redo ${redoStack[redoStack.length - 1].type === 'delete' ? 'delete' : 'add'} ${redoStack[redoStack.length - 1].itemType}` : 'Nothing to redo',
    undo,
    redo,
    recordDelete,
    recordAdd,
    reset,
    processing,
  };
}
