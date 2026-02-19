import React, { useState, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EditableCaption } from '@/components/EditableCaption';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Crown, GripVertical, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { B31WPData, B31Participant } from '@/hooks/useB31SectionData';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";

interface Props {
  wpData: B31WPData[];
  participants: B31Participant[];
  proposalId: string;
  projectDuration?: number;
}

/* ── Participant bubble ── */
function ParticipantBubble({ participant, showCrown = false }: { participant: B31Participant; showCrown?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full font-bold italic whitespace-nowrap"
      style={{ backgroundColor: '#000000', color: '#FFFFFF', border: '1.5px solid #000000', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, fontStyle: 'italic', lineHeight: 1, verticalAlign: 'baseline', padding: '0px 5px' }}
    >
      {showCrown && <Crown className="h-2.5 w-2.5 mr-0.5 fill-white" strokeWidth={0} />}
      {participant.organisation_short_name || participant.organisation_name}
    </span>
  );
}

/* ── Single-select participant picker (with deselect support) ── */
function LeaderPicker({
  entityId,
  entityTable,
  currentLeaderId,
  participants,
  proposalId,
  showCrown = false,
  arrowPosition = 'right',
}: {
  entityId: string;
  entityTable: 'wp_drafts' | 'wp_draft_tasks';
  currentLeaderId: string | null;
  participants: B31Participant[];
  proposalId: string;
  showCrown?: boolean;
  arrowPosition?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const leader = participants.find(p => p.id === currentLeaderId);

  const select = async (pid: string | null) => {
    setOpen(false);
    await supabase.from(entityTable).update({ lead_participant_id: pid }).eq('id', entityId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  const arrow = <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />;
  const content = leader ? (
    <ParticipantBubble participant={leader} showCrown={showCrown} />
  ) : (
    <span className="text-muted-foreground text-[9pt] italic">{entityTable === 'wp_drafts' ? 'Select WP leader' : 'Select task leader'}</span>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80">
          {arrowPosition === 'left' ? <>{arrow}{content}</> : <>{content}{arrow}</>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="max-h-[200px] overflow-y-auto">
          {currentLeaderId && (
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent cursor-pointer text-muted-foreground italic"
              onClick={() => select(null)}
            >
              Clear selection
            </button>
          )}
          {participants.map(p => (
            <button
              key={p.id}
              className={cn(
                'flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
                p.id === currentLeaderId && 'bg-accent',
              )}
              onClick={() => select(p.id)}
            >
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border',
                  p.id === currentLeaderId ? 'bg-primary border-primary' : 'border-muted-foreground',
                )}
              >
                {p.id === currentLeaderId && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <span className="truncate">
                {p.participant_number}. {p.organisation_short_name || p.organisation_name}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Multi-select participant picker (partners) ── */
function PartnersPicker({
  taskId,
  selectedIds,
  participants,
  proposalId,
  leaderId,
}: {
  taskId: string;
  selectedIds: string[];
  participants: B31Participant[];
  proposalId: string;
  leaderId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const filteredSelectedIds = selectedIds.filter(id => id !== leaderId);
  const availableParticipants = participants.filter(p => p.id !== leaderId);

  const toggle = async (pid: string) => {
    const next = filteredSelectedIds.includes(pid)
      ? filteredSelectedIds.filter(id => id !== pid)
      : [...filteredSelectedIds, pid];
    await supabase.from('wp_draft_task_participants').delete().eq('task_id', taskId);
    if (next.length > 0) {
      await supabase
        .from('wp_draft_task_participants')
        .insert(next.map(participant_id => ({ task_id: taskId, participant_id })));
    }
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  const selected = availableParticipants.filter(p => filteredSelectedIds.includes(p.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 flex-wrap cursor-pointer hover:opacity-80">
          {selected.length > 0 ? (
            selected.map(p => (
              <ParticipantBubble key={p.id} participant={p} />
            ))
          ) : (
            <span className="text-muted-foreground text-[9pt] italic">Select participant(s)</span>
          )}
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="max-h-[200px] overflow-y-auto">
          {availableParticipants.map(p => {
            const isSelected = filteredSelectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
                  isSelected && 'bg-accent',
                )}
                onClick={() => toggle(p.id)}
              >
                <div
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-sm border',
                    isSelected ? 'bg-primary border-primary' : 'border-muted-foreground',
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span className="truncate">
                  {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Month range picker ── */
function MonthRangePicker({
  taskId,
  startMonth,
  endMonth,
  proposalId,
  projectDuration = 36,
}: {
  taskId: string;
  startMonth: number | null;
  endMonth: number | null;
  proposalId: string;
  projectDuration?: number;
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<'start' | 'end' | null>(null);
  const [localStart, setLocalStart] = useState(startMonth);
  const [localEnd, setLocalEnd] = useState(endMonth);
  const queryClient = useQueryClient();

  const months = Array.from({ length: projectDuration }, (_, i) => i + 1);

  const save = async (start: number | null, end: number | null) => {
    await supabase.from('wp_draft_tasks').update({ start_month: start, end_month: end }).eq('id', taskId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  const handleClick = (m: number) => {
    if (selecting === 'start' || !selecting) {
      setLocalStart(m);
      if (localEnd != null && m > localEnd) {
        setLocalEnd(null);
      }
      setSelecting('end');
    } else {
      if (m < (localStart ?? 1)) {
        setLocalStart(m);
        setSelecting('end');
      } else {
        setLocalEnd(m);
        setSelecting(null);
        save(localStart, m);
        setOpen(false);
      }
    }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setLocalStart(startMonth);
      setLocalEnd(endMonth);
      setSelecting('start');
    }
  };

  const formatMonth = (m: number | null) => m != null ? `M${String(m).padStart(2, '0')}` : null;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 font-['Times_New_Roman',Times,serif] text-[11pt] font-bold">
          {startMonth != null && endMonth != null ? (
            <>{formatMonth(startMonth)}–{formatMonth(endMonth)}</>
          ) : startMonth != null ? (
            <>{formatMonth(startMonth)}–<span className="text-muted-foreground italic">M??</span></>
          ) : (
            <span className="text-muted-foreground italic">Duration</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="start">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground font-medium">
            {selecting === 'start' ? 'Select start month' : selecting === 'end' ? 'Select end month' : 'Select start month'}
          </span>
          {(startMonth != null || endMonth != null) && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground italic cursor-pointer"
              onClick={() => {
                setLocalStart(null);
                setLocalEnd(null);
                save(null, null);
                setOpen(false);
              }}
            >
              Clear selection
            </button>
          )}
        </div>
        <div className="grid grid-cols-6 gap-0.5">
          {months.map(m => {
            const isStart = m === localStart;
            const isEnd = m === localEnd;
            const isInRange = localStart != null && localEnd != null && m >= localStart && m <= localEnd;
            const isPartialRange = selecting === 'end' && localStart != null && localEnd == null && m >= localStart;
            return (
              <button
                key={m}
                className={cn(
                  'px-1 py-0.5 text-xs rounded cursor-pointer text-center',
                  (isStart || isEnd) && 'bg-primary text-primary-foreground font-bold',
                  !isStart && !isEnd && isInRange && 'bg-primary/20',
                  !isStart && !isEnd && !isInRange && isPartialRange && 'bg-primary/10',
                  !isStart && !isEnd && !isInRange && !isPartialRange && 'hover:bg-accent',
                )}
                onClick={() => handleClick(m)}
              >
                M{String(m).padStart(2, '0')}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Spacer row with optional colour-coded border ── */
function SpacerRow({ color }: { color?: string }) {
  return (
    <tr>
      <td
        colSpan={3}
        style={{
          fontSize: '1pt',
          lineHeight: '1pt',
          height: '12px',
          padding: 0,
          userSelect: 'none',
          pointerEvents: 'none',
          border: 'none',
          verticalAlign: 'middle',
        }}
        contentEditable={false}
      >
        {color ? (
          <div
            style={{
              width: '100%',
              height: '1px',
              backgroundColor: color,
            }}
          />
        ) : (
          <>&nbsp;</>
        )}
      </td>
    </tr>
  );
}

/* ── Inline editable text cell ── */
function EditableText({
  value,
  onSave,
  placeholder,
  className,
  inline,
}: {
  value: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  inline?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRef = useRef(value);

  const handleBlur = useCallback(() => {
    const current = ref.current?.innerHTML || '';
    if (current !== savedRef.current) {
      savedRef.current = current;
      onSave(current);
    }
  }, [onSave]);

  const Tag = inline ? 'span' : 'div';

  return (
    <Tag
      ref={ref as any}
      contentEditable
      suppressContentEditableWarning
      className={cn(
        "outline-none min-h-[1.2em] font-['Times_New_Roman',Times,serif] text-[11pt] text-justify",
        !value && 'text-muted-foreground italic',
        className,
      )}
      onBlur={handleBlur}
      dangerouslySetInnerHTML={{ __html: value || placeholder || '' }}
    />
  );
}

/* ── Inline editable plain text (for headers) ── */
function EditableHeaderText({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (newValue: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const savedRef = useRef(value);

  const handleBlur = useCallback(() => {
    const current = ref.current?.textContent || '';
    if (current !== savedRef.current) {
      savedRef.current = current;
      onSave(current);
    }
  }, [onSave]);

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={cn("outline-none font-['Times_New_Roman',Times,serif] text-[11pt]", className)}
      onBlur={handleBlur}
    >
      {value}
    </span>
  );
}

/* ── Caption bubble helpers ── */
function CaptionParticipantBubble({ showCrown = false }: { showCrown?: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap"
      style={{ backgroundColor: '#000000', color: '#FFFFFF', border: '1.5px solid #000000', fontFamily: "'Times New Roman', Times, serif", fontSize: '8pt', fontWeight: 700, fontStyle: 'italic', lineHeight: 1, verticalAlign: 'baseline', padding: '0px 4px', height: '17px' }}
    >
      {showCrown && <Crown className="h-2.5 w-2.5 fill-white" strokeWidth={0} />}
      {!showCrown && <span style={{ display: 'inline-block', width: 10 }}>&nbsp;</span>}
    </span>
  );
}

function CaptionTaskBubble() {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap"
      style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000000', fontFamily: "'Times New Roman', Times, serif", fontSize: '8pt', fontWeight: 700, fontStyle: 'normal', lineHeight: 1, verticalAlign: 'baseline', padding: '0px 4px', height: '17px' }}
    >
      TX.X
    </span>
  );
}

function CaptionWPBubble() {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap"
      style={{ backgroundColor: '#000000', color: '#ffffff', border: '1.5px solid #000000', fontFamily: "'Times New Roman', Times, serif", fontSize: '8pt', fontWeight: 700, fontStyle: 'normal', lineHeight: 1, verticalAlign: 'baseline', padding: '0px 4px', height: '17px' }}
    >
      WPX
    </span>
  );
}

/* ── Sortable task group (wraps 3 rows in a tbody) ── */
function SortableTaskGroup({
  task,
  wp,
  participants,
  proposalId,
  projectDuration,
  saveTaskField,
  onDeleteTask,
}: {
  task: B31WPData['tasks'][0];
  wp: B31WPData;
  participants: B31Participant[];
  proposalId: string;
  projectDuration: number;
  saveTaskField: (taskId: string, field: string, value: string) => void;
  onDeleteTask: (taskId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const partnerIds = task.participants?.map(p => p.participant_id) || [];
  const queryClient = useQueryClient();

  return (
    <tbody ref={setNodeRef} style={style}>
      {/* Colour border above task */}
      <SpacerRow color={wp.color} />

      {/* Task header */}
      <tr>
        <td
          colSpan={2}
          className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight"
          style={{ padding: '1px 6px 1px 0px', border: 'none', position: 'relative', overflow: 'visible' }}
        >
          {/* Drag handle – left margin */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded touch-none print:hidden"
            title="Drag to reorder"
            style={{ position: 'absolute', left: '-28px', top: '50%', transform: 'translateY(-50%)' }}
          >
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          {/* Delete button – right margin */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="p-0.5 text-destructive hover:bg-destructive/10 rounded transition-colors print:hidden"
                title="Delete task"
                style={{ position: 'absolute', right: '-28px', top: '50%', transform: 'translateY(-50%)' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete task T{wp.number}.{task.number}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this task and its description. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => onDeleteTask(task.id)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex items-center gap-1">
            <span
              className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap"
              style={{ backgroundColor: '#fff', color: wp.color, border: `1.5px solid ${wp.color}`, fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, verticalAlign: 'baseline', padding: '0px 5px' }}
            >
              T{wp.number}.{task.number}
            </span>
            <span className="font-bold text-[11pt] font-['Times_New_Roman',Times,serif] leading-tight flex-1">
              <EditableHeaderText
                value={task.title || `Task ${task.number}`}
                onSave={(val) => saveTaskField(task.id, 'title', val)}
              />
            </span>
          </div>
        </td>
      </tr>

      {/* Task metadata row: duration | leader | partners */}
      <tr>
        <td className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle py-0" style={{ border: 'none', paddingLeft: '6px', paddingRight: '6px' }}>
          <div className="flex items-center flex-wrap gap-0.5">
            <MonthRangePicker taskId={task.id} startMonth={task.start_month} endMonth={task.end_month} proposalId={proposalId} projectDuration={projectDuration} />
            <span className="font-['Times_New_Roman',Times,serif] text-[11pt] text-muted-foreground mx-1">&nbsp;|&nbsp;</span>
            <LeaderPicker
              entityId={task.id}
              entityTable="wp_draft_tasks"
              currentLeaderId={task.lead_participant_id}
              participants={participants}
              proposalId={proposalId}
              showCrown
            />
            <PartnersPicker
              taskId={task.id}
              selectedIds={partnerIds}
              participants={participants}
              proposalId={proposalId}
              leaderId={task.lead_participant_id}
            />
          </div>
        </td>
      </tr>

      {/* Task description row */}
      <tr>
        <td
          colSpan={2}
          className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle py-0 cursor-text hover:bg-muted/30"
          style={{ border: 'none', paddingLeft: '6px', paddingRight: '6px' }}
        >
          <EditableText
            value={task.description || ''}
            placeholder="Enter task description..."
            onSave={async (val) => {
              await supabase.from('wp_draft_tasks').update({ description: val }).eq('id', task.id);
              queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
            }}
          />
        </td>
      </tr>

    </tbody>
  );
}

/* ── Main component ── */
export function B31WPDescriptionTables({ wpData, participants, proposalId, projectDuration = 36 }: Props) {
  const queryClient = useQueryClient();
  const populatedWPs = wpData;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (populatedWPs.length === 0) return null;

  const saveWPField = async (wpId: string, field: string, value: string) => {
    await supabase.from('wp_drafts').update({ [field]: value || null }).eq('id', wpId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  const saveTaskField = async (taskId: string, field: string, value: string) => {
    await supabase.from('wp_draft_tasks').update({ [field]: value || null }).eq('id', taskId);
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
  };

  const handleDeleteTask = async (taskId: string) => {
    const { error } = await supabase.from('wp_draft_tasks').delete().eq('id', taskId);
    if (error) {
      toast.error('Failed to delete task');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
    window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
    toast.success('Task deleted');
  };

  const handleTaskDragEnd = async (event: DragEndEvent, wp: B31WPData) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = wp.tasks.findIndex(t => t.id === active.id);
    const newIndex = wp.tasks.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Save previous order for undo
    const previousOrder = wp.tasks.map(t => t.id);

    const reordered = arrayMove(wp.tasks, oldIndex, newIndex);

    const applyOrder = async (taskIds: string[], label: string) => {
      console.log(`[applyOrder] ${label} - updating ${taskIds.length} tasks:`, taskIds);
      for (let i = 0; i < taskIds.length; i++) {
        const { error, data } = await supabase
          .from('wp_draft_tasks')
          .update({ order_index: i, number: i + 1 })
          .eq('id', taskIds[i])
          .select();
        console.log(`[applyOrder] ${label} - task ${taskIds[i]}: order_index=${i}, number=${i+1}`, error ? `ERROR: ${error.message}` : `OK (${data?.length} rows)`);
        if (error) {
          toast.error('Failed to reorder tasks');
          return false;
        }
      }
      console.log(`[applyOrder] ${label} - invalidating queries`);
      await queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
      await queryClient.invalidateQueries({ queryKey: ['wp-drafts-gantt', proposalId] });
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
      console.log(`[applyOrder] ${label} - done`);
      return true;
    };

    const reorderedIds = reordered.map(t => t.id);
    console.log('[handleTaskDragEnd] previousOrder:', previousOrder);
    console.log('[handleTaskDragEnd] reorderedIds:', reorderedIds);
    const success = await applyOrder(reorderedIds, 'reorder');
    if (success) {
      toast.success('Tasks reordered', {
        duration: 10000,
        action: {
          label: 'Undo',
          onClick: async () => {
            console.log('[Undo] clicked, previousOrder:', previousOrder);
            const undone = await applyOrder(previousOrder, 'undo');
            if (undone) {
              toast.success('Reorder undone');
            }
          },
        },
      });
    }
  };

  return (
    <div>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.b"
        label="Table 3.1.b."
        defaultCaption="Work package descriptions"
        suffix={<>Work package descriptions <CaptionWPBubble />, including objectives, task descriptions <CaptionTaskBubble />, task/WP leaders <CaptionParticipantBubble showCrown />, other task participants <CaptionParticipantBubble /> &amp; duration</>}
        className="mb-0"
      />
      {populatedWPs.map((wp, idx) => {
        const shortName = wp.short_name || wp.title || `WP${wp.number}`;
        const title = wp.title || `Work Package ${wp.number}`;
        const wpLeader = participants.find(p => p.id === wp.lead_participant_id);

        // Compute month range from tasks
        const starts = wp.tasks.map(t => t.start_month).filter((m): m is number => m != null);
        const ends = wp.tasks.map(t => t.end_month).filter((m): m is number => m != null);
        const monthRange = starts.length > 0 && ends.length > 0
          ? `M${String(Math.min(...starts)).padStart(2, '0')}–M${String(Math.max(...ends)).padStart(2, '0')}`
          : null;

        return (
          <div key={wp.id}>
            <div style={{ height: '0.7em' }} />
            <table
              className={`${tableStyles} w-full border-collapse`}
            >
              <tbody>
                {/* WP Header: pill bubble spanning full width */}
                <tr>
                  <td
                    colSpan={2}
                    className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight"
                    style={{ padding: '0 2px', border: 'none' }}
                  >
                    <span
                      className="inline-flex items-center rounded-full font-bold text-white w-full"
                      style={{ backgroundColor: wp.color, border: `1.5px solid ${wp.color}`, fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, padding: '0px 6px', color: '#ffffff' }}
                    >
                      WP{wp.number}:&nbsp;
                      <EditableHeaderText
                        value={shortName}
                        onSave={(val) => saveWPField(wp.id, 'short_name', val)}
                        className="text-white"
                      />
                      &nbsp;–&nbsp;
                      <EditableHeaderText
                        value={title}
                        onSave={(val) => saveWPField(wp.id, 'title', val)}
                        className="text-white"
                      />
                    </span>
                  </td>
                </tr>

                {/* Spacing between header and duration row */}
                <tr><td colSpan={2} style={{ border: 'none', padding: 0, height: '3px', lineHeight: '3px', fontSize: '1pt' }} /></tr>

                {/* WP duration + leader row */}
                <tr>
                  <td className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle py-0" style={{ border: 'none', paddingLeft: '6px', paddingRight: '6px' }}>
                    <div className="flex items-center flex-wrap gap-0.5">
                      <span className="font-bold text-[11pt] font-['Times_New_Roman',Times,serif] whitespace-nowrap" style={{ color: '#000000' }}>
                        {monthRange || <span className="text-muted-foreground italic font-normal">—</span>}
                      </span>
                      <span className="font-['Times_New_Roman',Times,serif] text-[11pt] text-muted-foreground mx-1">&nbsp;|&nbsp;</span>
                      <LeaderPicker
                        entityId={wp.id}
                        entityTable="wp_drafts"
                        currentLeaderId={wp.lead_participant_id}
                        participants={participants}
                        proposalId={proposalId}
                        showCrown
                      />
                    </div>
                  </td>
                </tr>

                {/* Spacer with WP colour border */}
                <SpacerRow color={wp.color} />

                {/* Objectives */}
                <tr>
                  <td colSpan={2} className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight align-middle py-0" style={{ border: 'none', paddingLeft: '6px', paddingRight: '6px' }}>
                    <span className="font-bold italic">Objectives: </span>
                    <EditableText
                      inline
                      value={wp.objectives || ''}
                      placeholder="Enter objectives..."
                      onSave={async (val) => {
                        await supabase.from('wp_drafts').update({ objectives: val }).eq('id', wp.id);
                        queryClient.invalidateQueries({ queryKey: ['b31-wp-data', proposalId] });
                      }}
                    />
                  </td>
                </tr>

              </tbody>

              {/* Tasks - each in its own sortable tbody */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleTaskDragEnd(event, wp)}
              >
                <SortableContext items={wp.tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  {wp.tasks.map(task => (
                    <SortableTaskGroup
                      key={task.id}
                      task={task}
                      wp={wp}
                      participants={participants}
                      proposalId={proposalId}
                      projectDuration={projectDuration}
                      saveTaskField={saveTaskField}
                      onDeleteTask={handleDeleteTask}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Colour border after last task */}
              <tbody><SpacerRow color={wp.color} /></tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
