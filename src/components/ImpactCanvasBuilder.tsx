import { useState, useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Trash2, Settings2, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Info, Undo2, Redo2 } from 'lucide-react';
import { useImpactCanvasColumns, useImpactCanvasRows } from '@/hooks/useImpactCanvas';
import { useProposalRole } from '@/hooks/useProposalRole';
import { ImpactCanvasCellEditor } from './ImpactCanvasCellEditor';
import { ImpactCanvasColumnDialog } from './ImpactCanvasColumnDialog';
import { ImpactCanvasCrossRefDropdown } from './ImpactCanvasCrossRefDropdown';
import { ImpactCanvasGraphic } from './ImpactCanvasGraphic';



/**
 * Impact Canvas — dedicated editor page (Phase 1b).
 * Top: structured graphic (row × column blocks).
 * Below: rich-text grid builder with ONE shared toolbar bound to the
 *        currently-focused cell (avoids toolbar-per-cell perf hit).
 */
export function ImpactCanvasBuilder({ proposalId, canEdit }: Props) {
  const { roleTier } = useProposalRole(proposalId);
  const isCoordinator = roleTier === 'coordinator';

  const { columns, isLoading: colsLoading } = useImpactCanvasColumns(proposalId);
  const { rows, isLoading: rowsLoading, addRow, deleteRow, updateCell } = useImpactCanvasRows(proposalId);
  

  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);

  const handleFocus = useCallback((editor: Editor) => setActiveEditor(editor), []);

  // Clear the focused-cell state when the user clicks outside a cell AND
  // outside the shared toolbar. Cells and the toolbar carry `data-*` markers.
  // Radix portals (dropdown menu content, dialogs) are also treated as
  // "inside" so opening the cross-ref dropdown or a reference dialog does
  // NOT deselect the active cell (toolbar buttons use onMouseDown+
  // preventDefault to preserve DOM focus, but React portals live outside
  // the toolbar subtree so we must exclude them explicitly here).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          '[data-impact-canvas-cell],[data-impact-canvas-toolbar],[data-radix-popper-content-wrapper],[role="menu"],[role="dialog"]',
        )
      ) {
        return;
      }
      setActiveEditor(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    activeEditor?.isActive(name, attrs) ?? false;

  const run = (fn: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    if (!activeEditor) return;
    fn(activeEditor.chain().focus()).run();
  };

  if (colsLoading || rowsLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading impact canvas…</div>;
  }

  const columnOrder = columns.slice().sort((a, b) => a.order_index - b.order_index);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Enable toggle moved to figure page header */}



        {/* The graphic — shared component also used by B2.1 mirror */}
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Canvas preview</h3>
              <span className="text-xs text-muted-foreground">
                {rows.length} row{rows.length === 1 ? '' : 's'} · {columnOrder.length} columns
              </span>
            </div>
            <ImpactCanvasGraphic proposalId={proposalId} />
          </CardContent>
        </Card>


        {/* Shared toolbar */}
        <div
          data-impact-canvas-toolbar
          className="sticky top-0 z-10 bg-background border rounded-md p-1 flex items-center gap-1 overflow-visible"
        >
          <ToolbarBtn
            label="Undo"
            disabled={!activeEditor || !canEdit || !(activeEditor?.can().undo() ?? false)}
            onClick={() => run((c) => c.undo())}
          >
            <Undo2 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            label="Redo"
            disabled={!activeEditor || !canEdit || !(activeEditor?.can().redo() ?? false)}
            onClick={() => run((c) => c.redo())}
          >
            <Redo2 className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarBtn label="Bold" active={isActive('bold')} disabled={!activeEditor || !canEdit}
            onClick={() => run((c) => c.toggleBold())}>
            <Bold className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn label="Italic" active={isActive('italic')} disabled={!activeEditor || !canEdit}
            onClick={() => run((c) => c.toggleItalic())}>
            <Italic className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn label="Underline" active={isActive('underline')} disabled={!activeEditor || !canEdit}
            onClick={() => run((c) => c.toggleUnderline())}>
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarBtn label="Bullet list" active={isActive('bulletList')} disabled={!activeEditor || !canEdit}
            onClick={() => run((c) => c.toggleBulletList())}>
            <List className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn label="Ordered list" active={isActive('orderedList')} disabled={!activeEditor || !canEdit}
            onClick={() => run((c) => c.toggleOrderedList())}>
            <ListOrdered className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ImpactCanvasCrossRefDropdown
            proposalId={proposalId}
            activeEditor={activeEditor}
            disabled={!canEdit}
          />

          <div className="flex-1" />
          <span className="text-xs text-muted-foreground pr-2 shrink-0">
            {activeEditor ? 'Editing focused cell' : 'Click a cell to edit'}
          </span>
        </div>

        {/* The builder grid */}
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Table builder</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Cells are rich text (bold, italic, underline, lists). Guidelines are shown here as hints — they do not appear in the rendered canvas.
                </p>
              </div>
              {isCoordinator && (
                <Button variant="outline" size="sm" onClick={() => setColumnDialogOpen(true)}>
                  <Settings2 className="w-4 h-4 mr-1" /> Manage columns
                </Button>
              )}
            </div>

            {columnOrder.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">
                No columns configured.
              </p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">
                No rows yet.
              </p>
            ) : (
              <div className="space-y-4">
                {rows.map((row, rowIdx) => {
                  const chunks: typeof columnOrder[] = [];
                  for (let i = 0; i < columnOrder.length; i += 3) {
                    chunks.push(columnOrder.slice(i, i + 3));
                  }
                  return (
                    <div key={row.id} className="border-2 border-border rounded-md overflow-hidden bg-background">
                      <div className="flex items-center justify-between bg-muted/60 px-3 py-1.5 border-b">
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          Row {rowIdx + 1}
                        </span>
                        {canEdit && (
                          <button
                            onClick={() => {
                              if (confirm('Delete this row?')) deleteRow.mutate(row.id);
                            }}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded"
                            aria-label="Delete row"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {chunks.map((chunk, ci) => (
                        <div key={ci} className="overflow-x-auto border-t first:border-t-0">
                          <table className="w-full border-collapse text-sm table-fixed">
                            <colgroup>
                              {chunk.map((c) => (
                                <col key={c.id} style={{ width: `${100 / chunk.length}%` }} />
                              ))}
                            </colgroup>
                            <thead>
                              <tr>
                                {chunk.map((c) => (
                                  <th
                                    key={c.id}
                                    className="border p-2 bg-muted/30 text-left align-top min-w-[160px]"
                                  >
                                    <div className="flex items-start gap-1">
                                      <span className="text-xs font-semibold">{c.heading}</span>
                                      {c.guideline && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              className="text-muted-foreground hover:text-foreground"
                                              aria-label="Guideline"
                                            >
                                              <Info className="w-3 h-3" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="bottom" className="max-w-xs text-xs">
                                            {c.guideline}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {chunk.map((c) => (
                                  <td
                                    key={c.id}
                                    data-impact-canvas-cell
                                    className="border align-top p-0"
                                  >
                                    <ImpactCanvasCellEditor
                                      html={row.content[c.key] || ''}
                                      onChange={(html) =>
                                        updateCell.mutate({ rowId: row.id, key: c.key, html })
                                      }
                                      onFocus={handleFocus}
                                      disabled={!canEdit}
                                    />
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}


            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => addRow.mutate()} disabled={addRow.isPending}>
                <Plus className="w-4 h-4 mr-1" /> Add row
              </Button>
            )}
          </CardContent>
        </Card>

        <ImpactCanvasColumnDialog
          open={columnDialogOpen}
          onOpenChange={setColumnDialogOpen}
          proposalId={proposalId}
          canEdit={isCoordinator}
        />
      </div>
    </TooltipProvider>
  );
}

function ToolbarBtn({
  children,
  label,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (!disabled) onClick();
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
