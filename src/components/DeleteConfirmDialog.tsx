import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { Tip } from '@/components/ui/control-tip';
import {
  DELETE_DIALOG_ACTION_CLASS,
  DELETE_DIALOG_CONTENT_CLASS,
  deleteDialogDescription,
  deleteDialogTitle,
} from '@/components/deleteDialogCopy';


interface DeleteConfirmDialogProps {
  itemLabel?: string;
  /**
   * The thing being deleted — module, task, deliverable, block, subsection,
   * figure. It is the ONLY part of the confirmation that varies.
   */
  noun?: string;
  onConfirm: () => void;
  buttonClassName?: string;
  iconSize?: string;
  buttonSize?: 'icon' | 'sm' | 'default';
  disabled?: boolean;
  /** Hover label and aria-label. Defaults to "Delete {itemLabel}". */
  tooltip?: string;
  /**
   * Body copy. Defaults to a plain confirmation — deletions that go to a
   * recycle bin must NOT claim to be irreversible.
   */
  description?: string;
}

export function DeleteConfirmDialog({
  itemLabel = 'this item',
  noun,
  onConfirm,
  buttonClassName = 'h-6 w-6 text-destructive hover:text-destructive flex-shrink-0',
  iconSize = 'h-3.5 w-3.5',
  buttonSize = 'icon',
  disabled = false,
  tooltip,
  description,
}: DeleteConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  // Callers name the thing either way round ("this task" / "task").
  const resolvedNoun = noun ?? itemLabel.replace(/^(this|the)\s+/i, '');

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {/* The icon-only trigger carried no accessible name at all before —
            the tooltip text doubles as its aria-label. */}
        <Tip label={tooltip ?? `Delete ${itemLabel}`}>
          <Button
            variant="ghost"
            size={buttonSize}
            className={buttonClassName}
            disabled={disabled}
          >
            <Trash2 className={iconSize} />
          </Button>
        </Tip>
      </AlertDialogTrigger>

      <AlertDialogContent className={DELETE_DIALOG_CONTENT_CLASS}>
        <AlertDialogHeader>
          <AlertDialogTitle>{deleteDialogTitle(resolvedNoun)}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? deleteDialogDescription(resolvedNoun)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={DELETE_DIALOG_ACTION_CLASS}
            onClick={() => onConfirm()}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
