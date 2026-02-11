import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, Plus, Trash2, GripVertical } from 'lucide-react';
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

interface WPTableSectionProps {
  wpNumber: number;
  objectives: string | null;
  tasks: WPDraftTask[];
  participants: ParticipantSummary[];
  onObjectivesChange: (value: string) => void;
  onTaskUpdate: (taskId: string, updates: Partial<WPDraftTask>) => Promise<boolean>;
  onTaskAdd: () => Promise<any>;
  onTaskDelete: (taskId: string) => Promise<boolean>;
  onTaskParticipantsChange: (taskId: string, participantIds: string[]) => Promise<boolean>;
  onTaskReorder?: (newOrder: string[]) => Promise<boolean>;
  readOnly?: boolean;
  projectDuration?: number;
  hideToolbar?: boolean;
}

export function WPTableSection({
  wpNumber,
  objectives,
  tasks,
  participants,
  onObjectivesChange,
  onTaskUpdate,
  onTaskAdd,
  onTaskDelete,
  onTaskParticipantsChange,
  onTaskReorder,
  readOnly = false,
  projectDuration = 36,
  hideToolbar = false,
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
                    onUpdate={onTaskUpdate}
                    onDelete={onTaskDelete}
                    onParticipantsChange={onTaskParticipantsChange}
                    readOnly={readOnly}
                    formatTaskNumber={formatTaskNumber}
                    canReorder={!readOnly && !!onTaskReorder}
                    hideToolbar={hideToolbar}
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
  onUpdate: (taskId: string, updates: Partial<WPDraftTask>) => Promise<boolean>;
  onDelete: (taskId: string) => Promise<boolean>;
  onParticipantsChange: (taskId: string, participantIds: string[]) => Promise<boolean>;
  readOnly: boolean;
  formatTaskNumber: (num: number) => string;
  canReorder: boolean;
  hideToolbar?: boolean;
}

function SortableTaskCard({
  task,
  wpNumber,
  participants,
  monthOptions,
  onUpdate,
  onDelete,
  onParticipantsChange,
  readOnly,
  formatTaskNumber,
  canReorder,
  hideToolbar = false,
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

  useEffect(() => {
    setLocalTitle(task.title || '');
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

  const selectedParticipantIds = task.participants?.map(p => p.participant_id) || [];

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
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        <span className="text-sm text-foreground font-medium flex-shrink-0 w-[52px]" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
          {formatTaskNumber(task.number)}:
        </span>
        <Input
          value={localTitle}
          onChange={handleTitleChange}
          placeholder="Task title..."
          className="h-6 text-xs flex-1"
          disabled={readOnly}
        />
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Row 2: Leader, Participants, Timing */}
      <div className="flex items-center gap-1.5 mt-1.5 ml-5">
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Task leader:</span>
          <Select
            value={task.lead_participant_id || ''}
            onValueChange={(value) => onUpdate(task.id, { lead_participant_id: value || null })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-6 w-[90px] text-xs px-1.5">
              <SelectValue placeholder="Select" />
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
            participants={participants}
            selectedIds={selectedParticipantIds}
            onChange={(ids) => onParticipantsChange(task.id, ids)}
            disabled={readOnly}
          />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          <span className="text-xs text-muted-foreground">Timing:</span>
          <Select
            value={task.start_month?.toString() || ''}
            onValueChange={(value) => onUpdate(task.id, { start_month: value ? parseInt(value) : null })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-6 w-[52px] text-xs px-1">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m.toString()}>M{m.toString().padStart(2, '0')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">–</span>
          <Select
            value={task.end_month?.toString() || ''}
            onValueChange={(value) => onUpdate(task.id, { end_month: value ? parseInt(value) : null })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-6 w-[52px] text-xs px-1">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m.toString()}>M{m.toString().padStart(2, '0')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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