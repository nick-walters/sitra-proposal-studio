import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Plus, GripVertical, ArrowRight } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { SingleMonthPicker } from '@/components/SingleMonthPicker';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WPDraftDeliverable } from '@/hooks/useWPDrafts';
import type { ParticipantSummary } from '@/types/proposal';
import { ParticipantBubble } from '@/components/B31Pill';
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

interface WPDeliverablesTableProps {
  wpNumber: number;
  deliverables: WPDraftDeliverable[];
  participants: ParticipantSummary[];
  onDeliverableUpdate: (id: string, updates: Partial<WPDraftDeliverable>) => Promise<boolean>;
  onDeliverableAdd: () => Promise<any>;
  onDeliverableDelete: (id: string) => Promise<boolean>;
  onDeliverableReorder?: (newOrder: string[]) => Promise<boolean>;
  onDeliverableMove?: (deliverableId: string, targetWpDraftId: string) => Promise<boolean>;
  readOnly?: boolean;
  projectDuration?: number;
  allWpDrafts?: WPOption[];
  currentWpDraftId?: string;
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
  { value: 'PU', label: 'Public', description: 'Fully open, e.g. web (Deliverables flagged as public will be automatically published on CORDIS)' },
  { value: 'SEN', label: 'Sensitive', description: 'Limited under the conditions of the Grant Agreement' },
  { value: 'EU-RES', label: 'EU Restricted', description: 'Classified with the mention of the classification level RESTREINT UE/EU RESTRICTED' },
  { value: 'EU-CON', label: 'EU Confidential', description: 'Classified with the mention of the classification level CONFIDENTIEL UE/EU CONFIDENTIAL' },
  { value: 'EU-SEC', label: 'EU Secret', description: 'Classified with the mention of the classification level SECRET UE/EU SECRET' },
];

export function WPDeliverablesTable({
  wpNumber,
  deliverables,
  participants,
  onDeliverableUpdate,
  onDeliverableAdd,
  onDeliverableDelete,
  onDeliverableReorder,
  onDeliverableMove,
  readOnly = false,
  projectDuration = 36,
  allWpDrafts = [],
  currentWpDraftId,
}: WPDeliverablesTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const monthOptions = Array.from({ length: projectDuration || 72 }, (_, i) => i + 1);

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
                  onMove={onDeliverableMove}
                  readOnly={readOnly}
                  formatNumber={formatDeliverableNumber}
                  canReorder={!readOnly && !!onDeliverableReorder}
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
  participants: ParticipantSummary[];
  monthOptions: number[];
  onUpdate: (id: string, updates: Partial<WPDraftDeliverable>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onMove?: (deliverableId: string, targetWpDraftId: string) => Promise<boolean>;
  readOnly: boolean;
  formatNumber: (num: number) => string;
  canReorder: boolean;
  allWpDrafts?: WPOption[];
  currentWpDraftId?: string;
}

function SortableDeliverableCard({
  deliverable,
  wpNumber,
  participants,
  monthOptions,
  onUpdate,
  onDelete,
  onMove,
  readOnly,
  formatNumber,
  canReorder,
  allWpDrafts = [],
  currentWpDraftId,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border bg-card p-2 ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Row 1: Drag handle, Deliverable number pennant badge, Title, Delete */}
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
        <span className="flex-shrink-0 select-none" style={{ display: 'inline-block', position: 'relative', width: 52, height: 20 }}>
          <svg width={52} height={20} viewBox="0 0 52 20" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
            <path d="M 0,0 L 42,0 L 52,10 L 42,20 L 0,20 Z" fill="#ffffff" stroke="#2563EB" strokeWidth={1.5} strokeLinejoin="round" />
          </svg>
          <span style={{ position: 'absolute', top: 0, left: 0, width: 42, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, color: '#2563EB', whiteSpace: 'nowrap' }}>
            {formatNumber(deliverable.number)}
          </span>
        </span>
        <DebouncedInput
          value={deliverable.title || ''}
          onDebouncedChange={(val) => { onUpdate(deliverable.id, { title: val }); }}
          debounceMs={500}
          placeholder="Deliverable title..."
          className="h-6 text-draft flex-1 font-bold bg-transparent border-0 outline-none px-1 text-foreground placeholder:text-muted-foreground/60 shadow-none focus-visible:ring-0"
          style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt' }}
          disabled={readOnly}
        />
        {!readOnly && (
          <DeleteConfirmDialog
            itemLabel="this deliverable"
            onConfirm={() => onDelete(deliverable.id)}
          />
        )}
      </div>

      {/* Row 2: Type, Responsible, Dissemination, Due month */}
      <div className="flex items-center gap-1.5 mt-1.5 ml-5">
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-draft text-muted-foreground">Type:</span>
          <Select
            value={deliverable.type || ''}
            onValueChange={(value) => onUpdate(deliverable.id, { type: value === '__clear__' ? null : value })}
            disabled={readOnly}
          >
            <SelectTrigger hideArrow className="h-6 w-[75px] text-draft px-1.5">
              <span>{deliverable.type || 'Select'}</span>
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="__clear__">
                <span className="text-muted-foreground italic">Clear</span>
              </SelectItem>
              {DELIVERABLE_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value} textValue={type.value}>
                  <div className="flex flex-col">
                    <span>{type.value} – {type.label}</span>
                    <span className="text-draft text-muted-foreground">{type.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-draft text-muted-foreground">Dissemination level:</span>
          <Select
            value={deliverable.dissemination_level || 'PU'}
            onValueChange={(value) => onUpdate(deliverable.id, { dissemination_level: value === '__clear__' ? null : value })}
            disabled={readOnly}
          >
            <SelectTrigger hideArrow className="h-6 w-[77px] text-draft px-1.5">
              <span>{deliverable.dissemination_level || 'Select'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__clear__">
                <span className="text-muted-foreground italic">Clear</span>
              </SelectItem>
              {DISSEMINATION_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value} textValue={level.value}>
                  <div className="flex flex-col">
                    <span>{level.value} – {level.label}</span>
                    <span className="text-draft text-muted-foreground">{level.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-draft text-muted-foreground">Partner responsible:</span>
          <Select
            value={deliverable.responsible_participant_id || ''}
            onValueChange={(value) => onUpdate(deliverable.id, { responsible_participant_id: value === '__clear__' ? null : value || null })}
            disabled={readOnly}
          >
            <SelectTrigger
              className={cn("h-auto border-0 shadow-none p-0 w-auto gap-0 text-draft", deliverable.responsible_participant_id ? "font-bold" : "font-normal")}
              style={deliverable.responsible_participant_id ? {
                backgroundColor: '#000000',
                color: '#ffffff',
                height: '17px',
                fontFamily: 'Times New Roman, serif',
                fontSize: '11pt',
                lineHeight: '17px',
                borderRadius: '9999px',
                paddingLeft: '6px',
                paddingRight: '6px',
              } : undefined}
            >
              <SelectValue placeholder="Select" className="font-normal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__clear__">
                <span className="text-muted-foreground italic">Clear selection</span>
              </SelectItem>
              {participants.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <ParticipantBubble>
                    {p.organisation_short_name || p.organisation_name}
                  </ParticipantBubble>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          <SingleMonthPicker
            value={deliverable.due_month}
            projectDuration={monthOptions.length}
            readOnly={readOnly}
            onChange={(m) => onUpdate(deliverable.id, { due_month: m })}
            label="Due:"
          />

          {/* Move to another WP */}
          {!readOnly && onMove && allWpDrafts.filter(wp => wp.id !== currentWpDraftId).length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" aria-label="Forward" title="Forward">
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
                      onClick={() => onMove(deliverable.id, wp.id)}
                    >
                      WP{wp.number}{wp.short_name ? `: ${wp.short_name}` : wp.title ? `: ${wp.title}` : ''}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
