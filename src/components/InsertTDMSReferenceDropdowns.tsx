import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown } from 'lucide-react';

interface Task {
  id: string;
  number: number;
  title: string;
  wp_number: number;
  wp_short_name: string | null;
}

interface Deliverable {
  id: string;
  number: string;
  name: string;
  wp_number: number | null;
}

interface Milestone {
  id: string;
  number: number;
  name: string;
}

interface InsertTDMSReferenceDropdownsProps {
  proposalId: string;
  disabled?: boolean;
  onInsertTask: (task: Task) => void;
  onInsertDeliverable: (deliverable: Deliverable) => void;
  onInsertMilestone: (milestone: Milestone) => void;
  variant?: 'outline' | 'ghost';
  size?: 'sm' | 'default';
}

export function InsertTDMSReferenceDropdowns({
  proposalId,
  disabled = false,
  onInsertTask,
  onInsertDeliverable,
  onInsertMilestone,
  variant = 'outline',
  size = 'sm',
}: InsertTDMSReferenceDropdownsProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  useEffect(() => {
    if (!proposalId) return;

    const fetchData = async () => {
      // Fetch tasks with WP info
      const { data: wpDrafts } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name')
        .eq('proposal_id', proposalId)
        .order('number');

      if (wpDrafts) {
        const allTasks: Task[] = [];
        for (const wp of wpDrafts) {
          const { data: wpTasks } = await supabase
            .from('wp_draft_tasks')
            .select('id, number, title')
            .eq('wp_draft_id', wp.id)
            .order('number');
          if (wpTasks) {
            for (const t of wpTasks) {
              allTasks.push({
                id: t.id,
                number: t.number,
                title: t.title || '',
                wp_number: wp.number,
                wp_short_name: wp.short_name,
              });
            }
          }
        }
        setTasks(allTasks);
      }

      // Fetch deliverables
      const { data: dels } = await supabase
        .from('b31_deliverables')
        .select('id, number, name, wp_number')
        .eq('proposal_id', proposalId)
        .order('number');
      if (dels) setDeliverables(dels);

      // Fetch milestones
      const { data: mss } = await supabase
        .from('b31_milestones')
        .select('id, number, name')
        .eq('proposal_id', proposalId)
        .order('number');
      if (mss) setMilestones(mss);
    };

    fetchData();
  }, [proposalId]);

  const buttonClass = variant === 'outline'
    ? "h-6 px-2 text-xs gap-0.5"
    : "h-7 px-2 gap-1";

  return (
    <>
      {/* Task dropdown */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={variant}
                size={size}
                className={buttonClass}
                disabled={disabled}
              >
                <span className="text-xs font-bold">T</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Insert Task Reference</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto w-64 bg-popover z-50">
          <DropdownMenuLabel className="text-xs">Tasks</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {tasks.length === 0 ? (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              No tasks defined
            </DropdownMenuItem>
          ) : (
            tasks.map((task) => (
              <DropdownMenuItem
                key={task.id}
                onClick={() => onInsertTask(task)}
                className="text-xs"
              >
                <span className="font-bold mr-1">T{task.wp_number}.{task.number}</span>
                <span className="truncate text-muted-foreground">{task.title}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Deliverable dropdown */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={variant}
                size={size}
                className={buttonClass}
                disabled={disabled}
              >
                <span className="text-xs font-bold">D</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Insert Deliverable Reference</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto w-64 bg-popover z-50">
          <DropdownMenuLabel className="text-xs">Deliverables</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {deliverables.length === 0 ? (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              No deliverables defined
            </DropdownMenuItem>
          ) : (
            deliverables.map((del) => (
              <DropdownMenuItem
                key={del.id}
                onClick={() => onInsertDeliverable(del)}
                className="text-xs"
              >
                <span className="font-bold mr-1">D{del.number}</span>
                <span className="truncate text-muted-foreground">{del.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Milestone dropdown */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={variant}
                size={size}
                className={buttonClass}
                disabled={disabled}
              >
                <span className="text-xs font-bold">MS</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Insert Milestone Reference</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto w-64 bg-popover z-50">
          <DropdownMenuLabel className="text-xs">Milestones</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {milestones.length === 0 ? (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              No milestones defined
            </DropdownMenuItem>
          ) : (
            milestones.map((ms) => (
              <DropdownMenuItem
                key={ms.id}
                onClick={() => onInsertMilestone(ms)}
                className="text-xs"
              >
                <span className="font-bold mr-1">MS{ms.number}</span>
                <span className="truncate text-muted-foreground">{ms.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
