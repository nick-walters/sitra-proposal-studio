import { useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDateTime } from '@/lib/formatDate';
import { supabase } from '@/integrations/supabase/client';
import { useTargetVersions, type VersionTargetType } from '@/hooks/useTargetVersions';
import { CROSS_REF_RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import type { CardTextBox } from '@/types/cards';


interface CardFieldHistoryDialogProps {
  proposalId: string;
  /** Row id of the target. For a module this is the card field id. */
  fieldId: string;
  /**
   * Which text box of the target. Modules use 'header' or 'content'; other
   * targets pass the column name (or subsection key) that holds the text.
   */
  textBox: CardTextBox | string;
  /** Defaults to a module text box, so existing call sites are unchanged. */
  targetType?: VersionTargetType;
  /** Version of the underlying row, for conflict rejection on restore. */
  expectedVersion?: number | null;
  /** Human label for the module the text box belongs to. */
  fieldLabel: string;
  /** Overrides the default "Header/Content text box" wording. */
  boxLabelOverride?: string;
  isOpen: boolean;
  canEdit: boolean;
  onClose: () => void;
  /** Fired after a successful revert so the board can jump to the text box. */
  onReverted?: () => void;
}

/** Version history for a single text box of a module or other target. */
export function CardFieldHistoryDialog({
  proposalId,
  fieldId,
  textBox,
  targetType = 'card_field',
  expectedVersion,
  fieldLabel,
  boxLabelOverride,
  isOpen,
  canEdit,
  onClose,
  onReverted,
}: CardFieldHistoryDialogProps) {
  const { versions, isLoading, revertToVersion } = useTargetVersions(
    { targetType, targetId: fieldId, textBox },
    {
      enabled: isOpen,
      expectedVersion,
      invalidateKeys:
        targetType === 'card_field'
          ? [['card-fields-batch'], ['card-fields']]
          : [
              ['wp-drafts'],
              ['case-drafts'],
              ['case-draft-detail'],
              ['case-draft-subsections'],
              ['wp-drafts-management'],
              ['case-drafts-management'],
            ],
    },
  );

  // Same trigger as the legacy section history: prune on open.
  useEffect(() => {
    if (!isOpen || !proposalId) return;
    void supabase.rpc('thin_card_field_versions', { p_proposal_id: proposalId }).then(() => undefined);
  }, [isOpen, proposalId]);

  const boxLabel =
    boxLabelOverride ?? (textBox === 'header' ? 'Header text box' : 'Content text box');


  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Version history — {boxLabel.toLowerCase()}</DialogTitle>
          <DialogDescription>{fieldLabel}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              No versions saved for this text box yet.
            </p>
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
                        onClick={() =>
                          revertToVersion.mutate(v.id, {
                            onSuccess: () => {
                              // Close first: Radix holds a body scroll lock
                              // while the dialog is mounted, which would
                              // swallow the jump. Defer the callback a tick so
                              // the lock is fully released before scrolling.
                              onClose();
                              window.setTimeout(() => onReverted?.(), 0);
                            },
                          })
                        }
                        disabled={revertToVersion.isPending}
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                  {textBox === 'header' ? (
                    <p className="mt-2 text-sm font-bold text-muted-foreground">
                      {v.heading || <span className="italic font-normal">(empty)</span>}
                    </p>
                  ) : (
                    <div
                      className="prose prose-sm mt-2 max-w-none text-sm text-muted-foreground"
                      dangerouslySetInnerHTML={{
                        // Stored HTML is untrusted: sanitise with the shared
                        // cross-reference preset so chips, formatting and
                        // tables survive while scripts do not.
                        __html: DOMPurify.sanitize(v.contentHtml ?? '', CROSS_REF_RICH_TEXT_CONFIG),
                      }}
                    />
                  )}
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
