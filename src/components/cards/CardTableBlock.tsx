import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ColumnResizer } from '@/components/ColumnResizer';
import { MethodologyRichEditor } from '@/components/MethodologyRichEditor';
import { useCardTable } from '@/hooks/useCardTable';
import {
  cellAlignStyle,
  tableCaptionClass,
  tableCellClass,
  tableClass,
  TABLE_CAPTION_LABEL_CLASS,
  type CellAlignH,
  type CellAlignV,
} from '@/lib/tableStyleSpec';
import { isHtmlBlank } from '@/lib/htmlBlank';
import {
  FULL_FIELD_CAPABILITIES,
  registerFieldCapabilities,
  unregisterFieldCapabilities,
} from '@/lib/fieldCapabilities';
import { registerCellAlign, unregisterCellAlign } from '@/lib/tableCellAlignRegistry';
import type { CardTableCell, CardTableColumn } from '@/types/cardTable';

const MIN_COL_PX = 48;
const SAVE_DEBOUNCE_MS = 800;

interface CardTableBlockProps {
  cardId: string;
  proposalId: string;
  canEdit: boolean;
  /** "Table 1.2.a." — assigned by the board from document order. */
  captionLabel: string;
}

/* ------------------------------------------------------------------ cell */

interface CellProps {
  cell: CardTableCell;
  column: CardTableColumn;
  isHeader: boolean;
  proposalId: string;
  canEdit: boolean;
  onContentChange: (cellId: string, html: string) => void;
  onSetAlignH: (cellId: string, value: CellAlignH) => void;
  onSetAlignV: (cellId: string, value: CellAlignV) => void;
}

function TableCell({
  cell,
  column,
  isHeader,
  proposalId,
  canEdit,
  onContentChange,
  onSetAlignH,
  onSetAlignV,
}: CellProps) {
  const alignH = cell.alignH ?? column.alignH ?? null;
  const alignV = cell.alignV ?? column.alignV ?? null;

  // The toolbar reads the live values through the registry, so keep them in a
  // ref that the registered controller closes over.
  const alignRef = useRef({ alignH, alignV });
  alignRef.current = { alignH, alignV };

  const handleReady = useCallback(
    (editor: Editor) => {
      // Cells run the full shared schema (cross-references included) and add
      // the per-cell alignment capability so the toolbar reveals its controls.
      registerFieldCapabilities(editor, { ...FULL_FIELD_CAPABILITIES, tableCellAlign: true });
      registerCellAlign(editor, {
        get alignH() {
          return alignRef.current.alignH;
        },
        get alignV() {
          return alignRef.current.alignV;
        },
        setAlignH: (value) => onSetAlignH(cell.id, value),
        setAlignV: (value) => onSetAlignV(cell.id, value),
      });
      editor.on('destroy', () => {
        unregisterFieldCapabilities(editor);
        unregisterCellAlign(editor);
      });
    },
    [cell.id, onSetAlignH, onSetAlignV],
  );

  const Tag = (isHeader ? 'th' : 'td') as 'th' | 'td';

  return (
    <Tag
      className={tableCellClass(isHeader ? 'header' : 'body', 'align-top')}
      style={cellAlignStyle(alignH, alignV)}
      data-cell-id={cell.id}
    >
      <MethodologyRichEditor
        proposalId={proposalId}
        value={cell.contentHtml ?? ''}
        onChange={(html) => onContentChange(cell.id, html)}
        canEdit={canEdit}
        isCoordinator={false}
        minHeight="1.5rem"
        onEditorReady={handleReady}
      />
    </Tag>
  );
}

/* ----------------------------------------------------------------- block */

export function CardTableBlock({ cardId, proposalId, canEdit, captionLabel }: CardTableBlockProps) {
  const {
    table,
    columns,
    rows,
    cells,
    isLoading,
    refetch,
    addRow,
    deleteRow,
    addColumn,
    deleteColumn,
    saveColumn,
    saveCell,
    saveMeta,
  } = useCardTable(cardId);

  const [captionDraft, setCaptionDraft] = useState('');
  const captionTouched = useRef(false);
  useEffect(() => {
    if (!captionTouched.current) setCaptionDraft(table?.caption ?? '');
  }, [table?.caption]);

  /** Local width overrides while dragging, before the save round-trips. */
  const [dragWidths, setDragWidths] = useState<Record<string, number>>({});
  const [pendingColumnDelete, setPendingColumnDelete] = useState<{
    column: CardTableColumn;
    filled: number;
  } | null>(null);

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const timers = timersRef.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  const cellsByRow = useMemo(() => {
    const map: Record<string, Record<string, CardTableCell>> = {};
    for (const c of cells) {
      (map[c.rowId] ??= {})[c.columnId] = c;
    }
    return map;
  }, [cells]);

  const handleContentChange = useCallback(
    (cellId: string, html: string) => {
      if (timersRef.current[cellId]) clearTimeout(timersRef.current[cellId]);
      timersRef.current[cellId] = setTimeout(() => {
        delete timersRef.current[cellId];
        saveCell.mutate({ cellId, patch: { content_html: html } });
      }, SAVE_DEBOUNCE_MS);
    },
    [saveCell],
  );

  const handleSetAlignH = useCallback(
    (cellId: string, value: CellAlignH) => {
      saveCell.mutate({ cellId, patch: { align_h: value } }, { onSuccess: () => refetch() });
    },
    [refetch, saveCell],
  );

  const handleSetAlignV = useCallback(
    (cellId: string, value: CellAlignV) => {
      saveCell.mutate({ cellId, patch: { align_v: value } }, { onSuccess: () => refetch() });
    },
    [refetch, saveCell],
  );

  /** Word-style resize: this column grows, the next one gives way. */
  const startResize = (part: number, index: number) => (e: React.MouseEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const partColumns = columns.filter((c) => c.part === part);
    const th = (e.currentTarget as HTMLElement).closest('th') as HTMLElement | null;
    const table = th?.closest('table') as HTMLTableElement | null;
    if (!th || !table) return;
    const headerCells = Array.from(table.querySelectorAll('thead th, tbody tr:first-child > td'))
      .slice(0, partColumns.length) as HTMLElement[];
    const start = headerCells.map((el) => el.offsetWidth);
    const startX = e.clientX;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const next = [...start];
      const hasNeighbour = index + 1 < next.length;
      const minDelta = MIN_COL_PX - start[index];
      const maxDelta = hasNeighbour ? start[index + 1] - MIN_COL_PX : Infinity;
      const clamped = Math.min(Math.max(delta, minDelta), Math.max(minDelta, maxDelta));
      next[index] = start[index] + clamped;
      if (hasNeighbour) next[index + 1] = start[index + 1] - clamped;
      const patch: Record<string, number> = {};
      partColumns.forEach((col, i) => {
        patch[col.id] = Math.round(next[i]);
      });
      setDragWidths((prev) => ({ ...prev, ...patch }));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragWidths((prev) => {
        const changed = partColumns.filter((c) => prev[c.id] != null && prev[c.id] !== c.widthPx);
        changed.forEach((c) => saveColumn.mutate({ columnId: c.id, patch: { width_px: prev[c.id] } }));
        return prev;
      });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const requestColumnDelete = (column: CardTableColumn) => {
    const filled = cells.filter((c) => c.columnId === column.id && !isHtmlBlank(c.contentHtml ?? '')).length;
    setPendingColumnDelete({ column, filled });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the table…</p>;
  if (!table) return <p className="text-sm italic text-muted-foreground">This table block has no table data.</p>;

  const parts = Array.from({ length: Math.max(table.parts, 1) }, (_, i) => i + 1);

  const renderPart = (part: number) => {
    const partColumns = columns.filter((c) => c.part === part);
    const partRows = rows.filter((r) => r.part === part);
    const headerRows = partRows.filter((r) => r.rowType === 'header');
    const bodyRows = partRows.filter((r) => r.rowType === 'body');

    const renderRow = (row: (typeof partRows)[number], isHeader: boolean) => (
      <tr key={row.id} className="group/row">
        {partColumns.map((col) => {
          const cell = cellsByRow[row.id]?.[col.id];
          if (!cell) return <td key={col.id} className={tableCellClass('body')} />;
          return (
            <TableCell
              key={col.id}
              cell={cell}
              column={col}
              isHeader={isHeader}
              proposalId={proposalId}
              canEdit={canEdit}
              onContentChange={handleContentChange}
              onSetAlignH={handleSetAlignH}
              onSetAlignV={handleSetAlignV}
            />
          );
        })}
        {canEdit && (
          <td className="w-8 border-none p-0 align-middle">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive opacity-0 transition-opacity group-hover/row:opacity-100"
              aria-label="Remove row"
              onClick={() => deleteRow.mutate(row.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </td>
        )}
      </tr>
    );

    return (
      <div key={part} className="space-y-2">
        <table className={tableClass('standard')}>
          <colgroup>
            {partColumns.map((col) => {
              const width = dragWidths[col.id] ?? col.widthPx ?? null;
              return <col key={col.id} style={width ? { width: `${width}px` } : undefined} />;
            })}
            {canEdit && <col style={{ width: '32px' }} />}
          </colgroup>
          <thead>
            {headerRows.length > 0 && canEdit && (
              <tr>
                {partColumns.map((col, i) => (
                  <th key={`ctl-${col.id}`} className="relative border-none p-0 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive"
                      aria-label="Remove column"
                      onClick={() => requestColumnDelete(col)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    <ColumnResizer onMouseDown={startResize(part, i)} />
                  </th>
                ))}
                <th className="border-none p-0" />
              </tr>
            )}
            {headerRows.map((row) => renderRow(row, true))}
          </thead>
          <tbody>{bodyRows.map((row) => renderRow(row, false))}</tbody>
        </table>

        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addRow.mutate({ part })}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add row
            </Button>
            <Button variant="outline" size="sm" onClick={() => addColumn.mutate(part)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add column
            </Button>
            {table.parts > 1 && (
              <span className="self-center text-xs text-muted-foreground">Part {part}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* One caption, above the first table, even in the two-part variant. */}
      <p className={tableCaptionClass()}>
        <span className={TABLE_CAPTION_LABEL_CLASS}>{captionLabel}</span>{' '}
        {canEdit ? (
          <Input
            value={captionDraft}
            placeholder="Caption"
            className="mt-1 h-7 text-sm italic"
            onFocus={() => {
              captionTouched.current = true;
            }}
            onChange={(e) => setCaptionDraft(e.target.value)}
            onBlur={() => {
              captionTouched.current = false;
              if ((table.caption ?? '') !== captionDraft) {
                saveMeta.mutate({ caption: captionDraft }, { onSuccess: () => refetch() });
              }
            }}
          />
        ) : (
          <span>{table.caption}</span>
        )}
      </p>

      <div className="space-y-4">{parts.map(renderPart)}</div>

      <AlertDialog
        open={!!pendingColumnDelete}
        onOpenChange={(open) => !open && setPendingColumnDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this column?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingColumnDelete?.filled
                ? `${pendingColumnDelete.filled} cell${pendingColumnDelete.filled === 1 ? '' : 's'} in this column contain text. Removing the column deletes that text permanently — the table recycle bin does not cover cells.`
                : 'The column is empty, so nothing is lost.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingColumnDelete) deleteColumn.mutate(pendingColumnDelete.column.id);
                setPendingColumnDelete(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default CardTableBlock;
