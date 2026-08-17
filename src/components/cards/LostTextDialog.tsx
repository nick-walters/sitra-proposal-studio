import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { htmlToPlainText } from '@/lib/htmlToPlainText';

export interface LostTextPayload {
  /** The text the user typed and is about to lose. */
  text: string;
  /** 'race' — another user took the lock first. 'conflict' — save rejected. */
  reason: 'race' | 'conflict';
}

/**
 * Offers the user a copy of the text they are about to lose. Anchored to the
 * bottom-right rather than centred so the red-bordered field stays visible.
 */
export function LostTextDialog({
  payload,
  onClose,
}: {
  payload: LostTextPayload | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!payload) return null;

  const plain = htmlToPlainText(payload.text) || payload.text;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="left-auto right-6 top-auto bottom-6 max-w-sm translate-x-0 translate-y-0">
        <DialogHeader>
          <DialogTitle>
            {payload.reason === 'race' ? 'Another user started typing first' : 'This field changed elsewhere'}
          </DialogTitle>
          <DialogDescription>
            {payload.reason === 'race'
              ? 'Another user started typing before you, and your edits may be lost. Below is the text you might lose. Would you like to copy the text to a note on your device as a backup?'
              : 'This text box was changed by someone else since you loaded it, so your save was not applied. Below is the text you might lose. Would you like to copy the text to a note on your device as a backup?'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-[12px] whitespace-pre-wrap">
          {plain || <span className="italic text-muted-foreground">(empty)</span>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Dismiss
          </Button>
          <Button size="sm" onClick={copy}>
            {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LostTextDialog;
