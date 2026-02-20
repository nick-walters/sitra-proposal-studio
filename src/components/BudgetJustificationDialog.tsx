import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { BudgetJustification } from '@/hooks/useBudgetRows';

interface BudgetJustificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: string;
  categoryLabel: string;
  participantName: string;
  justification: BudgetJustification | undefined;
  onSave: (text: string) => void;
  disabled?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  subcontracting: 'Subcontracting',
  equipment: 'Equipment',
  other_goods: 'Other goods & services',
  internally_invoiced: 'Internally invoiced goods & services',
};

export function BudgetJustificationDialog({
  open,
  onOpenChange,
  category,
  categoryLabel,
  participantName,
  justification,
  onSave,
  disabled = false,
}: BudgetJustificationDialogProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (open) {
      setText(justification?.justificationText || '');
    }
  }, [open, justification]);

  const handleSave = () => {
    onSave(text);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {categoryLabel} — {participantName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Provide a justification for this cost category. This text will feed the corresponding B3.1 table.
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter cost justification..."
            rows={6}
            disabled={disabled}
          />
          {justification?.updatedAt && (
            <p className="text-xs text-muted-foreground">
              Last updated: {new Date(justification.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={disabled}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
