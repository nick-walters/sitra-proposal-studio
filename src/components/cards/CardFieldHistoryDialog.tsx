import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDateTime } from '@/lib/formatDate';
import { useCardFieldVersions } from '@/hooks/useCardFieldVersions';

interface CardFieldHistoryDialogProps {
  fieldId: string;
  fieldLabel: string;
  isOpen: boolean;
  canEdit: boolean;
  onClose: () => void;
}

/** Version history for a single card field. */
export function CardFieldHistoryDialog({
  fieldId,
  fieldLabel,
  isOpen,
  canEdit,
  onClose,
}: CardFieldHistoryDialogProps) {
  const { versions, isLoading, revertToVersion } = useCardFieldVersions(fieldId, { enabled: isOpen });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>{fieldLabel}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No versions saved yet.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="rounded-md border border-border p-2">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-sm font-medium">
                      Version {v.versionNumber}
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        {formatDateTime(new Date(v.createdAt))} · {v.isAutoSave ? 'autosave' : 'manual'}
                      </span>
                    </p>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revertToVersion.mutate(v.id)}
                        disabled={revertToVersion.isPending}
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                  <div
                    className="prose prose-sm mt-2 max-w-none text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: v.contentHtml ?? '' }}
                  />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default CardFieldHistoryDialog;
