import { useState } from 'react';
import { FileText, Image as ImageIcon, Table as TableIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export type NewBlockKind = 'text' | 'table' | 'figure';

export interface NewBlockChoice {
  kind: NewBlockKind;
  columns?: number;
  rows?: number;
  parts?: number;
}

interface AddBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (choice: NewBlockChoice) => void;
  isPending?: boolean;
}

const OPTIONS: { kind: NewBlockKind; label: string; description: string; icon: typeof FileText }[] = [
  {
    kind: 'text',
    label: 'Text block',
    description: 'One module with an optional header and rich-text content.',
    icon: FileText,
  },
  {
    kind: 'table',
    label: 'Table block',
    description: 'A table with rich-text cells, resizable columns and a caption.',
    icon: TableIcon,
  },
  {
    kind: 'figure',
    label: 'Figure block',
    description: 'An image, canvas, Gantt or PERT figure with a caption.',
    icon: ImageIcon,
  },
];

/** Asks which kind of block to add before creating anything. */
export function AddBlockDialog({ open, onOpenChange, onCreate, isPending }: AddBlockDialogProps) {
  const [kind, setKind] = useState<NewBlockKind>('text');
  const [columns, setColumns] = useState(3);
  const [rows, setRows] = useState(3);
  const [twoParts, setTwoParts] = useState(false);

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a block</DialogTitle>
          <DialogDescription>
            The new block lands at the end of the free band, above the fixed tail blocks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.kind}
                type="button"
                onClick={() => setKind(option.kind)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                  kind === option.kind ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {kind === 'table' && (
          <div className="space-y-3 rounded-md bg-muted/40 p-3">
            <div className="flex gap-3">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="new-table-columns">
                  Columns
                </Label>
                <Input
                  id="new-table-columns"
                  type="number"
                  min={1}
                  max={12}
                  value={columns}
                  className="h-8 w-24"
                  onChange={(e) => setColumns(clamp(Number(e.target.value) || 1, 1, 12))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="new-table-rows">
                  Body rows
                </Label>
                <Input
                  id="new-table-rows"
                  type="number"
                  min={1}
                  max={40}
                  value={rows}
                  className="h-8 w-24"
                  onChange={(e) => setRows(clamp(Number(e.target.value) || 1, 1, 40))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="new-table-parts"
                checked={twoParts}
                onCheckedChange={(v) => setTwoParts(v === true)}
              />
              <Label htmlFor="new-table-parts" className="text-xs font-normal">
                Two stacked tables under one caption
              </Label>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={isPending}
            onClick={() =>
              onCreate(
                kind === 'table'
                  ? { kind, columns, rows, parts: twoParts ? 2 : 1 }
                  : { kind },
              )
            }
          >
            Add block
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddBlockDialog;
