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

interface DeleteConfirmDialogProps {
  itemLabel?: string;
  onConfirm: () => void;
  buttonClassName?: string;
  iconSize?: string;
  buttonSize?: 'icon' | 'sm' | 'default';
  disabled?: boolean;
  /** Hover label and aria-label. Defaults to "Delete {itemLabel}". */
  tooltip?: string;
}

export function DeleteConfirmDialog({
  itemLabel = 'this item',
  onConfirm,
  buttonClassName = 'h-6 w-6 text-destructive hover:text-destructive flex-shrink-0',
  iconSize = 'h-3.5 w-3.5',
  buttonSize = 'icon',
  disabled = false,
  tooltip,
}: DeleteConfirmDialogProps) {
  const [open, setOpen] = useState(false);

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

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {itemLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete {itemLabel}? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onConfirm()}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
