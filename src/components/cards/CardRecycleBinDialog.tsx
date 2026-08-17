import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RotateCcw } from 'lucide-react';
import { formatDateTime } from '@/lib/formatDate';
import { useSectionRecycleBin } from '@/hooks/useSectionRecycleBin';

interface CardRecycleBinDialogProps {
  proposalId: string;
  sectionId: string;
  isOpen: boolean;
  onClose: () => void;
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
                    <div
                      key={e.id}
                      className="flex items-center gap-2 rounded-md border border-border p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{e.label ?? 'Untitled card'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Deleted {formatDateTime(new Date(e.deletedAt))}
                          {e.purgeAfter
                            ? ` · purged after ${formatDateTime(new Date(e.purgeAfter))}`
                            : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restoreCard.mutate(e.targetId)}
                        disabled={restoreCard.isPending}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {standaloneFields.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground">Fields</h4>
                  {standaloneFields.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-2 rounded-md border border-border p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{e.label ?? 'Untitled field'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Deleted {formatDateTime(new Date(e.deletedAt))}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restoreField.mutate(e.targetId)}
                        disabled={restoreField.isPending}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Restore
                      </Button>
                    </div>
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
