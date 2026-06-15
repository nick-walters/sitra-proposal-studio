import React, { useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';
import { GripVertical } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { useUserRole } from '@/hooks/useUserRole';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { EditableCaption } from '@/components/EditableCaption';
import { toast } from 'sonner';

// ============== SHARED STYLES ==============
export const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
export const cellStyles = "!px-[1pt] !py-0 px-[1pt] h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight";
export const bubbleCellStyles = "!px-[1pt] !py-[1px] px-[1pt] h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-none overflow-visible";
export const headerCellStyles = "!px-[1pt] !py-0 px-[1pt] h-auto align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight font-bold";

// ============== SORTABLE ROW ==============
export function SortableTableRow({
  id,
  children,
  canDrag,
  onDelete,
}: {
  id: string;
  children: React.ReactNode;
  canDrag: boolean;
  onDelete?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !canDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const childArray = React.Children.toArray(children);

  const enhanced = childArray.map((child, index) => {
    if (!React.isValidElement(child)) return child;

    if (index === 0 && canDrag) {
      return React.cloneElement(child as React.ReactElement<any>, {
        style: { ...(child as React.ReactElement<any>).props.style, position: 'relative' as const },
        children: (
          <>
            <div
              className="absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10"
              style={{ left: '-20px' }}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4 text-[#2563EB]" />
            </div>
            {(child as React.ReactElement<any>).props.children}
          </>
        ),
      });
    }

    if (index === childArray.length - 1 && onDelete) {
      return React.cloneElement(child as React.ReactElement<any>, {
        style: { ...(child as React.ReactElement<any>).props.style, position: 'relative' as const },
        children: (
          <>
            {(child as React.ReactElement<any>).props.children}
            <div
              className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
              style={{ right: '-24px' }}
            >
              <DeleteConfirmDialog
                itemLabel="this row"
                onConfirm={() => onDelete?.()}
                buttonClassName="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                iconSize="h-3 w-3"
              />
            </div>
          </>
        ),
      });
    }

    return child;
  });

  return (
    <TableRow ref={setNodeRef} style={style} className="hover:bg-muted/50 group">
      {enhanced}
    </TableRow>
  );
}

// ============== TABLE WRAPPER ==============
export function B31TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full [&>div]:overflow-visible">
      {children}
    </div>
  );
}

// ============== CAPTION ICON BUTTON ==============
export const CaptionIconButton = React.forwardRef<HTMLButtonElement, {
  tooltip: string;
  onClick?: () => void;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'>>(
  ({ tooltip, onClick, children, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      title={tooltip}
      aria-label={tooltip}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      {...rest}
    >
      {children}
    </button>
  )
);
CaptionIconButton.displayName = 'CaptionIconButton';

// ============== GENERIC SORTABLE TABLE ==============
export interface B31Column<TRow> {
  key: string;
  header: React.ReactNode;
  headerClassName?: string;
  /** Style applied to the <th> when no saved column widths exist (e.g. default width, whiteSpace). */
  defaultHeaderStyle?: React.CSSProperties;
  /** Lower bound applied via Math.max(savedWidth, minWidth) — preserves "No." column behaviour. */
  minWidth?: number;
  cellClassName?: string;
  cellStyle?: React.CSSProperties;
  renderCell: (
    row: TRow,
    updateRow: (id: string, updates: Partial<TRow>) => void,
    allRows: TRow[]
  ) => React.ReactNode;
}

export interface B31CaptionApi<TRow> {
  add: () => void;
  rows: TRow[];
  reorder: (newOrder: TRow[]) => void;
}

export interface B31SortableTableProps<TRow extends { id: string; order_index: number }> {
  proposalId: string;
  dbTable: string;
  queryKey: string;
  /** Key used by useColumnResize storage. Defaults to dbTable. */
  columnResizeKey?: string;

  columns: B31Column<TRow>[];

  // Caption
  captionTableKey: string;
  captionLabel: string;
  captionDefaultText: string;
  captionLeftButtons?: (api: B31CaptionApi<TRow>) => React.ReactNode;
  captionSuffix?: React.ReactNode;
  captionClassName?: string;

  // Add
  createDefaultRow: (existingRows: TRow[]) => Record<string, any>;

  // Numbering / reorder side effects.
  // If omitted, only order_index is updated (sequential).
  recomputeNumbers?: (reorderedRows: TRow[]) => Array<{ id: string; updates: Record<string, any> }>;
  reorderToastLabel?: string;

  invalidateGantt?: boolean;
  autoFitFullWidth?: boolean;
  tableWidthMode?: 'sum' | 'maxFull';
}

export function B31SortableTable<TRow extends { id: string; order_index: number }>(
  props: B31SortableTableProps<TRow>
) {
  const {
    proposalId,
    dbTable,
    queryKey,
    columnResizeKey,
    columns,
    captionTableKey,
    captionLabel,
    captionDefaultText,
    captionLeftButtons,
    captionSuffix,
    captionClassName,
    createDefaultRow,
    recomputeNumbers,
    reorderToastLabel,
    invalidateGantt = false,
    autoFitFullWidth = false,
    tableWidthMode = 'sum',
  } = props;

  const queryClient = useQueryClient();
  const { isAdminOrOwner } = useUserRole();
  const eventTableId = queryKey;

  const { colWidths, setColWidths, tableRef, handleColResizeStart, saveWidths } = useColumnResize({
    proposalId,
    tableKey: columnResizeKey ?? dbTable,
    canResize: isAdminOrOwner,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [queryKey, proposalId] });
    if (invalidateGantt) {
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-gantt', proposalId] });
    }
  }, [queryClient, queryKey, proposalId, invalidateGantt]);

  const { data: rows = [] } = useQuery({
    queryKey: [queryKey, proposalId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(dbTable)
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data as TRow[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TRow> }) => {
      const { error } = await (supabase as any).from(dbTable).update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const updateRow = useCallback(
    (id: string, updates: Partial<TRow>) => updateMutation.mutate({ id, updates }),
    [updateMutation]
  );

  const addMutation = useMutation({
    mutationFn: async () => {
      const payload = { proposal_id: proposalId, ...createDefaultRow(rows) };
      const { error } = await (supabase as any).from(dbTable).insert(payload);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from(dbTable).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const reorderMutation = useMutation({
    mutationFn: async (newOrder: TRow[]) => {
      const updates = recomputeNumbers
        ? recomputeNumbers(newOrder)
        : newOrder.map((r, i) => ({ id: r.id, updates: { order_index: i } as Record<string, any> }));
      for (const u of updates) {
        const { error } = await (supabase as any).from(dbTable).update(u.updates).eq('id', u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      if (reorderToastLabel) toast.success(reorderToastLabel);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
      }, 100);
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(rows, oldIndex, newIndex);
    reorderMutation.mutate(reordered);
  };

  const autoFitColumns = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const widths = computeAutoFitSmart(table, autoFitFullWidth ? { fullWidth: true } : undefined);
    if (widths) {
      setColWidths(widths);
      saveWidths(widths);
    }
  }, [tableRef, setColWidths, saveWidths, autoFitFullWidth]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tableId?: string }>).detail;
      if (detail?.tableId !== eventTableId) return;
      autoFitColumns();
    };
    window.addEventListener('b31-table-autoresize', handler as EventListener);
    return () => window.removeEventListener('b31-table-autoresize', handler as EventListener);
  }, [autoFitColumns, eventTableId]);

  const dispatchToolbarFocus = useCallback(() => {
    window.dispatchEvent(new CustomEvent('b31-table-focus', { detail: { tableId: eventTableId } }));
  }, [eventTableId]);

  const sumWidth = colWidths.reduce((s, w) => s + w, 0);
  const tableWidth =
    colWidths.length > 0
      ? tableWidthMode === 'maxFull'
        ? `max(${sumWidth}px, 100%)`
        : `${sumWidth}px`
      : '100%';

  const api: B31CaptionApi<TRow> = {
    add: () => addMutation.mutate(),
    rows,
    reorder: (newOrder) => reorderMutation.mutate(newOrder),
  };

  return (
    <div onFocusCapture={dispatchToolbarFocus}>
      <EditableCaption
        proposalId={proposalId}
        tableKey={captionTableKey}
        label={captionLabel}
        defaultCaption={captionDefaultText}
        suffix={captionSuffix}
        className={captionClassName}
        leftButtons={captionLeftButtons ? captionLeftButtons(api) : undefined}
      />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <B31TableWrapper>
          <Table
            className={`${tableStyles} [&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b [&_th]:border-black [&_td]:border-x-0 [&_td]:border-y [&_td]:border-gray-200 [&_tr]:border-0 [&_tr:last-child_td]:border-b-0 [&_tbody_tr:first-child_td]:border-t-0`}
            style={{
              tableLayout: colWidths.length > 0 ? 'fixed' : 'auto',
              borderCollapse: 'collapse',
              width: tableWidth,
            }}
            ref={tableRef}
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((col, idx) => {
                  const widthStyle: React.CSSProperties =
                    colWidths.length > 0
                      ? {
                          width: col.minWidth
                            ? Math.max(colWidths[idx], col.minWidth)
                            : colWidths[idx],
                        }
                      : col.defaultHeaderStyle ?? {};
                  return (
                    <TableHead
                      key={col.key}
                      className={`${headerCellStyles} relative ${col.headerClassName ?? ''}`}
                      style={widthStyle}
                    >
                      {col.header}
                      {isAdminOrOwner && <ColumnResizer onMouseDown={handleColResizeStart(idx)} />}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <TableBody>
                {rows.map((row) => (
                  <SortableTableRow
                    key={row.id}
                    id={row.id}
                    canDrag={isAdminOrOwner}
                    onDelete={() => deleteMutation.mutate(row.id)}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={col.cellClassName ?? cellStyles}
                        style={col.cellStyle}
                      >
                        {col.renderCell(row, updateRow, rows)}
                      </TableCell>
                    ))}
                  </SortableTableRow>
                ))}
              </TableBody>
            </SortableContext>
          </Table>
        </B31TableWrapper>
      </DndContext>
    </div>
  );
}
