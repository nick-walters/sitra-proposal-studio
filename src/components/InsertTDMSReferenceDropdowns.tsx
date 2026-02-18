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


interface Task {
  id: string;
  number: number;
  title: string;
  wp_number: number;
  wp_short_name: string | null;
  wp_color?: string;
}

interface Deliverable {
  id: string;
  number: string;
  name: string;
  wp_number: number | null;
  wp_color?: string;
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

// Miniature bubble for Task button
function TaskBubbleButton() {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap"
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        border: '1.5px solid #000',
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '7pt',
        fontWeight: 700,
        lineHeight: 1,
        padding: '1px 4px',
        height: '13px',
      }}
    >
      TX.X
    </span>
  );
}

// Inline task pill with WP color
function TaskPill({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap shrink-0"
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        border: `1.5px solid ${color || '#000'}`,
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '8pt',
        fontWeight: 700,
        lineHeight: 1,
        padding: '0 4px',
        height: '15px',
      }}
    >
      {label}
    </span>
  );
}

// Inline deliverable pentagon with WP color
function DeliverablePentagon({ label, color }: { label: string; color?: string }) {
  const textWidth = Math.max(28, label.length * 6 + 8);
  const totalWidth = textWidth + 6;
  const stroke = color || '#000';
  return (
    <span className="shrink-0" style={{ display: 'inline-block', verticalAlign: 'middle', position: 'relative', width: totalWidth, height: 15 }}>
      <svg width={totalWidth} height={15} viewBox={`0 0 ${totalWidth} 15`} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        <path d={`M 0,0 L ${textWidth},0 L ${totalWidth},7.5 L ${textWidth},15 L 0,15 Z`} fill="#ffffff" stroke={stroke} strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
      <span style={{ position: 'absolute', top: 0, left: 0, width: textWidth, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Times New Roman', Times, serif", fontSize: '8pt', fontWeight: 700, lineHeight: 1, color: '#000', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </span>
  );
}

// Miniature pentagon for Deliverable button
function DeliverableBubbleButton() {
  return (
    <span style={{ display: 'inline-block', verticalAlign: 'middle', position: 'relative', width: 40, height: 13 }}>
      <svg width={40} height={13} viewBox="0 0 40 13" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        <path d="M 0,0 L 32,0 L 40,6.5 L 32,13 L 0,13 Z" fill="#ffffff" stroke="#000" strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
      <span style={{ position: 'absolute', top: 0, left: 0, width: 32, height: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Times New Roman', Times, serif", fontSize: '7pt', fontWeight: 700, lineHeight: 1, color: '#000', whiteSpace: 'nowrap' }}>
        DX.X
      </span>
    </span>
  );
}

// Miniature triangle for Milestone button
function MilestoneBubbleButton() {
  return (
    <span style={{ display: 'inline-block', verticalAlign: 'middle', position: 'relative', width: 19, height: 17 }}>
      <svg width={19} height={17} viewBox="0 0 19 17" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        <path d="M 0,0 L 19,8.5 L 0,17 Z" fill="#000000" />
      </svg>
      <span style={{ position: 'absolute', top: 0, left: -1, width: 13, height: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Times New Roman', Times, serif", fontSize: '7pt', fontWeight: 700, lineHeight: 1, color: '#ffffff', letterSpacing: '-0.5px', whiteSpace: 'nowrap' }}>
        X
      </span>
    </span>
  );
}

// Milestone triangle for dropdown items
function MilestoneTriangle({ number }: { number: number }) {
  return (
    <span className="shrink-0" style={{ display: 'inline-block', verticalAlign: 'middle', position: 'relative', width: 17, height: 17 }}>
      <svg width={17} height={17} viewBox="0 0 17 17" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        <path d="M 0,0 L 17,8.5 L 0,17 Z" fill="#000000" />
      </svg>
      <span style={{ position: 'absolute', top: 0, left: -1, width: 12, height: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Times New Roman', Times, serif", fontSize: '8pt', fontWeight: 700, lineHeight: 1, color: '#ffffff', letterSpacing: '-0.7px', whiteSpace: 'nowrap' }}>
        {number}
      </span>
    </span>
  );
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
      // Fetch tasks with WP info including color
      const { data: wpDrafts } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, color')
        .eq('proposal_id', proposalId)
        .order('number');

      const wpColorMap = new Map<number, string>();

      if (wpDrafts) {
        for (const wp of wpDrafts) {
          wpColorMap.set(wp.number, wp.color || '#000000');
        }

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
                wp_color: wp.color || '#000000',
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
      if (dels) {
        setDeliverables(dels.map(d => ({
          ...d,
          wp_color: d.wp_number ? wpColorMap.get(d.wp_number) || '#000000' : '#000000',
        })));
      }

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
    ? "h-6 px-1.5 text-xs gap-0.5"
    : "h-7 px-1.5 gap-0.5";

  return (
    <>
      {/* Task dropdown */}
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={variant}
                size={size}
                className={buttonClass}
                disabled={disabled}
              >
                <TaskBubbleButton />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Insert Task Reference</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto min-w-[280px] w-max max-w-[400px] bg-popover z-50">
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
                className="text-xs gap-2"
              >
                <TaskPill label={`T${task.wp_number}.${task.number}`} color={task.wp_color} />
                <span className="truncate text-muted-foreground">{task.title}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Deliverable dropdown */}
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={variant}
                size={size}
                className={buttonClass}
                disabled={disabled}
              >
                <DeliverableBubbleButton />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Insert Deliverable Reference</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto min-w-[280px] w-max max-w-[400px] bg-popover z-50">
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
                className="text-xs gap-2"
              >
                <DeliverablePentagon label={del.number} color={del.wp_color} />
                <span className="truncate text-muted-foreground">{del.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Milestone dropdown */}
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={variant}
                size={size}
                className={buttonClass}
                disabled={disabled}
              >
                <MilestoneBubbleButton />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Insert Milestone Reference</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto min-w-[280px] w-max max-w-[400px] bg-popover z-50">
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
                className="text-xs gap-2"
              >
                <MilestoneTriangle number={ms.number} />
                <span className="truncate text-muted-foreground">{ms.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
