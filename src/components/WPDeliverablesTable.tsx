import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Plus, Trash2, GripVertical } from 'lucide-react';
import type { WPDraftDeliverable } from '@/hooks/useWPDrafts';
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

interface Participant {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string;
  participant_number: number | null;
}

interface WPDeliverablesTableProps {
  wpNumber: number;
  deliverables: WPDraftDeliverable[];
  participants: Participant[];
  onDeliverableUpdate: (id: string, updates: Partial<WPDraftDeliverable>) => Promise<boolean>;
  onDeliverableAdd: () => Promise<any>;
  onDeliverableDelete: (id: string) => Promise<boolean>;
  onDeliverableReorder?: (newOrder: string[]) => Promise<boolean>;
  readOnly?: boolean;
  projectDuration?: number;
}

const DELIVERABLE_TYPES = [
  { value: 'R', label: 'Report', description: 'Document, report (excluding the periodic and final reports)' },
  { value: 'DEM', label: 'Demonstrator', description: 'Demonstrator, pilot, prototype, plan designs' },
  { value: 'DEC', label: 'Dissemination', description: 'Websites, patents filing, press & media actions, videos, etc.' },
  { value: 'DATA', label: 'Data', description: 'Data sets, microdata, etc.' },
  { value: 'DMP', label: 'Data management plan', description: 'Data management plan' },
  { value: 'ETHICS', label: 'Ethics', description: 'Deliverables related to ethics issues' },
  { value: 'SECURITY', label: 'Security', description: 'Deliverables related to security issues' },
  { value: 'OTHER', label: 'Other', description: 'Software, technical diagram, algorithms, models, etc.' },
];

const DISSEMINATION_LEVELS = [
  { value: 'PU', label: 'Public' },
  { value: 'SEN', label: 'Sensitive' },
  { value: 'EU-RES', label: 'EU Restricted' },
  { value: 'EU-CON', label: 'EU Confidential' },
  { value: 'EU-SEC', label: 'EU Secret' },
];

export function WPDeliverablesTable({
  wpNumber,
  deliverables,
  participants,
  onDeliverableUpdate,
  onDeliverableAdd,
  onDeliverableDelete,
  onDeliverableReorder,
  readOnly = false,
  projectDuration = 36,
}: WPDeliverablesTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const monthOptions = Array.from({ length: projectDuration }, (_, i) => i + 1);

  const formatDeliverableNumber = (num: number) => `D${wpNumber}.${num}`;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onDeliverableReorder) return;

    const oldIndex = deliverables.findIndex((d) => d.id === active.id);
    const newIndex = deliverables.findIndex((d) => d.id === over.id);
    const reordered = arrayMove(deliverables, oldIndex, newIndex);
    
    onDeliverableReorder(reordered.map(d => d.id));
  };

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" />
          Deliverables
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-3 pt-0">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={deliverables.map(d => d.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {deliverables.map((deliverable) => (
                <SortableDeliverableCard
                  key={deliverable.id}
                  deliverable={deliverable}
                  wpNumber={wpNumber}
                  participants={participants}
                  monthOptions={monthOptions}
                  onUpdate={onDeliverableUpdate}
                  onDelete={onDeliverableDelete}
                  readOnly={readOnly}
                  formatNumber={formatDeliverableNumber}
                  canReorder={!readOnly && !!onDeliverableReorder}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDeliverableAdd}
            className="mt-1"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Deliverable
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface SortableDeliverableCardProps {
  deliverable: WPDraftDeliverable;
  wpNumber: number;
  participants: Participant[];
  monthOptions: number[];
  onUpdate: (id: string, updates: Partial<WPDraftDeliverable>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  readOnly: boolean;
  formatNumber: (num: number) => string;
  canReorder: boolean;
}

function SortableDeliverableCard({
  deliverable,
  wpNumber,
  participants,
  monthOptions,
  onUpdate,
  onDelete,
  readOnly,
  formatNumber,
  canReorder,
}: SortableDeliverableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deliverable.id, disabled: !canReorder });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [localTitle, setLocalTitle] = useState(deliverable.title || '');
  const [titleTimeout, setTitleTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalTitle(deliverable.title || '');
  }, [deliverable.title]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalTitle(newValue);

    if (titleTimeout) clearTimeout(titleTimeout);
    
    const timeout = setTimeout(() => {
      onUpdate(deliverable.id, { title: newValue });
    }, 500);
    setTitleTimeout(timeout);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border bg-card p-2 ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Row 1: Drag handle, Deliverable number + Title, Delete */}
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
          {formatNumber(deliverable.number)}:
        </span>
        <Input
          value={localTitle}
          onChange={handleTitleChange}
          placeholder="Deliverable title..."
          className="h-6 text-xs flex-1"
          disabled={readOnly}
        />
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0"
            onClick={() => onDelete(deliverable.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Row 2: Type, Responsible, Dissemination, Due month */}
      <div className="flex items-center gap-1.5 mt-1.5 ml-5">
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Type:</span>
          <Select
            value={deliverable.type || ''}
            onValueChange={(value) => onUpdate(deliverable.id, { type: value })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-6 w-[75px] text-xs px-1.5">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              {DELIVERABLE_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <div className="flex flex-col">
                    <span>{type.value}</span>
                    <span className="text-xs text-muted-foreground">{type.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Diss.:</span>
          <Select
            value={deliverable.dissemination_level || 'PU'}
            onValueChange={(value) => onUpdate(deliverable.id, { dissemination_level: value })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-6 w-[70px] text-xs px-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISSEMINATION_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Responsible:</span>
          <Select
            value={deliverable.responsible_participant_id || ''}
            onValueChange={(value) => onUpdate(deliverable.id, { responsible_participant_id: value || null })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-6 w-[90px] text-xs px-1.5">
              <SelectValue placeholder="Select..." />
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

        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          <span className="text-xs text-muted-foreground">Due:</span>
          <Select
            value={deliverable.due_month?.toString() || ''}
            onValueChange={(value) => onUpdate(deliverable.id, { due_month: value ? parseInt(value) : null })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-6 w-[55px] text-xs px-1">
              <SelectValue placeholder="M" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m.toString()}>M{m.toString().padStart(2, '0')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
