import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { formatCurrency } from '@/lib/formatNumber';
import type { JustificationCategory, JustificationItem } from '@/hooks/useBudgetRows';

interface Props {
  budgetRowId: string;
  category: JustificationCategory;
  items: JustificationItem[];
  editable: boolean;
  helpText?: string;
  onAdd: (rowId: string, category: JustificationCategory) => void;
  onUpdate: (itemId: string, field: 'amount' | 'justification', value: number | string) => void;
  onDelete: (itemId: string) => void;
  onReorder: (rowId: string, category: JustificationCategory, orderedIds: string[]) => void;
}

function SortableRow({ item, editable, onUpdate, onDelete }: {
  item: JustificationItem;
  editable: boolean;
  onUpdate: Props['onUpdate'];
  onDelete: Props['onDelete'];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !editable });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2">
      <button
        {...attributes}
        {...listeners}
        disabled={!editable}
        className="mt-2 p-1 rounded text-[#2563EB] cursor-grab active:cursor-grabbing disabled:opacity-30 disabled:cursor-not-allowed touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="w-32 shrink-0">
        <div className="relative flex items-center">
          <FormattedNumberInput
            value={item.amount}
            onChange={(v) => onUpdate(item.id, 'amount', v)}
            disabled={!editable}
            decimals={2}
            allowZero
            className="h-8 text-sm text-right pr-6"
          />
          <span className="absolute right-2 text-xs text-muted-foreground pointer-events-none">€</span>
        </div>
      </div>
      <Textarea
        value={item.justification}
        onChange={(e) => onUpdate(item.id, 'justification', e.target.value)}
        disabled={!editable}
        rows={2}
        className="text-sm min-h-[40px] flex-1"
        placeholder="Describe what this cost covers..."
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
        onClick={() => onDelete(item.id)}
        disabled={!editable}
        aria-label="Delete row"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

export function JustificationItemsEditor({
  budgetRowId, category, items, editable, helpText,
  onAdd, onUpdate, onDelete, onReorder,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const rowItems = items
    .filter(i => i.budgetRowId === budgetRowId && i.category === category)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const total = rowItems.reduce((s, i) => s + i.amount, 0);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = rowItems.findIndex(i => i.id === active.id);
    const newIdx = rowItems.findIndex(i => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(rowItems, oldIdx, newIdx);
    onReorder(budgetRowId, category, reordered.map(i => i.id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-muted-foreground">Justification *</label>
        <span className="text-xs text-muted-foreground">
          Total: <span className="font-medium tabular-nums">{formatCurrency(total)}</span>
        </span>
      </div>
      {helpText && (
        <p className="text-xs text-muted-foreground italic">{helpText}</p>
      )}
      {rowItems.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rowItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {rowItems.map(item => (
                <SortableRow key={item.id} item={item} editable={editable} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => onAdd(budgetRowId, category)}
        disabled={!editable}
      >
        <Plus className="w-3 h-3 mr-1" /> Add row
      </Button>
    </div>
  );
}
