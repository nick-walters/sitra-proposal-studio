import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDateTime } from '@/lib/formatDate';
import { htmlToPlainText } from '@/lib/htmlToPlainText';

/**
 * Recycle bin for the relational children of one WP draft — tasks and
 * deliverables. Rows come from the generic `card_deletions` bin built in
 * prompt 87 (`bin_target_row` / `restore_binned_target`), so nothing here is
 * card-specific: the bin holds the row's payload and its join-table links, and
 * the restore RPC re-inserts both and re-runs the server-side resequencing.
 */
export function WPBinDialog({
  isOpen,
  onClose,
  wpDraftId,
  targetType,
  title,
  onRestored,
}: {
  isOpen: boolean;
  onClose: () => void;
  wpDraftId: string;
  targetType: 'wp_draft_task' | 'wp_draft_deliverable';
  title: string;
  onRestored?: () => void;
}) {
  const qc = useQueryClient();

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['wp-bin', wpDraftId, targetType],
    enabled: isOpen && !!wpDraftId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_deletions')
        .select('id, target_id, payload, deleted_at, purge_after')
        .eq('target_type', targetType)
        .eq('parent_type', 'wp_draft')
        .eq('parent_id', wpDraftId)
        .is('restored_at', null)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const restore = async (deletionId: string) => {
    const { error } = await supabase.rpc('restore_binned_target', { p_deletion_id: deletionId });
    if (error) {
      toast.error(`Could not restore: ${error.message}`);
      return;
    }
    toast.success('Restored.');
    await refetch();
    qc.invalidateQueries({ queryKey: ['wp-drafts'] });
    onRestored?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          {isLoading && <p className="py-4 text-sm italic text-muted-foreground">Loading…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="py-4 text-sm italic text-muted-foreground">Nothing has been deleted here.</p>
          )}
          <div className="space-y-2">
            {rows.map((row) => {
              const payload = (row.payload || {}) as Record<string, unknown>;
              const label =
                htmlToPlainText(String(payload.title ?? '')) || 'Untitled';
              return (
                <div key={row.id} className="flex items-center gap-2 rounded-md border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      Deleted {formatDateTime(row.deleted_at)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => restore(row.id)}>
                    Restore
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default WPBinDialog;
