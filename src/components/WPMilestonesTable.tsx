import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Flag, Plus, Trash2, GripVertical } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WPDraftMilestone } from '@/hooks/useWPDrafts';
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

interface WPMilestonesTableProps {
  wpNumber: number;
  milestones: WPDraftMilestone[];
  onMilestoneUpdate: (id: string, updates: Partial<WPDraftMilestone>) => Promise<boolean>;
  onMilestoneAdd: () => Promise<any>;
  onMilestoneDelete: (id: string) => Promise<boolean>;
  onMilestoneReorder?: (newOrder: string[]) => Promise<boolean>;
  readOnly?: boolean;
  projectDuration?: number;
}

export function WPMilestonesTable({
  wpNumber,
  milestones,
  onMilestoneUpdate,
  onMilestoneAdd,
  onMilestoneDelete,
  onMilestoneReorder,
  readOnly = false,
  projectDuration = 48,
}: WPMilestonesTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const monthOptions = Array.from({ length: projectDuration }, (_, i) => i + 1);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onMilestoneReorder) return;

    const oldIndex = milestones.findIndex((m) => m.id === active.id);
    const newIndex = milestones.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(milestones, oldIndex, newIndex);

    onMilestoneReorder(reordered.map(m => m.id));
  };

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flag className="h-4 w-4" />
          Milestones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-3 pt-0">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={milestones.map(m => m.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {milestones.map((milestone) => (
                <SortableMilestoneCard
                  key={milestone.id}
                  milestone={milestone}
                  onUpdate={onMilestoneUpdate}
                  onDelete={onMilestoneDelete}
                  readOnly={readOnly}
                  canReorder={!readOnly && !!onMilestoneReorder}
                  monthOptions={monthOptions}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={onMilestoneAdd}
            className="mt-1"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Milestone
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface SortableMilestoneCardProps {
  milestone: WPDraftMilestone;
  onUpdate: (id: string, updates: Partial<WPDraftMilestone>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  readOnly: boolean;
  canReorder: boolean;
  monthOptions: number[];
}

function SortableMilestoneCard({
  milestone,
  onUpdate,
  onDelete,
  readOnly,
  canReorder,
  monthOptions,
}: SortableMilestoneCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: milestone.id, disabled: !canReorder });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [localTitle, setLocalTitle] = useState(milestone.title || '');
  const [localRelatedWps, setLocalRelatedWps] = useState(milestone.related_wps || '');
  const [localVerification, setLocalVerification] = useState(milestone.means_of_verification || '');
  const [titleTimeout, setTitleTimeout] = useState<NodeJS.Timeout | null>(null);
  const [relatedWpsTimeout, setRelatedWpsTimeout] = useState<NodeJS.Timeout | null>(null);
  const [verificationTimeout, setVerificationTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => { setLocalTitle(milestone.title || ''); }, [milestone.title]);
  useEffect(() => { setLocalRelatedWps(milestone.related_wps || ''); }, [milestone.related_wps]);
  useEffect(() => { setLocalVerification(milestone.means_of_verification || ''); }, [milestone.means_of_verification]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalTitle(newValue);
    if (titleTimeout) clearTimeout(titleTimeout);
    const timeout = setTimeout(() => { onUpdate(milestone.id, { title: newValue }); }, 500);
    setTitleTimeout(timeout);
  };

  const handleRelatedWpsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalRelatedWps(newValue);
    if (relatedWpsTimeout) clearTimeout(relatedWpsTimeout);
    const timeout = setTimeout(() => { onUpdate(milestone.id, { related_wps: newValue }); }, 500);
    setRelatedWpsTimeout(timeout);
  };

  const handleVerificationChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalVerification(newValue);
    if (verificationTimeout) clearTimeout(verificationTimeout);
    const timeout = setTimeout(() => { onUpdate(milestone.id, { means_of_verification: newValue }); }, 500);
    setVerificationTimeout(timeout);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border bg-card p-2 ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Row 1: Drag handle, MS number, Title, Due month, Delete */}
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
        <span className="text-xs text-muted-foreground flex-shrink-0">MS:</span>
        <Input
          value={localTitle}
          onChange={handleTitleChange}
          placeholder="Milestone title..."
          className="h-6 text-xs flex-1"
          disabled={readOnly}
        />
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Related WPs:</span>
          <Input
            value={localRelatedWps}
            onChange={handleRelatedWpsChange}
            placeholder="e.g. WP1, WP3"
            className="h-6 text-xs w-[90px]"
            disabled={readOnly}
          />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Due:</span>
          <Select
            value={milestone.due_month?.toString() || ''}
            onValueChange={(value) => onUpdate(milestone.id, { due_month: value ? parseInt(value) : null })}
            disabled={readOnly}
          >
            <SelectTrigger hideArrow className="h-6 w-[45px] text-xs px-1">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m.toString()}>M{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0"
            onClick={() => onDelete(milestone.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Row 2: Means of verification */}
      <div className="flex items-start gap-1.5 mt-1.5 ml-5">
        <Textarea
          value={localVerification}
          onChange={handleVerificationChange}
          placeholder="Describe means of verification..."
          className="min-h-[40px] resize-y text-xs flex-1"
          disabled={readOnly}
        />
      </div>
    </div>
  );
}
