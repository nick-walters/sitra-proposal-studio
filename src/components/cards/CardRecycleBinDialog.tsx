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
    <div className="rounded-md border border-border p-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[11px] font-bold">
              {entry.targetType === 'card' ? 'Card' : 'Field'}
            </Badge>
            {entry.targetType === 'card' && entry.fieldCount != null && (
              <span className="text-[11px] text-muted-foreground">
                {entry.fieldCount} {entry.fieldCount === 1 ? 'field' : 'fields'}
              </span>
            )}
            {entry.label && <span className="truncate text-sm font-bold">{entry.label}</span>}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Deleted {formatDateTime(new Date(entry.deletedAt))}
            {entry.purgeAfter ? ` · purged after ${formatDateTime(new Date(entry.purgeAfter))}` : ''}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRestore} disabled={isRestoring}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Restore
        </Button>
      </div>

      {hasContent && (
        <div className="mt-2">
          <div className="relative">
            <div
              className={`prose prose-sm max-w-none text-sm text-muted-foreground ${
                expanded ? '' : 'max-h-[7.5rem] overflow-hidden'
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

/** Deleted cards and individually deleted fields for one section, with restore. */
export function CardRecycleBinDialog({
  proposalId,
  sectionId,
  isOpen,
  onClose,
}: CardRecycleBinDialogProps) {
  const { cardEntries, fieldEntries, isLoading, restoreCard, restoreField } = useSectionRecycleBin(
    proposalId,
    sectionId,
  );

  const standaloneFields = fieldEntries.filter(
    (f) => !cardEntries.some((c) => c.targetId === f.parentCardId),
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Recycle bin</DialogTitle>
          <DialogDescription>
            Deleted cards and fields for this section. Restore puts them back where they were.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : cardEntries.length === 0 && standaloneFields.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">The bin is empty.</p>
          ) : (
            <div className="space-y-4">
              {cardEntries.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground">Cards</h4>
                  {cardEntries.map((e) => (
                    <BinEntry
                      key={e.id}
                      entry={e}
                      isRestoring={restoreCard.isPending}
                      onRestore={() => restoreCard.mutate(e.targetId)}
                    />
                  ))}
                </div>
              )}

              {standaloneFields.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground">Fields</h4>
                  {standaloneFields.map((e) => (
                    <BinEntry
                      key={e.id}
                      entry={e}
                      isRestoring={restoreField.isPending}
                      onRestore={() => restoreField.mutate(e.targetId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default CardRecycleBinDialog;
