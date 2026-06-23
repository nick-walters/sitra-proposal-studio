import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { B31Pill } from '@/components/B31Pill';


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
  /** When true, only renders dialogs (no toolbar buttons) */
  dialogsOnly?: boolean;
  /** Externally controlled dialog opens */
  openTask?: boolean;
  onOpenTaskChange?: (open: boolean) => void;
  openDeliverable?: boolean;
  onOpenDeliverableChange?: (open: boolean) => void;
  openMilestone?: boolean;
  onOpenMilestoneChange?: (open: boolean) => void;
  hideMilestone?: boolean;
}

// Miniature toolbar pill — uses shared B31Pill at toolbar size


function MiniPentagon({ text }: { text: string }) {
  const w = Math.max(32, text.length * 7 + 14);
  const tw = w - 8;
  const h = 17;
  const mid = h / 2;
  return (
    <span style={{ display: 'inline-block', verticalAlign: 'middle', position: 'relative', width: w, height: h, marginLeft: 3 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        <path d={`M 0,0 L ${tw},0 L ${w},${mid} L ${tw},${h} L 0,${h} Z`} fill="#ffffff" stroke="#000" strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
      <span style={{ position: 'absolute', top: 0, left: 0, width: tw, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Times New Roman', Times, serif", fontSize: '9pt', fontWeight: 700, lineHeight: 1, color: '#000', whiteSpace: 'nowrap' }}>
        {text}
      </span>
    </span>
  );
}

function MiniTriangle({ text }: { text: string }) {
  // Elongated hexagon milestone badge (toolbar icon)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '8pt',
        fontWeight: 700,
        lineHeight: '14px',
        height: '14px',
        padding: '0 3px',
        clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
        verticalAlign: 'middle',
      }}
    >
      MS{text}
    </span>
  );
}

// Dialog item bubbles (larger)
function TaskPill({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap shrink-0"
      style={{
        backgroundColor: '#ffffff',
        color: color || '#000',
        border: `1.5px solid ${color || '#000'}`,
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '9pt',
        fontWeight: 700,
        lineHeight: 1,
        padding: '1px 5px',
        height: '17px',
      }}
    >
      {label}
    </span>
  );
}

function DeliverablePentagon({ label, color }: { label: string; color?: string }) {
  const textWidth = Math.max(32, label.length * 7 + 8);
  const totalWidth = textWidth + 8;
  const stroke = color || '#000';
  return (
    <span className="shrink-0" style={{ display: 'inline-block', verticalAlign: 'middle', position: 'relative', width: totalWidth, height: 17 }}>
      <svg width={totalWidth} height={17} viewBox={`0 0 ${totalWidth} 17`} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        <path d={`M 0,0 L ${textWidth},0 L ${totalWidth},8.5 L ${textWidth},17 L 0,17 Z`} fill="#ffffff" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
      <span style={{ position: 'absolute', top: 0, left: 0, width: textWidth, height: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Times New Roman', Times, serif", fontSize: '9pt', fontWeight: 700, lineHeight: 1, color: color || '#000', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </span>
  );
}

function MilestoneTriangle({ number }: { number: number }) {
  // Elongated hexagon milestone badge
  return (
    <span
      className="shrink-0"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '11pt',
        fontWeight: 700,
        lineHeight: '18px',
        height: '18px',
        padding: '0 4px',
        clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      MS{number || ''}
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
  dialogsOnly = false,
  openTask: externalOpenTask,
  onOpenTaskChange,
  openDeliverable: externalOpenDeliverable,
  onOpenDeliverableChange,
  openMilestone: externalOpenMilestone,
  onOpenMilestoneChange,
  hideMilestone = false,
}: InsertTDMSReferenceDropdownsProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [_taskDialogOpen, _setTaskDialogOpen] = useState(false);
  const [_deliverableDialogOpen, _setDeliverableDialogOpen] = useState(false);
  const [_milestoneDialogOpen, _setMilestoneDialogOpen] = useState(false);
  
  const taskDialogOpen = externalOpenTask !== undefined ? externalOpenTask : _taskDialogOpen;
  const setTaskDialogOpen = onOpenTaskChange || _setTaskDialogOpen;
  const deliverableDialogOpen = externalOpenDeliverable !== undefined ? externalOpenDeliverable : _deliverableDialogOpen;
  const setDeliverableDialogOpen = onOpenDeliverableChange || _setDeliverableDialogOpen;
  const milestoneDialogOpen = externalOpenMilestone !== undefined ? externalOpenMilestone : _milestoneDialogOpen;
  const setMilestoneDialogOpen = onOpenMilestoneChange || _setMilestoneDialogOpen;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!proposalId) return;
    // Refetch whenever a dialog opens so newly created deliverables/milestones appear
    if (!taskDialogOpen && !deliverableDialogOpen && !milestoneDialogOpen) return;





    const fetchData = async () => {
      setLoading(true);
      const { data: wpDrafts } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, color')
        .eq('proposal_id', proposalId)
        .order('number');

      const wpColorMap = new Map<number, string>();
      const wpShortNameMap = new Map<number, string | null>();
      const wpIdToNumber = new Map<string, number>();
      if (wpDrafts) {
        for (const wp of wpDrafts) {
          wpColorMap.set(wp.number, wp.color || '#000000');
          wpShortNameMap.set(wp.number, wp.short_name);
          wpIdToNumber.set(wp.id, wp.number);
        }
      }

      // Tasks: B3.1 only (b31_tasks). Items only in wp_draft_tasks are not pickable
      // until their WP has been populated to B3.1.
      const allTasks: Task[] = [];
      if (wpDrafts && wpDrafts.length > 0) {
        const { data: b31Tasks } = await supabase
          .from('b31_tasks')
          .select('id, number, title, wp_draft_id, order_index')
          .in('wp_draft_id', wpDrafts.map(wp => wp.id))
          .order('order_index');
        if (b31Tasks) {
          for (const t of b31Tasks) {
            const wpNum = wpIdToNumber.get(t.wp_draft_id) || 0;
            allTasks.push({
              id: t.id,
              number: t.number,
              title: t.title || '',
              wp_number: wpNum,
              wp_short_name: wpShortNameMap.get(wpNum) ?? null,
              wp_color: wpColorMap.get(wpNum) || '#000000',
            });
          }
          allTasks.sort((a, b) =>
            a.wp_number !== b.wp_number ? a.wp_number - b.wp_number : a.number - b.number
          );
        }
      }
      setTasks(allTasks);

      // Deliverables: B3.1 only
      const { data: dels } = await supabase
        .from('b31_deliverables')
        .select('id, number, name, wp_number')
        .eq('proposal_id', proposalId)
        .order('number');

      const allDeliverables: Deliverable[] = (dels || []).map(d => ({
        ...d,
        wp_color: d.wp_number ? wpColorMap.get(d.wp_number) || '#000000' : '#000000',
      })).sort((a, b) => {
        const parseDelNum = (n: string) => {
          const match = n.match(/D?(\d+)\.(\d+)/);
          return match ? [parseInt(match[1]), parseInt(match[2])] : [0, 0];
        };
        const [aWp, aNum] = parseDelNum(a.number);
        const [bWp, bNum] = parseDelNum(b.number);
        return aWp !== bWp ? aWp - bWp : aNum - bNum;
      });
      setDeliverables(allDeliverables);

      const { data: mss } = await supabase
        .from('b31_milestones')
        .select('id, number, name')
        .eq('proposal_id', proposalId)
        .order('number');
      if (mss) setMilestones(mss);
      setLoading(false);
    };

    fetchData();
  }, [proposalId, taskDialogOpen, deliverableDialogOpen, milestoneDialogOpen]);

  const buttonClass = variant === 'outline'
    ? "h-6 px-1.5 text-xs gap-0.5"
    : "h-7 px-1.5 gap-0.5";

  const handleSelectTask = (task: Task) => {
    onInsertTask(task);
    setTaskDialogOpen(false);
  };

  const handleSelectDeliverable = (del: Deliverable) => {
    onInsertDeliverable(del);
    setDeliverableDialogOpen(false);
  };

  const handleSelectMilestone = (ms: Milestone) => {
    onInsertMilestone(ms);
    setMilestoneDialogOpen(false);
  };

  return (
    <>
      {!dialogsOnly && (
        <>
          {/* Task button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={variant}
                size={size}
                className={buttonClass}
                disabled={disabled}
                onClick={() => setTaskDialogOpen(true)}
              >
                <B31Pill variant="outline" color="#000" size="toolbar">T</B31Pill>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Insert task reference</TooltipContent>
          </Tooltip>

          {/* Deliverable button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={variant}
                size={size}
                className={buttonClass}
                disabled={disabled}
                onClick={() => setDeliverableDialogOpen(true)}
              >
                <MiniPentagon text="D" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Insert deliverable reference</TooltipContent>
          </Tooltip>

          {/* Milestone button */}
          {!hideMilestone && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={variant}
                  size={size}
                  className={buttonClass}
                  disabled={disabled}
                  onClick={() => setMilestoneDialogOpen(true)}
                >
                  <MiniTriangle text="" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Insert milestone reference</TooltipContent>
            </Tooltip>
          )}
        </>
      )}

      {/* Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TaskPill label="T" />
              Insert task reference
            </DialogTitle>
            <DialogDescription>
              Select a task to insert as an inline reference badge.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {loading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No tasks found. Add tasks to your work packages first.
              </div>
            ) : (
              <div className="p-1">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleSelectTask(task)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
                      "hover:bg-muted/80 transition-colors"
                    )}
                  >
                    <TaskPill label={`T${task.wp_number}.${task.number}`} color={task.wp_color} />
                    <span className="text-sm truncate">{task.title || '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Deliverable Dialog */}
      <Dialog open={deliverableDialogOpen} onOpenChange={setDeliverableDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DeliverablePentagon label="D" />
              Insert deliverable reference
            </DialogTitle>
            <DialogDescription>
              Select a deliverable to insert as an inline reference badge.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {loading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : deliverables.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No deliverables found. Add deliverables in section 3.1 first.
              </div>
            ) : (
              <div className="p-1">
                {deliverables.map((del) => (
                  <button
                    key={del.id}
                    onClick={() => handleSelectDeliverable(del)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
                      "hover:bg-muted/80 transition-colors"
                    )}
                  >
                    <DeliverablePentagon label={del.number} color={del.wp_color} />
                    <span className="text-sm truncate">{del.name || '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Milestone Dialog */}
      <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MilestoneTriangle number={0} />
              Insert milestone reference
            </DialogTitle>
            <DialogDescription>
              Select a milestone to insert as an inline reference badge.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {loading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : milestones.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No milestones found. Add milestones in section 3.1 first.
              </div>
            ) : (
              <div className="p-1">
                {milestones.map((ms) => (
                  <button
                    key={ms.id}
                    onClick={() => handleSelectMilestone(ms)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
                      "hover:bg-muted/80 transition-colors"
                    )}
                  >
                    <MilestoneTriangle number={ms.number} />
                    <span className="text-sm truncate">{ms.name || '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
