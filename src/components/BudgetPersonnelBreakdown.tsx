import { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, Trash2, AlertTriangle, Copy, Check, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormattedNumberInput } from '@/components/FormattedNumberInput';
import { formatCurrency, formatNumber } from '@/lib/formatNumber';
import type { PersonnelBreakdownItem } from '@/hooks/useBudgetRows';

function BudgetNumberField({
  value,
  onChange,
  disabled = false,
  className,
  decimals = 0,
}: {
  value: number | '';
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  decimals?: number;
}) {
  if (disabled) {
    return <div className={`flex items-center justify-end ${className ?? ''}`}>{value === '' ? '' : formatNumber(value as number, decimals)}</div>;
  }
  return (
    <BudgetNumberField
      value={value}
      onChange={onChange}
      decimals={decimals}
      className={className}
    />
  );
}

function CopyCellButton({ value }: { value: number }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted transition-colors"
      title="Copy value"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-600" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

function SortableRow({ id, editable, children }: { id: string; editable: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editable });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <tr ref={setNodeRef} style={style} className="border-t">
      <td className="px-1 py-1 text-center align-middle">
        {editable && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="p-1 rounded text-[#2563EB] cursor-grab active:cursor-grabbing touch-none"
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
      {children}
    </tr>
  );
}

interface Props {
  budgetRowId: string;
  totalPersonMonths: number;
  items: PersonnelBreakdownItem[];
  editable: boolean;
  onAdd: () => void;
  onUpdate: (id: string, field: 'category' | 'pmCount' | 'pmRate', value: string | number) => void;
  onDelete: (id: string) => void;
  onReorder: (budgetRowId: string, orderedIds: string[]) => void;
}

function formatPM(value: number): string {
  if (value === 0) return '0';
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export function BudgetPersonnelBreakdown({
  budgetRowId,
  totalPersonMonths,
  items,
  editable,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
}: Props) {
  const rows = items
    .filter(i => i.budgetRowId === budgetRowId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = rows.findIndex(i => i.id === active.id);
    const newIdx = rows.findIndex(i => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(budgetRowId, arrayMove(rows, oldIdx, newIdx).map(i => i.id));
  };
  const totalPm = rows.reduce((s, i) => s + (i.pmCount || 0), 0);
  const totalCost = rows.reduce((s, i) => s + (i.pmCount || 0) * (i.pmRate || 0), 0);
  const weightedRate = totalPm > 0 ? totalCost / totalPm : 0;
  const undefinedPm = Math.round((totalPersonMonths - totalPm) * 100) / 100;
  const hasMismatch = rows.length > 0 && Math.abs(undefinedPm) > 0.001;

  // Seeding the initial "Average weighted PM" row is handled by the parent
  // fetch in useBudgetRows.fetchPersonnelBreakdown. The component must NOT
  // insert rows on mount — that races the fetch and creates orphan duplicates.


  // Alert when staff effort total changes while rows exist
  const lastTotalRef = useRef<number | null>(null);
  useEffect(() => {
    if (lastTotalRef.current === null) {
      lastTotalRef.current = totalPersonMonths;
      return;
    }
    if (lastTotalRef.current !== totalPersonMonths) {
      if (rows.length > 0) {
        toast.warning('Staff effort total has changed — please review the personnel rows below.');
      }
      lastTotalRef.current = totalPersonMonths;
    }
  }, [totalPersonMonths, rows.length]);

  // Alert on mismatch transition
  const mismatchRef = useRef(false);
  useEffect(() => {
    if (hasMismatch && !mismatchRef.current) {
      toast.error('Personnel PMs don\u2019t add up to the staff effort total.');
    }
    mismatchRef.current = hasMismatch;
  }, [hasMismatch]);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground italic flex-1">
          Add one row per staff member or category. The total row below calculates the average weighted PM rate from each category's rate and share of total PMs — this is the rate used in all downstream calculations. Total PMs across rows should match the staff effort table ({formatPM(totalPersonMonths)}).
        </p>
        {editable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onAdd}
            className="shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add row
          </Button>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rows.map(i => i.id)} strategy={verticalListSortingStrategy}>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-xs text-muted-foreground">
              <th className="w-[28px]" />
              <th className="text-left font-bold px-2 py-1.5">Personnel category (optional staff name in brackets)</th>
              <th className="text-right font-bold px-2 py-1.5 w-[130px]">PM rate (&euro;)</th>
              <th className="text-right font-bold px-2 py-1.5 w-[90px]">PMs</th>
              <th className="text-right font-bold px-2 py-1.5 w-[130px]">Cost</th>
              <th className="w-[36px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map(item => (
              <SortableRow key={item.id} id={item.id} editable={editable}>
                <td className="px-2 py-1">
                  <Input
                    value={item.category}
                    onChange={(e) => onUpdate(item.id, 'category', e.target.value)}
                    readOnly={!editable}
                    placeholder="e.g. Senior researcher (J. Smith)"
                    className="h-7 text-sm"
                  />
                </td>
                <td className="px-2 py-1">
                  <BudgetNumberField
                    value={item.pmRate}
                    onChange={(v) => onUpdate(item.id, 'pmRate', v)}
                    disabled={!editable}
                    decimals={2}
                    className="h-7 text-sm text-right"
                  />
                </td>
                <td className="px-2 py-1">
                  <BudgetNumberField
                    value={item.pmCount}
                    onChange={(v) => onUpdate(item.id, 'pmCount', v)}
                    disabled={!editable}
                    decimals={1}
                    className="h-7 text-sm text-right"
                  />
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-sm">
                  {formatCurrency((item.pmCount || 0) * (item.pmRate || 0))}
                </td>
                <td className="px-2 py-1 text-center">
                  {editable && (
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      disabled={rows.length <= 1}
                      className="p-1 rounded hover:bg-destructive/10 disabled:opacity-40"
                      title={rows.length <= 1 ? 'At least one row is required' : 'Delete row'}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  )}
                </td>
              </SortableRow>
            ))}
            {hasMismatch && (
              <tr className="border-t bg-destructive/5">
                <td />
                <td className="px-2 py-1 font-semibold text-destructive">Unallocated PMs</td>
                <td className="px-2 py-1" />
                <td className="py-1 pr-5 text-right tabular-nums font-semibold text-destructive">{formatPM(undefinedPm)}</td>
                <td className="px-2 py-1" />
                <td />
              </tr>
            )}
            <tr className="border-t bg-muted/30">
              <td />
              <td className="pl-5 pr-2 py-1 font-semibold">Average weighted PM rate, total PMs &amp; total personnel costs</td>
              <td className="py-1 pr-5 text-right tabular-nums font-semibold">{formatNumber(weightedRate, 2)}</td>
              <td className="py-1 pr-5 text-right tabular-nums font-semibold">{formatNumber(totalPm, 1)}</td>
              <td className="px-2 py-1 text-right tabular-nums font-semibold">{formatCurrency(totalCost)}</td>
              <td className="px-2 py-1 text-center">
                <CopyCellButton value={totalCost} />
              </td>
            </tr>

          </tbody>
        </table>
      </div>
      </SortableContext>
      </DndContext>

      {hasMismatch && (
        <Alert className="border-destructive/50 bg-destructive/5 py-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive text-xs">
            Personnel PMs ({formatPM(totalPm)}) don’t add up to the staff effort total ({formatPM(totalPersonMonths)}). Adjust the rows so the numbers match.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
