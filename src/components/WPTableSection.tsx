import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Target, Plus, GripVertical, ArrowRight, Crown } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ParticipantMultiSelect } from '@/components/ParticipantMultiSelect';
import { WPSimpleEditor } from '@/components/WPSimpleEditor';
import type { WPDraftTask } from '@/hooks/useWPDrafts';
import type { ParticipantSummary } from '@/types/proposal';
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

interface WPOption {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
}

interface WPTableSectionProps {
  wpNumber: number;
  objectives: string | null;
  descriptionBeforeTasks: string | null;
  tasks: WPDraftTask[];
  participants: ParticipantSummary[];
  onObjectivesChange: (value: string) => void;
  onDescriptionBeforeTasksChange: (value: string) => void;
  onTaskUpdate: (taskId: string, updates: Partial<WPDraftTask>) => Promise<boolean>;
  onTaskAdd: () => Promise<any>;
  onTaskDelete: (taskId: string) => Promise<boolean>;
  onTaskParticipantsChange: (taskId: string, participantIds: string[]) => Promise<boolean>;
  onTaskReorder?: (newOrder: string[]) => Promise<boolean>;
  onTaskMove?: (taskId: string, targetWpDraftId: string) => Promise<boolean>;
  readOnly?: boolean;
  projectDuration?: number;
  hideToolbar?: boolean;
  allWpDrafts?: WPOption[];
  currentWpDraftId?: string;
}

export function WPTableSection({
  wpNumber,
  objectives,
  descriptionBeforeTasks,
  tasks,
  participants,
  onObjectivesChange,
  onDescriptionBeforeTasksChange,
  onTaskUpdate,
  onTaskAdd,
  onTaskDelete,
  onTaskParticipantsChange,
  onTaskReorder,
  onTaskMove,
  readOnly = false,
  projectDuration = 36,
  hideToolbar = false,
  allWpDrafts = [],
  currentWpDraftId,
}: WPTableSectionProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const monthOptions = Array.from({ length: projectDuration }, (_, i) => i + 1);

  const formatTaskNumber = (taskNum: number) => `T${wpNumber}.${taskNum}`;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onTaskReorder) return;

    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    
    onTaskReorder(reordered.map(t => t.id));
  };

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" />
          WP table (objective & tasks)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3 pt-0">
        {/* Objectives section */}
        <div className="space-y-2">
          <label className="text-draft font-medium">Objective</label>
          <WPSimpleEditor
            value={objectives || ''}
            onChange={onObjectivesChange}
            placeholder="State the overall objective of this work package..."
            disabled={readOnly}
            minHeight="80px"
            hideToolbar={hideToolbar}
          />
          <p className="text-draft text-muted-foreground">Describe the main objective of this work package. Use the bullet list button if you need multiple objectives.</p>
        </div>

        {/* Optional field before tasks */}
        <div className="space-y-2">
          <label className="text-draft font-medium">Optional field before tasks</label>
          <WPSimpleEditor
            value={descriptionBeforeTasks || ''}
            onChange={onDescriptionBeforeTasksChange}
            placeholder="Optional additional content before the tasks list..."
            disabled={readOnly}
            minHeight="60px"
            hideToolbar={hideToolbar}
          />
        </div>

        {/* Tasks list */}
        <div className="space-y-2">
          <label className="text-draft font-medium">Tasks</label>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {tasks.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    wpNumber={wpNumber}
                    participants={participants}
                    monthOptions={monthOptions}
                    projectDuration={projectDuration}
                    onUpdate={onTaskUpdate}
                    onDelete={onTaskDelete}
                    onParticipantsChange={onTaskParticipantsChange}
                    onMove={onTaskMove}
                    readOnly={readOnly}
                    formatTaskNumber={formatTaskNumber}
                    canReorder={!readOnly && !!onTaskReorder}
                    hideToolbar={hideToolbar}
                    allWpDrafts={allWpDrafts}
                    currentWpDraftId={currentWpDraftId}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={onTaskAdd}
              className="mt-2"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Task
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface SortableTaskCardProps {
  task: WPDraftTask;
  wpNumber: number;
  participants: ParticipantSummary[];
  monthOptions: number[];
  projectDuration: number;
  onUpdate: (taskId: string, updates: Partial<WPDraftTask>) => Promise<boolean>;
  onDelete: (taskId: string) => Promise<boolean>;
  onParticipantsChange: (taskId: string, participantIds: string[]) => Promise<boolean>;
  onMove?: (taskId: string, targetWpDraftId: string) => Promise<boolean>;
  readOnly: boolean;
  formatTaskNumber: (num: number) => string;
  canReorder: boolean;
  hideToolbar?: boolean;
  allWpDrafts?: WPOption[];
  currentWpDraftId?: string;
}

function SortableTaskCard({
  task,
  wpNumber,
  participants,
  monthOptions,
  projectDuration,
  onUpdate,
  onDelete,
  onParticipantsChange,
  onMove,
  readOnly,
  formatTaskNumber,
  canReorder,
  hideToolbar = false,
  allWpDrafts = [],
  currentWpDraftId,
}: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !canReorder });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [descriptionTimeout, setDescriptionTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleDescriptionChange = (value: string) => {
    if (descriptionTimeout) clearTimeout(descriptionTimeout);
    
    const timeout = setTimeout(() => {
      onUpdate(task.id, { description: value });
    }, 500);
    setDescriptionTimeout(timeout);
  };


  const selectedParticipantIds = (task.participants?.map(p => p.participant_id) || []).filter(id => id !== task.lead_participant_id);
  const availableParticipants = task.lead_participant_id ? participants.filter(p => p.id !== task.lead_participant_id) : participants;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border bg-card p-2 ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Row 1: Drag handle, Task number badge, Title, Delete */}
      <div className="flex items-center gap-1.5">
        {canReorder && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded touch-none flex-shrink-0"
          >
            <GripVertical className="w-4 h-4 text-blue-500" />
          </button>
        )}
        <span
          className="inline-flex items-center justify-center rounded-full font-bold select-none flex-shrink-0"
          style={{
            backgroundColor: '#ffffff',
            border: '1.5px solid #2563EB',
            color: '#2563EB',
            height: '22px',
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: '11pt',
            lineHeight: '22px',
            padding: '0px 5px',
          }}
        >
          {formatTaskNumber(task.number)}
        </span>
        <input
          value={localTitle}
          onChange={handleTitleChange}
          onFocus={() => { isFocused.current = true; }}
          onBlur={() => {
            // Flush pending debounced save immediately
            if (titleTimeout) {
              clearTimeout(titleTimeout);
              setTitleTimeout(null);
            }
            if ((localTitle || '') !== (task.title || '')) {
              onUpdate(task.id, { title: localTitle });
            }
            isFocused.current = false;
          }}
          placeholder="Task title..."
          className="h-6 text-draft flex-1 font-bold bg-transparent border-0 outline-none px-1 text-foreground placeholder:text-muted-foreground/60"
          style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt' }}
          disabled={readOnly}
        />
        {!readOnly && (
          <DeleteConfirmDialog
            itemLabel="this task"
            onConfirm={() => onDelete(task.id)}
          />
        )}
      </div>

      {/* Row 2: Leader, Participants, Timing */}
      <div className="flex items-center gap-1.5 mt-1.5 ml-5">
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-draft text-muted-foreground flex-shrink-0">Task Leader:</span>
          <Select
            value={task.lead_participant_id || ''}
            onValueChange={(value) => onUpdate(task.id, { lead_participant_id: value === '__clear__' ? null : value || null })}
            disabled={readOnly}
          >
            <SelectTrigger
              className={cn("h-auto border-0 shadow-none p-0 w-auto gap-0 text-draft", task.lead_participant_id ? "font-bold" : "font-normal")}
              style={task.lead_participant_id ? {
                backgroundColor: '#000000',
                color: '#ffffff',
                height: '17px',
                fontFamily: 'Times New Roman, serif',
                fontSize: '11pt',
                lineHeight: '17px',
                borderRadius: '9999px',
                paddingLeft: '18px',
                paddingRight: '6px',
                position: 'relative',
              } : undefined}
            >
              {task.lead_participant_id && (
                <Crown className="w-3 h-3 text-white fill-white absolute left-1.5 top-1/2 -translate-y-1/2" style={{ zIndex: 1 }} />
              )}
              <SelectValue placeholder="Select" className="font-normal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__clear__">
                <span className="text-muted-foreground italic">Clear selection</span>
              </SelectItem>
              {participants.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span
                    className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap"
                    style={{ backgroundColor: '#000000', color: '#ffffff', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, padding: '0px 5px', height: '17px' }}
                  >
                    {p.organisation_short_name || p.organisation_name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-draft text-muted-foreground flex-shrink-0">Participants:</span>
          <ParticipantMultiSelect
            participants={availableParticipants}
            selectedIds={selectedParticipantIds}
            onChange={(ids) => onParticipantsChange(task.id, ids)}
            disabled={readOnly}
          />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          <TimingRangePicker
            task={task}
            projectDuration={projectDuration}
            readOnly={readOnly}
            onUpdate={onUpdate}
          />

          {/* Move to another WP */}
          {!readOnly && onMove && allWpDrafts.filter(wp => wp.id !== currentWpDraftId).length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
                  <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Move to another WP draft</DropdownMenuLabel>
                {allWpDrafts
                  .filter(wp => wp.id !== currentWpDraftId)
                  .map(wp => (
                    <DropdownMenuItem
                      key={wp.id}
                      onClick={() => onMove(task.id, wp.id)}
                    >
                      WP{wp.number}{wp.short_name ? `: ${wp.short_name}` : wp.title ? `: ${wp.title}` : ''}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Row 3: Description editor */}
      <div className="mt-2 ml-5">
        <WPSimpleEditor
          value={task.description || ''}
          onChange={handleDescriptionChange}
          placeholder="Task description..."
          disabled={readOnly}
          minHeight="60px"
          hideToolbar={hideToolbar}
        />
      </div>
    </div>
  );
}

/* ── Timing range picker (grid-based, same as B3.1) ── */
function TimingRangePicker({
  task,
  projectDuration,
  readOnly,
  onUpdate,
}: {
  task: WPDraftTask;
  projectDuration: number;
  readOnly: boolean;
  onUpdate: (taskId: string, updates: Partial<WPDraftTask>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<'start' | 'end' | null>(null);
  const [localStart, setLocalStart] = useState(task.start_month);
  const [localEnd, setLocalEnd] = useState(task.end_month);

  const months = Array.from({ length: projectDuration }, (_, i) => i + 1);

  const handleClick = (m: number) => {
    if (selecting === 'start' || !selecting) {
      setLocalStart(m);
      if (localEnd != null && m > localEnd) setLocalEnd(null);
      setSelecting('end');
    } else {
      if (m < (localStart ?? 1)) {
        setLocalStart(m);
        setSelecting('end');
      } else {
        setLocalEnd(m);
        setSelecting(null);
        onUpdate(task.id, { start_month: localStart, end_month: m });
        setOpen(false);
      }
    }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setLocalStart(task.start_month);
      setLocalEnd(task.end_month);
      setSelecting('start');
    }
  };

  const fmt = (m: number | null) => m != null ? `M${String(m).padStart(2, '0')}` : null;

  return (
    <>
      <span className="text-draft text-muted-foreground">Timing:</span>
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <button className="cursor-pointer hover:opacity-80 text-draft h-6 px-2 border rounded-md bg-background" disabled={readOnly}>
            {task.start_month != null && task.end_month != null ? (
              <>{fmt(task.start_month)}–{fmt(task.end_month)}</>
            ) : task.start_month != null ? (
              <>{fmt(task.start_month)}–<span className="text-muted-foreground italic">M??</span></>
            ) : (
              <span className="text-muted-foreground italic font-normal">Select</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-2" align="end">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-draft text-muted-foreground font-medium">
              {selecting === 'start' ? 'Select start month' : selecting === 'end' ? 'Select end month' : 'Select start month'}
            </span>
            {(task.start_month != null || task.end_month != null) && (
              <button
                className="text-draft text-muted-foreground hover:text-foreground italic cursor-pointer"
                onClick={() => {
                  setLocalStart(null);
                  setLocalEnd(null);
                  onUpdate(task.id, { start_month: null, end_month: null });
                  setOpen(false);
                }}
              >
                Clear
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
                    'px-1 py-0.5 text-draft rounded cursor-pointer text-center',
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
    </>
  );
}