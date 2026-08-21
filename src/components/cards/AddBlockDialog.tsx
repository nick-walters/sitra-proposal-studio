import { useState } from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Table blocks were dropped: a table inside a text block already offers merge
 * and split cells, formulas, auto-resize and captions.
 */
export type NewBlockKind = 'text' | 'figure';

export interface NewBlockChoice {
  kind: NewBlockKind;
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
    kind: 'figure',
    label: 'Figure block',
    description: 'An image, canvas, Gantt or PERT figure with a caption.',
    icon: ImageIcon,
  },
];

/** Asks which kind of block to add before creating anything. */
export function AddBlockDialog({ open, onOpenChange, onCreate, isPending }: AddBlockDialogProps) {
  const [kind, setKind] = useState<NewBlockKind>('text');

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


        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={isPending}
            onClick={() => onCreate({ kind })}
          >
            Add block
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddBlockDialog;
