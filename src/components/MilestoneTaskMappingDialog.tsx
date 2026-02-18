import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface MilestoneTaskMappingDialogProps {
  proposalId: string;
}

export function MilestoneTaskMappingDialog({ proposalId }: MilestoneTaskMappingDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['milestone-task-mapping', proposalId],
    queryFn: async () => {
      const [{ data: wps }, { data: tasks }, { data: milestones }] = await Promise.all([
        supabase.from('wp_drafts').select('id, number, short_name, title').eq('proposal_id', proposalId).order('order_index'),
        supabase.from('wp_draft_tasks').select('id, wp_draft_id, number, title, start_month, end_month'),
        supabase.from('b31_milestones').select('id, number, name, due_month, task_id').eq('proposal_id', proposalId).order('number'),
      ]);
      return { wps: wps || [], tasks: tasks || [], milestones: milestones || [] };
    },
    enabled: open,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ milestoneId, taskId }: { milestoneId: string; taskId: string | null }) => {
      const { error } = await supabase
        .from('b31_milestones')
        .update({ task_id: taskId })
        .eq('id', milestoneId);
      if (error) throw error;
    },
    onMutate: async ({ milestoneId, taskId }) => {
      await queryClient.cancelQueries({ queryKey: ['milestone-task-mapping', proposalId] });
      queryClient.setQueryData(['milestone-task-mapping', proposalId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          milestones: old.milestones.map((m: any) =>
            m.id === milestoneId ? { ...m, task_id: taskId } : m
          ),
        };
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-gantt', proposalId] });
    },
  });

  // Build a flat list of all tasks across all WPs (with content only)
  const allTasks = useMemo(() => {
    if (!data) return [];
    return data.wps.flatMap(wp =>
      (data.tasks || [])
        .filter(t => t.wp_draft_id === wp.id && t.title && t.title.trim() !== '')
        .map(t => ({ ...t, wpNumber: wp.number }))
    );
  }, [data]);

  const filteredMilestones = useMemo(() => {
    if (!data) return [];
    return data.milestones.filter(m => m.name && m.name.trim() !== '');
  }, [data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs h-6 px-2 py-0 gap-1">
          <Settings2 className="w-3 h-3" />
          Assign milestones to tasks
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Milestones to Tasks</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {filteredMilestones.map(ms => (
            <div key={ms.id} className="flex items-start gap-2">
              <div className="text-sm shrink-0 min-w-0 flex-1">
                <span className="font-medium">MS{ms.number}: {ms.name}</span>
                {ms.due_month != null && <span className="text-muted-foreground"> (M{ms.due_month})</span>}
              </div>
              <Select
                value={ms.task_id || '__none__'}
                onValueChange={(v) => updateMutation.mutate({
                  milestoneId: ms.id,
                  taskId: v === '__none__' ? null : v,
                })}
              >
                <SelectTrigger className="h-7 text-xs w-[320px] shrink-0 [&>span]:text-left [&>span]:truncate">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {allTasks.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      T{t.wpNumber}.{t.number}: {t.title}{t.start_month != null && t.end_month != null ? ` (M${String(t.start_month).padStart(2, '0')}–M${String(t.end_month).padStart(2, '0')})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          {filteredMilestones.length === 0 && (
            <p className="text-sm text-muted-foreground">No milestones found.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
