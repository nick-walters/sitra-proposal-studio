import { useState, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Trash2, Settings2, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Info } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useImpactCanvasColumns, useImpactCanvasRows } from '@/hooks/useImpactCanvas';
import { useProposalRole } from '@/hooks/useProposalRole';
import { ImpactCanvasCellEditor } from './ImpactCanvasCellEditor';
import { ImpactCanvasColumnDialog } from './ImpactCanvasColumnDialog';

interface Props {
  proposalId: string;
  canEdit: boolean;
}

const CELL_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'span'],
  ALLOWED_ATTR: [],
};

function sanitize(html: string) {
  return DOMPurify.sanitize(html || '', CELL_SANITIZE_CONFIG);
}

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
  const { enabled, setEnabled } = useImpactCanvasEnabled(proposalId);

  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);

  const handleFocus = useCallback((editor: Editor) => setActiveEditor(editor), []);

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
        {/* Enable toggle */}
        {isCoordinator && (
          <Card>
            <CardContent className="py-4 flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-medium">Include impact canvas</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  When enabled, the impact canvas appears at the end of B2.1 in the editor and PDF export.
                </p>
              </div>
              <Checkbox
                checked={enabled}
                onCheckedChange={(v) => setEnabled.mutate(!!v)}
                aria-label="Include impact canvas"
              />
            </CardContent>
          </Card>
        )}

        {/* The graphic */}
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Canvas preview</h3>
              <span className="text-xs text-muted-foreground">
                {rows.length} row{rows.length === 1 ? '' : 's'} · {columnOrder.length} columns
              </span>
            </div>
            {columnOrder.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">
                No columns defined. Add columns via the manage-columns button below.
              </p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">
                No rows yet. Add a row below to start filling the canvas.
              </p>
            ) : (
              <div
                className="grid gap-2 font-['Times_New_Roman',Times,serif]"
                style={{ gridTemplateColumns: `repeat(${columnOrder.length}, minmax(0, 1fr))` }}
              >
                {columnOrder.map((c) => (
                  <div
                    key={`h-${c.id}`}
                    className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground text-center border-b pb-1"
                  >
                    {c.heading}
                  </div>
                ))}
                {rows.map((row) =>
                  columnOrder.map((c) => (
                    <div
                      key={`${row.id}-${c.id}`}
                      className="border border-border rounded-md bg-muted/30 p-2 min-h-[80px] text-xs prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: sanitize(row.content[c.key] || '') }}
                    />
                  )),
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shared toolbar */}
        <div className="sticky top-0 z-10 bg-background border rounded-md p-1 flex items-center gap-1">
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
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground pr-2">
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
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      {columnOrder.map((c) => (
                        <th key={c.id} className="border p-2 bg-muted/50 text-left align-top min-w-[160px]">
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
                          {c.guideline && (
                            <p className="text-[10px] italic text-muted-foreground mt-1 font-normal leading-snug">
                              {c.guideline}
                            </p>
                          )}
                        </th>
                      ))}
                      {canEdit && <th className="border p-2 bg-muted/50 w-10"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        {columnOrder.map((c) => (
                          <td key={c.id} className="border align-top p-0">
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
                        {canEdit && (
                          <td className="border align-top text-center p-1">
                            <button
                              onClick={() => {
                                if (confirm('Delete this row?')) deleteRow.mutate(row.id);
                              }}
                              className="p-1 text-destructive hover:bg-destructive/10 rounded"
                              aria-label="Delete row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={columnOrder.length + (canEdit ? 1 : 0)} className="border text-center text-xs text-muted-foreground italic py-6">
                          No rows yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
