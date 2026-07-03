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
  useImpactCanvasColumns,
  type ImpactCanvasColumn,
} from '@/hooks/useImpactCanvas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  canEdit: boolean;
}

function SortableRow({
  col,
  canEdit,
  onChange,
  onDelete,
}: {
  col: ImpactCanvasColumn;
  canEdit: boolean;
  onChange: (updates: Partial<ImpactCanvasColumn>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.id,
    disabled: !canEdit,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const [heading, setHeading] = useState(col.heading);
  const [guideline, setGuideline] = useState(col.guideline || '');

  useEffect(() => {
    setHeading(col.heading);
    setGuideline(col.guideline || '');
  }, [col.heading, col.guideline]);

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 p-3 rounded-md border bg-card">
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
        <Textarea
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          onBlur={() => {
            const next = heading.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
            if (next.trim() && next !== col.heading) onChange({ heading: next });
            else setHeading(col.heading);
          }}
          placeholder="Column heading (multi-line allowed)"
          disabled={!canEdit}
          className="font-semibold text-sm min-h-[52px] whitespace-pre-wrap"
        />
        <Textarea
          value={guideline}
          onChange={(e) => setGuideline(e.target.value)}
          onBlur={() => {
            if (guideline !== (col.guideline || '')) onChange({ guideline });
          }}
          placeholder="Guideline shown to authors filling this column"
          disabled={!canEdit}
          className="text-xs italic text-muted-foreground min-h-[60px]"
        />
      </div>
      {canEdit && (
        <button
          onClick={onDelete}
          className="p-1 text-destructive hover:bg-destructive/10 rounded mt-1"
          aria-label="Delete column"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function ImpactCanvasColumnDialog({ open, onOpenChange, proposalId, canEdit }: Props) {
  const { columns, isLoading, updateCol, addCol, deleteCol, reorder } = useImpactCanvasColumns(proposalId);
  const [localOrder, setLocalOrder] = useState<ImpactCanvasColumn[]>([]);

  useEffect(() => setLocalOrder(columns), [columns]);

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

  const handleDelete = (id: string) => {
    const ok = confirm(
      'Delete this column? Any existing content authors have entered for it will remain in the database but will no longer be shown.',
    );
    if (ok) deleteCol.mutate(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] w-[90vw]">
        <DialogHeader>
          <DialogTitle>Edit impact canvas columns</DialogTitle>
          <DialogDescription>
            Reorder, rename, edit the guideline text, add new columns, or delete ones you don&rsquo;t need. Guidelines are shown to authors in the builder only, never in the rendered canvas.
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
                  {localOrder.map((col) => (
                    <SortableRow
                      key={col.id}
                      col={col}
                      canEdit={canEdit}
                      onChange={(updates) => updateCol.mutate({ id: col.id, updates })}
                      onDelete={() => handleDelete(col.id)}
                    />
                  ))}
                  {localOrder.length === 0 && (
                    <p className="text-sm text-muted-foreground italic py-6 text-center">
                      No columns defined. Add one to start.
                    </p>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => addCol.mutate()} disabled={addCol.isPending}>
              <Plus className="w-4 h-4 mr-1" /> Add column
            </Button>
          )}
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
