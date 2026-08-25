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
import {
  impactSummaryAddRow,
  impactSummaryDeleteRow,
  impactSummaryFilledCells,
  impactSummaryRowCount,
  impactSummaryRowPreview,
} from '@/lib/cards/impactSummaryRows';

interface Props {
  /** Current HTML of the impact summary text box. */
  html: string;
  /** Receives the rewritten HTML; the caller saves it and remounts the editor. */
  onChange: (html: string) => void;
}

/**
 * Add and delete controls for the B2.1 impact summary table. A row spans all
 * six columns, so each action is applied to both stacked parts at once.
 */
export function ImpactSummaryRowControls({ html, onChange }: Props) {
  const rowCount = impactSummaryRowCount(html);
  const [pending, setPending] = useState<number | null>(null);

  const confirmDelete = (index: number) => {
    if (impactSummaryFilledCells(html, index) === 0) {
      onChange(impactSummaryDeleteRow(html, index));
      return;
    }
    setPending(index);
  };

  return (
    <div className="mb-1 flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(impactSummaryAddRow(html))}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add row
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={rowCount === 0}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Minus className="mr-1 h-3.5 w-3.5 text-destructive" />
            Delete row
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
                if (pending !== null) onChange(impactSummaryDeleteRow(html, pending));
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
