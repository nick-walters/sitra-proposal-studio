import { useState, useEffect } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  useCaseSubsectionTemplates,
  type CaseSubsectionTemplate,
} from '@/hooks/useCaseSubsectionTemplates';
import { useProposalCaseTypes } from '@/hooks/useProposalCaseTypes';
import { caseWord } from '@/lib/caseTypeLabels';


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  canEdit: boolean;
}

function SortableRow({
  row,
  canEdit,
  onChange,
  onDelete,
}: {
  row: CaseSubsectionTemplate;
  canEdit: boolean;
  onChange: (updates: Partial<CaseSubsectionTemplate>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !canEdit,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [heading, setHeading] = useState(row.heading);
  const [guideline, setGuideline] = useState(row.guideline || '');

  useEffect(() => {
    setHeading(row.heading);
    setGuideline(row.guideline || '');
  }, [row.heading, row.guideline]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 p-3 rounded-md border bg-card"
    >
      {canEdit && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none mt-1"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-[#2563EB]" />
        </button>
      )}
      <div className="flex-1 space-y-2">
        <Input
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          onBlur={() => {
            if (heading.trim() && heading !== row.heading) onChange({ heading: heading.trim() });
            else setHeading(row.heading);
          }}
          placeholder="Subsection heading"
          disabled={!canEdit}
          className="font-semibold text-sm"
        />
        <Textarea
          value={guideline}
          onChange={(e) => setGuideline(e.target.value)}
          onBlur={() => {
            if (guideline !== (row.guideline || '')) onChange({ guideline });
          }}
          placeholder="Guideline text shown to authors writing this subsection"
          disabled={!canEdit}
          className="text-xs italic text-muted-foreground min-h-[60px]"
        />
      </div>
      {canEdit && (
        <button
          onClick={onDelete}
          className="p-1 text-destructive hover:bg-destructive/10 rounded mt-1"
          aria-label="Delete subsection"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function CaseSubsectionTemplateDialog({ open, onOpenChange, proposalId, canEdit }: Props) {
  const { templates, isLoading, updateRow, addRow, deleteRow, reorder } =
    useCaseSubsectionTemplates(proposalId);
  const { data: types = [] } = useProposalCaseTypes(proposalId);
  const [localOrder, setLocalOrder] = useState<CaseSubsectionTemplate[]>([]);


  useEffect(() => {
    setLocalOrder(templates);
  }, [templates]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localOrder.findIndex((r) => r.id === active.id);
    const newIndex = localOrder.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(localOrder, oldIndex, newIndex);
    setLocalOrder(reordered);
    reorder.mutate(reordered);
  };

  const handleDelete = (id: string, isDefault: boolean) => {
    const ok = confirm(
      isDefault
        ? `Delete this default subsection? Existing ${caseWord(types, { capitalize: false })} content for it will remain in the database but will no longer be shown unless the subsection is re-added.`
        : `Delete this subsection? Existing ${caseWord(types, { capitalize: false })} content for it will remain in the database but will no longer be shown.`,
    );
    if (ok) deleteRow.mutate(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] w-[90vw]">
        <DialogHeader>
          <DialogTitle>Edit {caseWord(types, { capitalize: false })} subsections &amp; guidelines</DialogTitle>
          <DialogDescription>
            These subsections apply to every {caseWord(types, { capitalize: false })} in this proposal. Reorder, rename, edit the
            guideline text, add new subsections, or delete ones you don&rsquo;t need. Changes apply
            immediately to all {caseWord(types, { plural: true, capitalize: false })} drafts and the B1.2 cases table.
          </DialogDescription>
        </DialogHeader>


        <ScrollArea className="max-h-[60vh] pr-3">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={localOrder.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {localOrder.map((row) => (
                    <SortableRow
                      key={row.id}
                      row={row}
                      canEdit={canEdit}
                      onChange={(updates) => updateRow.mutate({ id: row.id, updates })}
                      onDelete={() => handleDelete(row.id, row.is_default)}
                    />
                  ))}
                  {localOrder.length === 0 && (
                    <p className="text-sm text-muted-foreground italic py-6 text-center">
                      No subsections defined. Add one to start.
                    </p>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => addRow.mutate()}
              disabled={addRow.isPending}
            >
              <Plus className="w-4 h-4 mr-1" /> Add subsection
            </Button>
          )}
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
