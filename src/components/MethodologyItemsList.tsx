import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { GripVertical, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ParticipantBubble } from '@/components/B31Pill';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { MethodologyRichEditor } from '@/components/MethodologyRichEditor';
import { useMethodologyItems, type MethodologyItem } from '@/hooks/useMethodologyItems';
import {
  useMethodologyCasePlaceholders,
  type CaseTypeLite,
} from '@/hooks/useMethodologyCasePlaceholders';
import { getCaseTypeLabel } from '@/lib/caseTypeLabels';


interface ParticipantSummary {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string | null;
  english_name: string | null;
  participant_number: number | null;
}

interface MethodologyItemsListProps {
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
}

interface SortableItemRowProps {
  item: MethodologyItem;
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
  participants: ParticipantSummary[];
  onHeadingChange: (id: string, heading: string) => void;
  onContentChange: (id: string, html: string) => void;
  onAssign: (id: string, participantId: string | null) => void;
  onDelete: (id: string) => void;
}

function SortableItemRow({
  item,
  proposalId,
  canEdit,
  isCoordinator,
  participants,
  onHeadingChange,
  onContentChange,
  onAssign,
  onDelete,
}: SortableItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const [assignOpen, setAssignOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const selected = participants.find((p) => p.id === item.assignedParticipantId);

  return (
    <div ref={setNodeRef} style={style} className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        {canEdit && (
          <button
            type="button"
            className="cursor-grab touch-none text-[#2563EB]"
            aria-label="Reorder methodology"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <div className="flex min-w-0 flex-1 items-center">
          <input
            value={item.heading}
            onChange={(e) => onHeadingChange(item.id, e.target.value)}
            placeholder="Methodology name"
            disabled={!canEdit}
            className="min-w-0 flex-1 bg-transparent font-bold italic outline-none placeholder:font-normal placeholder:not-italic placeholder:text-muted-foreground"
          />
          <span className="font-bold italic" aria-hidden="true">
            :
          </span>
        </div>

        {selected ? (
          <ParticipantBubble
            onClick={() => {
              if (canEdit) setAssignOpen(true);
            }}
            style={{
              fontSize: '12px',
              height: 'auto',
              padding: '2px 8px',
              cursor: canEdit ? 'pointer' : 'default',
              opacity: canEdit ? 1 : 0.6,
            }}
            className="whitespace-nowrap hover:ring-2 hover:ring-primary/30 transition-all"
          >
            {selected.organisation_short_name || `P${selected.participant_number}`}
          </ParticipantBubble>
        ) : (
          canEdit && (
            <button
              type="button"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold transition-all hover:ring-2 hover:ring-primary/30"
              style={{ border: '1px dashed hsl(var(--muted-foreground))' }}
              onClick={() => setAssignOpen(true)}
            >
              + Assign
            </button>
          )
        )}

        {canEdit && (
          <DeleteConfirmDialog
            itemLabel="this methodology"
            onConfirm={() => onDelete(item.id)}
          />
        )}
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Assign methodology</DialogTitle>
            <DialogDescription>
              Choose a partner organisation responsible for writing this methodology.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1 p-1">
              <button
                onClick={() => {
                  onAssign(item.id, null);
                  setAssignOpen(false);
                }}
                className="w-full rounded-md p-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/80"
              >
                None
              </button>
              {participants.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onAssign(item.id, p.id);
                    setAssignOpen(false);
                  }}
                  className="flex w-full items-center rounded-md p-3 text-left transition-colors hover:bg-muted/80"
                >
                  <div className="w-24 shrink-0">
                    <ParticipantBubble style={{ fontSize: '12px', height: 'auto', padding: '2px 8px' }}>
                      {p.organisation_short_name || `P${p.participant_number}`}
                    </ParticipantBubble>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{p.organisation_name}</div>
                    {p.english_name && p.english_name !== p.organisation_name && (
                      <div className="truncate text-xs text-muted-foreground">{p.english_name}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <MethodologyRichEditor
        proposalId={proposalId}
        value={item.contentHtml ?? ''}
        onChange={(html) => onContentChange(item.id, html)}
        canEdit={canEdit}
        isCoordinator={isCoordinator}
        minHeight="120px"
      />
    </div>
  );
}
function SortablePlaceholderRow({
  item,
  canEdit,
  caseTypes,
}: {
  item: MethodologyItem;
  canEdit: boolean;
  caseTypes: CaseTypeLite[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const type = caseTypes.find((t) => t.id === item.caseTypeId);
  const label = `${getCaseTypeLabel(type?.type_code ?? null, type?.custom_type_name ?? null, {
    plural: true,
  })} table`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2"
    >
      {canEdit && (
        <button
          type="button"
          className="cursor-grab touch-none text-[#2563EB]"
          aria-label="Reorder table placeholder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">
          Content comes from the case drafts. Drag to set where this table appears in B1.2.
        </div>
      </div>
    </div>
  );
}


export default function MethodologyItemsList({
  proposalId,
  canEdit,
  isCoordinator,
}: MethodologyItemsListProps) {
  const {
    items,
    addItem,
    deleteItem,
    updateHeading,
    updateContent,
    setAssignedParticipant,
    reorder,
  } = useMethodologyItems(proposalId);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const { data: participants = [] } = useQuery({
    queryKey: ['participants-for-case', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, organisation_short_name, organisation_name, english_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return data as ParticipantSummary[];
    },
    enabled: !!proposalId,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const ordered = (() => {
    if (!localOrder) return items;
    const byId = new Map(items.map((i) => [i.id, i]));
    const list = localOrder.map((id) => byId.get(id)).filter(Boolean) as MethodologyItem[];
    return list.length === items.length ? list : items;
  })();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((i) => i.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextIds = arrayMove(ids, oldIndex, newIndex);
    setLocalOrder(nextIds);
    reorder(nextIds).catch(() => {
      setLocalOrder(null);
      toast.error('Could not save the new order');
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Each methodology becomes an inline bold italic heading followed by its text in B1.2. The
        assigned participant is for task allocation only and is never mirrored into Part B.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ordered.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {ordered.map((item) => (
              <SortableItemRow
                key={item.id}
                item={item}
                proposalId={proposalId}
                canEdit={canEdit}
                isCoordinator={isCoordinator}
                participants={participants}
                onHeadingChange={updateHeading}
                onContentChange={updateContent}
                onAssign={(id, pid) =>
                  setAssignedParticipant(id, pid).catch(() =>
                    toast.error('Could not save the assignment'),
                  )
                }
                onDelete={(id) =>
                  deleteItem(id).catch(() => toast.error('Could not delete the methodology'))
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {canEdit && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() =>
            addItem().catch(() => toast.error('Could not add the methodology'))
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add methodology
        </Button>
      )}
    </div>
  );
}
