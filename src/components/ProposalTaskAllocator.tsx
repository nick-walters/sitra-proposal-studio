import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MentionTextarea, extractMentionedUserIds, renderMentionContent } from '@/components/MentionTextarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Plus, ListTodo, Trash2, Edit2, CalendarIcon } from 'lucide-react';
import { format, differenceInDays, eachWeekOfInterval, startOfWeek, endOfWeek, isWithinInterval, addDays, parseISO } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ProposalTaskAllocatorProps {
  proposalId: string;
  isCoordinator: boolean;
}

interface Task {
  id: string;
  proposal_id: string;
  title: string;
  description: string | null;
  responsible_user_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  order_index: number;
  created_by: string;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Not Started', color: 'text-muted-foreground', bg: 'bg-muted' },
  in_progress: { label: 'In Progress', color: 'text-blue-700', bg: 'bg-blue-500' },
  completed: { label: 'Completed', color: 'text-green-700', bg: 'bg-green-500' },
  blocked: { label: 'Blocked', color: 'text-red-700', bg: 'bg-red-500' },
};

export function ProposalTaskAllocator({ proposalId, isCoordinator }: ProposalTaskAllocatorProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', responsible_user_id: '', start_date: '', end_date: '', status: 'not_started',
    assignee_ids: [] as string[],
  });

  // Fetch members
  const { data: members = [] } = useQuery({
    queryKey: ['proposal-members', proposalId],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('user_id').eq('proposal_id', proposalId);
      const userIds = [...new Set((data || []).map(r => r.user_id))];
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase.from('profiles_basic').select('id, full_name, email, avatar_url').in('id', userIds);
      return (profiles || []) as Profile[];
    },
    enabled: !!proposalId,
  });

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['proposal-tasks', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_tasks')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data || []) as Task[];
    },
    enabled: !!proposalId,
  });

  // Fetch assignees
  const { data: assignees = [] } = useQuery({
    queryKey: ['proposal-task-assignees', proposalId],
    queryFn: async () => {
      const taskIds = tasks.map(t => t.id);
      if (taskIds.length === 0) return [];
      const { data, error } = await supabase
        .from('proposal_task_assignees')
        .select('*')
        .in('task_id', taskIds);
      if (error) throw error;
      return data || [];
    },
    enabled: tasks.length > 0,
  });

  const profileMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const assigneeMap = useMemo(() => {
    const map = new Map<string, string[]>();
    assignees.forEach(a => {
      const arr = map.get(a.task_id) || [];
      arr.push(a.user_id);
      map.set(a.task_id, arr);
    });
    return map;
  }, [assignees]);

  // Timeline range
  const timelineRange = useMemo(() => {
    const dates = tasks.flatMap(t => [t.start_date, t.end_date].filter(Boolean) as string[]);
    if (dates.length === 0) {
      const now = new Date();
      return { start: now, end: addDays(now, 90) };
    }
    const sorted = dates.map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
    const start = addDays(sorted[0], -7);
    const end = addDays(sorted[sorted.length - 1], 14);
    return { start, end };
  }, [tasks]);

  const weeks = useMemo(() => {
    return eachWeekOfInterval({ start: timelineRange.start, end: timelineRange.end }, { weekStartsOn: 1 });
  }, [timelineRange]);

  // Mutations
  const createTask = useMutation({
    mutationFn: async (data: typeof form) => {
      const { data: task, error } = await supabase
        .from('proposal_tasks')
        .insert({
          proposal_id: proposalId,
          title: data.title,
          description: data.description || null,
          responsible_user_id: data.responsible_user_id || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
          status: data.status,
          order_index: tasks.length,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      if (data.assignee_ids.length > 0) {
        await supabase.from('proposal_task_assignees')
          .insert(data.assignee_ids.map(uid => ({ task_id: task.id, user_id: uid })));
      }
      // Create notifications for @mentions in description
      if (data.description) {
        const mentionedIds = extractMentionedUserIds(data.description);
        if (mentionedIds.length > 0) {
          // Send to all mentioned users including self
          const targetIds = [...new Set(mentionedIds)];
          await supabase.from('notifications').insert(
            targetIds.map((userId) => ({
              user_id: userId,
              proposal_id: proposalId,
              type: 'mention',
              title: 'You were mentioned in a task',
              message: `${user?.user_metadata?.full_name || 'Someone'} mentioned you in task "${data.title}"`,
              metadata: { source: 'task', task_id: task.id },
            }))
          );
        }
      }
      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-tasks', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-task-assignees', proposalId] });
      setDialogOpen(false);
      resetForm();
      toast.success('Task created');
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof form }) => {
      const { error } = await supabase
        .from('proposal_tasks')
        .update({
          title: data.title,
          description: data.description || null,
          responsible_user_id: data.responsible_user_id || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
          status: data.status,
        })
        .eq('id', id);
      if (error) throw error;
      // Replace assignees
      await supabase.from('proposal_task_assignees').delete().eq('task_id', id);
      if (data.assignee_ids.length > 0) {
        await supabase.from('proposal_task_assignees')
          .insert(data.assignee_ids.map(uid => ({ task_id: id, user_id: uid })));
      }
      // Create notifications for @mentions in description
      if (data.description) {
        const mentionedIds = extractMentionedUserIds(data.description);
        if (mentionedIds.length > 0) {
          // Send to all mentioned users including self
          const targetIds = [...new Set(mentionedIds)];
          await supabase.from('notifications').insert(
            targetIds.map((userId) => ({
              user_id: userId,
              proposal_id: proposalId,
              type: 'mention',
              title: 'You were mentioned in a task',
              message: `${user?.user_metadata?.full_name || 'Someone'} mentioned you in task "${data.title}"`,
              metadata: { source: 'task', task_id: id },
            }))
          );
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-tasks', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-task-assignees', proposalId] });
      setDialogOpen(false);
      setEditingTask(null);
      resetForm();
      toast.success('Task updated');
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('proposal_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-tasks', proposalId] });
      toast.success('Task deleted');
    },
  });

  const resetForm = () => setForm({
    title: '', description: '', responsible_user_id: '', start_date: '', end_date: '', status: 'not_started', assignee_ids: [],
  });

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      responsible_user_id: task.responsible_user_id || '',
      start_date: task.start_date || '',
      end_date: task.end_date || '',
      status: task.status,
      assignee_ids: assigneeMap.get(task.id) || [],
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingTask(null);
    resetForm();
    setDialogOpen(true);
  };

  // Calculate bar position
  const getBarStyle = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return null;
    const totalMs = timelineRange.end.getTime() - timelineRange.start.getTime();
    const startMs = new Date(startDate).getTime() - timelineRange.start.getTime();
    const endMs = new Date(endDate).getTime() - timelineRange.start.getTime();
    const left = Math.max(0, (startMs / totalMs) * 100);
    const width = Math.max(1, ((endMs - startMs) / totalMs) * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {isCoordinator && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Task
          </Button>
        )}
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ListTodo className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="font-medium text-muted-foreground">No tasks yet</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {isCoordinator ? 'Add tasks to plan your proposal preparation' : 'No tasks have been created yet'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {/* Header with week labels */}
              <div className="flex border-b min-w-[900px]">
                <div className="w-[340px] shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-r">
                  Task
                </div>
                <div className="flex-1 relative">
                  <div className="flex">
                    {weeks.map((w, i) => (
                      <div key={i} className="flex-1 text-center text-[10px] text-muted-foreground py-1 border-r last:border-r-0">
                        {format(w, 'MMM d')}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Task rows */}
              {tasks.map(task => {
                const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.not_started;
                const responsible = task.responsible_user_id ? profileMap.get(task.responsible_user_id) : null;
                const taskAssignees = (assigneeMap.get(task.id) || []).map(uid => profileMap.get(uid)).filter(Boolean) as Profile[];
                const barStyle = getBarStyle(task.start_date, task.end_date);
                const daysLeft = task.end_date ? differenceInDays(new Date(task.end_date), new Date()) : null;

                return (
                  <div key={task.id} className="flex border-b last:border-b-0 min-w-[900px] hover:bg-muted/30">
                    {/* Task info */}
                    <div className="w-[340px] shrink-0 px-3 py-2 border-r space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-medium text-sm truncate">{task.title}</span>
                        {isCoordinator && (
                          <div className="flex shrink-0">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEdit(task)}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => deleteTask.mutate(task.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4", status.color)}>
                          {status.label}
                        </Badge>
                        {task.end_date && (
                          <span className={cn("text-[10px]",
                            daysLeft !== null && daysLeft < 0 ? "text-destructive" :
                            daysLeft !== null && daysLeft <= 3 ? "text-amber-600" : "text-muted-foreground"
                          )}>
                            Due {format(new Date(task.end_date), 'MMM d')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {responsible && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Avatar className="h-5 w-5 ring-2 ring-primary ring-offset-1">
                                  <AvatarImage src={responsible.avatar_url || undefined} />
                                  <AvatarFallback className="text-[8px]">
                                    {responsible.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                                  </AvatarFallback>
                                </Avatar>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">{responsible.full_name} (responsible)</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {taskAssignees.filter(a => a.id !== task.responsible_user_id).map(a => (
                          <TooltipProvider key={a.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Avatar className="h-5 w-5">
                                  <AvatarImage src={a.avatar_url || undefined} />
                                  <AvatarFallback className="text-[8px]">
                                    {a.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                                  </AvatarFallback>
                                </Avatar>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">{a.full_name}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                      </div>
                    </div>

                    {/* Timeline bar */}
                    <div className="flex-1 relative py-2">
                      {/* Week grid lines */}
                      <div className="absolute inset-0 flex">
                        {weeks.map((_, i) => (
                          <div key={i} className="flex-1 border-r last:border-r-0 border-dashed border-muted" />
                        ))}
                      </div>
                      {barStyle && (
                        <div
                          className={cn("absolute top-1/2 -translate-y-1/2 h-6 rounded-full", status.bg, "opacity-80")}
                          style={barStyle}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Edit Task' : 'New Task'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title" />
            </div>
            <div>
              <Label>Description (type @ to mention)</Label>
              <MentionTextarea
                value={form.description}
                onChange={v => setForm(f => ({ ...f, description: v }))}
                placeholder="Optional description"
                teamMembers={members.map(m => ({ id: m.id, full_name: m.full_name, email: m.email, avatar_url: m.avatar_url }))}
              />
            </div>
            <div>
              <Label>Duration</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.start_date && !form.end_date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.start_date && form.end_date
                      ? `${format(parseISO(form.start_date), 'MMM d, yyyy')} – ${format(parseISO(form.end_date), 'MMM d, yyyy')}`
                      : form.start_date
                        ? `${format(parseISO(form.start_date), 'MMM d, yyyy')} – ...`
                        : 'Select date range'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={
                      form.start_date || form.end_date
                        ? { from: form.start_date ? parseISO(form.start_date) : undefined, to: form.end_date ? parseISO(form.end_date) : undefined } as DateRange
                        : undefined
                    }
                    onSelect={(range: DateRange | undefined) => {
                      setForm(f => ({
                        ...f,
                        start_date: range?.from ? format(range.from, 'yyyy-MM-dd') : '',
                        end_date: range?.to ? format(range.to, 'yyyy-MM-dd') : '',
                      }));
                    }}
                    numberOfMonths={2}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Responsible Person</Label>
              <Select value={form.responsible_user_id} onValueChange={v => setForm(f => ({ ...f, responsible_user_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Additional Assignees</Label>
              <div className="flex gap-1 flex-wrap mt-1">
                {members.filter(m => m.id !== form.responsible_user_id).map(m => (
                  <Button
                    key={m.id}
                    variant={form.assignee_ids.includes(m.id) ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setForm(f => ({
                      ...f,
                      assignee_ids: f.assignee_ids.includes(m.id) ? f.assignee_ids.filter(i => i !== m.id) : [...f.assignee_ids, m.id],
                    }))}
                  >
                    {m.full_name || m.email}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!form.title.trim()) { toast.error('Title is required'); return; }
                if (editingTask) {
                  updateTask.mutate({ id: editingTask.id, data: form });
                } else {
                  createTask.mutate(form);
                }
              }}
              disabled={createTask.isPending || updateTask.isPending}
            >
              {editingTask ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
