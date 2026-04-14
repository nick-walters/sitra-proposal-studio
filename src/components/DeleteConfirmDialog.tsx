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
}

export function DeleteConfirmDialog({
  itemLabel = 'this item',
  onConfirm,
  buttonClassName = 'h-6 w-6 text-destructive hover:text-destructive flex-shrink-0',
  iconSize = 'h-3.5 w-3.5',
  buttonSize = 'icon',
  disabled = false,
}: DeleteConfirmDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size={buttonSize}
          className={buttonClassName}
          disabled={disabled}
        >
          <Trash2 className={iconSize} />
        </Button>
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
