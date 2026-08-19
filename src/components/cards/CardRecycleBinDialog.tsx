import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, RotateCcw } from 'lucide-react';
import DOMPurify from 'dompurify';
import { formatDateTime } from '@/lib/formatDate';
import { useSectionRecycleBin } from '@/hooks/useSectionRecycleBin';
import type { CardDeletionEntry } from '@/types/cards';

interface CardRecycleBinDialogProps {
  proposalId: string;
  sectionId: string;
  isOpen: boolean;
  onClose: () => void;
  /**
   * 'blocks' — page-level bin: deleted blocks of this section only.
   * 'modules' — block-level bin: deleted modules of `cardId` only.
   */
  mode?: 'blocks' | 'modules';
  cardId?: string;
  /** Fired after a successful restore so the board can jump to the item. */
  onRestored?: (targetType: 'card' | 'field', targetId: string) => void;
}

/** One bin row: type, optional heading, collapsed preview with fade, expander. */
function BinEntry({
  entry,
  onRestore,
  isRestoring,
}: {
  entry: CardDeletionEntry;
  onRestore: () => void;
  isRestoring: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const html = DOMPurify.sanitize(entry.contentHtml ?? '');
  const hasContent = html.replace(/<[^>]*>/g, '').trim().length > 0;

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-md border border-border p-2">
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[11px] font-bold">
              {entry.targetType === 'card' ? 'Block' : 'Module'}
            </Badge>
            {entry.targetType === 'card' && entry.fieldCount != null && (
              <span className="text-[11px] text-muted-foreground">
                {entry.fieldCount} {entry.fieldCount === 1 ? 'module' : 'modules'}
              </span>
            )}
            {entry.label && (
              <span className="min-w-0 max-w-full truncate text-sm font-bold">{entry.label}</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Deleted {formatDateTime(new Date(entry.deletedAt))}
            {entry.purgeAfter ? ` · purged after ${formatDateTime(new Date(entry.purgeAfter))}` : ''}
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={onRestore} disabled={isRestoring}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Restore
        </Button>

      </div>

      {hasContent && (
        <div className="mt-2 min-w-0 max-w-full">
          <div className="relative min-w-0 max-w-full overflow-hidden">
            {/* Deleted modules can contain wide, unbreakable content (cross-reference
                chips, tables). Left unconstrained it widens the whole bin row inside
                the Radix scroll viewport, pushing the Restore button out of view. */}
            <div
              className={`prose prose-sm w-full max-w-full break-words text-sm text-muted-foreground [&_*]:max-w-full [&_table]:block [&_table]:overflow-x-auto ${
                expanded ? 'overflow-x-auto' : 'max-h-[7.5rem] overflow-hidden'
              }`}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            {!expanded && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-background" />
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 px-1 text-[11px]"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown
              className={`mr-1 h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
            {expanded ? 'Show less' : 'Show more'}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * One underlying bin, two filtered views: deleted blocks for the section, or
 * deleted modules of a single block.
 */
export function CardRecycleBinDialog({
  proposalId,
  sectionId,
  isOpen,
  onClose,
  mode = 'blocks',
  cardId,
  onRestored,
}: CardRecycleBinDialogProps) {
  const { cardEntries, fieldEntries, isLoading, restoreCard, restoreField } = useSectionRecycleBin(
    proposalId,
    sectionId,
  );

  const isModules = mode === 'modules';
  const entries = isModules
    ? fieldEntries.filter((f) => f.parentCardId === cardId)
    : cardEntries;

  const handleRestore = (entry: CardDeletionEntry) => {
    const mutation = entry.targetType === 'card' ? restoreCard : restoreField;
    mutation.mutate(entry.targetId, {
      onSuccess: () => {
        // Close first: Radix holds a body scroll lock while the dialog is
        // mounted, which would silently swallow the jump. The jump helper
        // additionally waits for the lock to clear before scrolling.
        onClose();
        window.setTimeout(() => onRestored?.(entry.targetType, entry.targetId), 0);
      },
    });
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isModules ? 'Recycle bin — this block' : 'Recycle bin'}</DialogTitle>
          <DialogDescription>
            {isModules
              ? 'Modules deleted from this block. Restore puts them back where they were.'
              : 'Blocks deleted from this section. Restore puts them back where they were.'}
          </DialogDescription>
        </DialogHeader>

        {/* Radix renders the scroll viewport with `display: table`, so its width
            is driven by content: one wide deleted module stretched every row and
            pushed Restore outside the dialog. Force the viewport back to block. */}
        <ScrollArea className="max-h-[60vh] w-full min-w-0 pr-3 [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:!w-full [&>[data-radix-scroll-area-viewport]]:!block [&>[data-radix-scroll-area-viewport]]:w-full">

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">The bin is empty.</p>
          ) : (
            <div className="w-full min-w-0 space-y-2">
              {entries.map((e) => (
                <BinEntry
                  key={e.id}
                  entry={e}
                  isRestoring={restoreCard.isPending || restoreField.isPending}
                  onRestore={() => handleRestore(e)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default CardRecycleBinDialog;
