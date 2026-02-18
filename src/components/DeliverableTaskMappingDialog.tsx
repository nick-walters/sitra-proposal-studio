import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface DeliverableTaskMappingDialogProps {
  proposalId: string;
}

export function DeliverableTaskMappingDialog({ proposalId }: DeliverableTaskMappingDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['deliverable-task-mapping', proposalId],
    queryFn: async () => {
      const [{ data: wps }, { data: tasks }, { data: deliverables }] = await Promise.all([
        supabase.from('wp_drafts').select('id, number, short_name, title').eq('proposal_id', proposalId).order('order_index'),
        supabase.from('wp_draft_tasks').select('id, wp_draft_id, number, title, start_month, end_month'),
        supabase.from('b31_deliverables').select('id, number, name, wp_number, task_id, due_month').eq('proposal_id', proposalId).order('order_index'),
      ]);
      return { wps: wps || [], tasks: tasks || [], deliverables: deliverables || [] };
    },
    enabled: open,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ deliverableId, taskId }: { deliverableId: string; taskId: string | null }) => {
      const { error } = await supabase
        .from('b31_deliverables')
        .update({ task_id: taskId })
        .eq('id', deliverableId);
      if (error) throw error;
    },
    onMutate: async ({ deliverableId, taskId }) => {
      await queryClient.cancelQueries({ queryKey: ['deliverable-task-mapping', proposalId] });
      queryClient.setQueryData(['deliverable-task-mapping', proposalId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deliverables: old.deliverables.map((d: any) =>
            d.id === deliverableId ? { ...d, task_id: taskId } : d
          ),
        };
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-gantt', proposalId] });
    },
  });

  const groupedDeliverables = useMemo(() => {
    if (!data) return [];
    return data.wps.map(wp => {
      // Only show deliverables that have meaningful content (name filled in)
      const wpDeliverables = data.deliverables
        .filter(d => d.wp_number === wp.number && d.name && d.name.trim() !== '');
      // Only show tasks that have meaningful content (title filled in)
      const wpTasks = (data.tasks || [])
        .filter(t => t.wp_draft_id === wp.id && t.title && t.title.trim() !== '');
      return { wp, deliverables: wpDeliverables, tasks: wpTasks };
    }).filter(g => g.deliverables.length > 0);
  }, [data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs h-6 px-2 py-0 gap-1">
          <Settings2 className="w-3 h-3" />
          Assign deliverables to tasks
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Deliverables to Tasks</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {groupedDeliverables.map(({ wp, deliverables, tasks }) => (
            <div key={wp.id}>
              <h4 className="text-sm font-semibold mb-2">WP{wp.number}: {wp.title || wp.short_name}</h4>
              <div className="space-y-2 pl-2">
                {deliverables.map(del => (
                  <div key={del.id} className="flex items-start gap-2">
                    <div className="text-sm shrink-0 min-w-0 flex-1">
                      <span className="font-medium">{del.number}: {del.name}</span>
                      {del.due_month != null && <span className="text-muted-foreground"> (M{del.due_month})</span>}
                    </div>
                    <Select
                      value={del.task_id || '__none__'}
                      onValueChange={(v) => updateMutation.mutate({
                        deliverableId: del.id,
                        taskId: v === '__none__' ? null : v,
                      })}
                    >
                      <SelectTrigger className="h-7 text-xs w-[320px] shrink-0 [&>span]:text-left [&>span]:truncate">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {tasks.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            T{wp.number}.{t.number}: {t.title || '(untitled)'}{t.start_month != null && t.end_month != null ? ` (M${t.start_month}–M${t.end_month})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {groupedDeliverables.length === 0 && (
            <p className="text-sm text-muted-foreground">No deliverables found.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
