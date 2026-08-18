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
  /** The text the user typed and is about to lose. Empty for 'blocked'. */
  text: string;
  /**
   * 'race' — another user took the lock first. 'conflict' — save rejected.
   * 'blocked' — the field is held by someone else and nothing was typed.
   */
  reason: 'race' | 'conflict' | 'blocked';
  /** Name of the user currently holding the lock, when known. */
  holderName?: string | null;
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

  const blocked = payload.reason === 'blocked';
  const plain = blocked ? '' : htmlToPlainText(payload.text) || '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const title = blocked
    ? 'This text box is being edited'
    : payload.reason === 'race'
      ? 'Another user started typing first'
      : 'This field changed elsewhere';

  const description = blocked
    ? `This text box is currently being edited by ${payload.holderName || 'another user'} and cannot be edited until they finish.`
    : payload.reason === 'race'
      ? 'Another user started typing before you, and your edits may be lost. Below is the text you might lose. Would you like to copy the text to a note on your device as a backup?'
      : 'This text box was changed by someone else since you loaded it, so your save was not applied. Below is the text you might lose. Would you like to copy the text to a note on your device as a backup?';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-sm"
        // Nothing is auto-focused, so a stray Space/Enter mid-typing cannot
        // activate a button; only Escape or an explicit click closes this.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') e.stopPropagation();
          if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>


        {!blocked && (
          <div className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-[12px] whitespace-pre-wrap">
            {plain}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {blocked ? 'Close' : 'Dismiss'}
          </Button>
          {!blocked && (
            <Button size="sm" onClick={copy}>
              {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default LostTextDialog;
