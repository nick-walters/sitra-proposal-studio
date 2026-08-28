import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import type { Editor } from '@tiptap/core';
import {
  impactSummaryAddRowInEditor,
  impactSummaryDeleteRowInEditor,
  impactSummaryEditorRowCount,
  impactSummaryFilledCells,
  impactSummaryRowPreview,
} from '@/lib/cards/impactSummaryRows';

interface Props {
  /** Live TipTap instance owning the impact summary text box. */
  editor: Editor | null;
  /**
   * Bumped on every editor update so the row list and previews re-render
   * against the CURRENT document rather than the value seen at mount.
   */
  tick?: number;
}

/**
 * Add and delete controls for the B2.1 impact summary table. A row spans all
 * six columns, so each action is applied to both stacked parts at once.
 */
export function ImpactSummaryRowControls({ editor, tick }: Props) {
  const [pending, setPending] = useState<number | null>(null);
  // Read straight from the live document — `tick` only forces the re-read.
  void tick;
  const rowCount = editor ? impactSummaryEditorRowCount(editor) : 0;
  const html = editor?.getHTML() ?? '';

  const confirmDelete = (index: number) => {
    if (!editor) return;
    if (impactSummaryFilledCells(html, index) === 0) {
      impactSummaryDeleteRowInEditor(editor, index);
      return;
    }
    setPending(index);
  };

  return (
    <div className="mb-1 flex items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="Add row"
        title="Add row"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor && impactSummaryAddRowInEditor(editor)}
      >
        <Plus className="h-3.5 w-3.5 text-green-600" strokeWidth={2.5} />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Delete row"
            title="Delete row"
            disabled={!editor || rowCount === 0}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Minus className="h-3.5 w-3.5 text-destructive" strokeWidth={2.5} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
          {Array.from({ length: rowCount }, (_, i) => {
            const preview = impactSummaryRowPreview(html, i);
            return (
              <DropdownMenuItem key={i} onClick={() => confirmDelete(i)}>
                <span className="truncate">
                  Row {i + 1}
                  {preview ? ` — ${preview}` : ''}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="text-[11px] text-muted-foreground">
        Rows span both parts of the table.
      </span>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete row {pending === null ? '' : pending + 1}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending === null
                ? null
                : `This row holds text in ${impactSummaryFilledCells(html, pending)} of its six cells. Deleting it removes the row from both parts of the table.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending !== null && editor) {
                  impactSummaryDeleteRowInEditor(editor, pending);
                }
                setPending(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
