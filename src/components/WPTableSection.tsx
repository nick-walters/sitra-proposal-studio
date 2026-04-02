import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Target, Plus, Trash2, GripVertical, ArrowRight, Crown } from 'lucide-react';
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
          <label className="text-xs font-medium">Objective</label>
          <WPSimpleEditor
            value={objectives || ''}
            onChange={onObjectivesChange}
            placeholder="State the overall objective of this work package..."
            disabled={readOnly}
            minHeight="80px"
            hideToolbar={hideToolbar}
          />
          <p className="text-xs text-muted-foreground">Describe the main objective of this work package. Use the bullet list button if you need multiple objectives.</p>
        </div>

        {/* Optional field before tasks */}
        <div className="space-y-2">
          <label className="text-xs font-medium">Optional field before tasks</label>
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
          <label className="text-xs font-medium">Tasks</label>
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

  const [localTitle, setLocalTitle] = useState(task.title || '');
  const [titleTimeout, setTitleTimeout] = useState<NodeJS.Timeout | null>(null);
  const [descriptionTimeout, setDescriptionTimeout] = useState<NodeJS.Timeout | null>(null);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setLocalTitle(task.title || '');
  }, [task.title]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalTitle(newValue);

    if (titleTimeout) clearTimeout(titleTimeout);
    
    const timeout = setTimeout(() => {
      onUpdate(task.id, { title: newValue });
    }, 500);
    setTitleTimeout(timeout);
  };

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
      {/* Row 1: Drag handle, Task number, Title, Delete */}
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
        <span className="text-sm text-foreground font-bold flex-shrink-0" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
          {formatTaskNumber(task.number)}:
        </span>
        <Input
          value={localTitle}
          onChange={handleTitleChange}
          onFocus={() => { isFocused.current = true; }}
          onBlur={() => { isFocused.current = false; }}
          placeholder="Task title..."
          className="h-6 text-xs flex-1 font-bold"
          disabled={readOnly}
        />
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive flex-shrink-0"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Row 2: Leader, Participants, Timing */}
      <div className="flex items-center gap-1.5 mt-1.5 ml-5">
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground flex-shrink-0">Task Leader:</span>
          <Select
            value={task.lead_participant_id || ''}
            onValueChange={(value) => onUpdate(task.id, { lead_participant_id: value || null })}
            disabled={readOnly}
          >
            <SelectTrigger
              className="h-auto border-0 shadow-none p-0 w-auto gap-0 text-xs font-bold"
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
              <SelectValue placeholder="Select leader" />
            </SelectTrigger>
            <SelectContent>
              {participants.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.organisation_short_name || p.organisation_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-xs text-muted-foreground flex-shrink-0">Participants:</span>
          <ParticipantMultiSelect
            participants={availableParticipants}
            selectedIds={selectedParticipantIds}
            onChange={(ids) => onParticipantsChange(task.id, ids)}
            disabled={readOnly}
          />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          <span className="text-xs text-muted-foreground">Timing:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 text-xs px-2 min-w-[90px]" disabled={readOnly}>
                {task.start_month && task.end_month
                  ? `M${task.start_month.toString().padStart(2, '0')} – M${task.end_month.toString().padStart(2, '0')}`
                  : task.start_month
                    ? `M${task.start_month.toString().padStart(2, '0')} – ...`
                    : task.end_month
                      ? `... – M${task.end_month.toString().padStart(2, '0')}`
                      : 'Select range'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>M{(task.start_month || 1).toString().padStart(2, '0')}</span>
                  <span>M{(task.end_month || projectDuration).toString().padStart(2, '0')}</span>
                </div>
                <Slider
                  min={1}
                  max={projectDuration}
                  step={1}
                  value={[task.start_month || 1, task.end_month || projectDuration]}
                  onValueChange={(values) => {
                    onUpdate(task.id, { start_month: values[0], end_month: values[1] });
                  }}
                  minStepsBetweenThumbs={0}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>M01</span>
                  <span>M{projectDuration.toString().padStart(2, '0')}</span>
                </div>
              </div>
            </PopoverContent>
          </Popover>

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