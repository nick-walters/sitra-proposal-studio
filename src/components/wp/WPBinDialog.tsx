import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDateTime } from '@/lib/formatDate';
import { htmlToPlainText } from '@/lib/htmlToPlainText';

interface WPBinDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Parent whose binned children are listed: a WP draft id, or the proposal
   *  id for surfaces whose bin rows hang off the proposal (case subsections). */
  wpDraftId: string;
  /** `card_deletions.parent_type` to filter on. Defaults to a WP draft. */
  parentType?: 'wp_draft' | 'proposal';
  targetType: WPBinTargetType | WPBinTargetType[];
  title: string;
  /** Called after a successful restore so the page can refetch. */
  onRestored?: () => void;
}

export type WPBinTargetType =
  | 'wp_draft_task'
  | 'wp_draft_deliverable'
  | 'wp_draft_intro'
  | 'case_subsection';

/** Live count of binned rows, so the restore control can grey out when empty. */
export function useWPBinCount(
  wpDraftId: string | null | undefined,
  targetType: WPBinTargetType | WPBinTargetType[],
  parentType: 'wp_draft' | 'proposal' = 'wp_draft',
) {
  const types = Array.isArray(targetType) ? targetType : [targetType];
  const { data = 0 } = useQuery({
    queryKey: ['wp-bin-count', parentType, wpDraftId, types.join(',')],
    enabled: Boolean(wpDraftId),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('card_deletions')
        .select('id', { count: 'exact', head: true })
        .eq('parent_type', parentType)
        .eq('parent_id', wpDraftId!)
        .in('target_type', types)
        .is('restored_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return data;
}

interface BinRow {
  id: string;
  deleted_at: string;
  payload: Record<string, unknown> | null;
}

/**
 * The recycle bin for a WP draft's tasks and deliverables. Items are kept
 * until 90 days after the proposal is submitted.
 *
 * Deletion goes through `bin_target_row`, which snapshots the row and its
 * relational links before the resequencing delete; restoring replays that
 * snapshot through `restore_binned_target`, which puts the row back and
 * renumbers the survivors around it.
 */
export function WPBinDialog({
  isOpen,
  onClose,
  wpDraftId,
  parentType = 'wp_draft',
  targetType,
  title,
  onRestored,
}: WPBinDialogProps) {
  const qc = useQueryClient();
  const types = Array.isArray(targetType) ? targetType : [targetType];

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['wp-bin', parentType, wpDraftId, types.join(',')],
    enabled: isOpen && Boolean(wpDraftId),
    queryFn: async (): Promise<BinRow[]> => {
      const { data, error } = await supabase
        .from('card_deletions')
        .select('id, deleted_at, payload')
        .eq('parent_type', parentType)
        .eq('parent_id', wpDraftId)
        .in('target_type', types)
        .is('restored_at', null)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      return (data || []) as BinRow[];
    },
  });

  const restore = async (deletionId: string) => {
    const { data, error } = await supabase.rpc('restore_binned_target', {
      p_deletion_id: deletionId,
    });
    const res = (data || {}) as { ok?: boolean; error?: string };
    if (error || !res.ok) {
      toast.error(error?.message || res.error || 'Failed to restore');
      return;
    }
    toast.success('Restored');
    await refetch();
    qc.invalidateQueries({ queryKey: ['wp-bin-count'] });
    qc.invalidateQueries({ queryKey: ['wp-drafts'] });
    qc.invalidateQueries({ queryKey: ['case-subsection-templates'] });
    qc.invalidateQueries({ queryKey: ['case-draft-subsections'] });
    onRestored?.();
  };

  const rowLabel = (payload: Record<string, unknown> | null) => {
    // Tasks and deliverables carry `title`; a case subsection carries `heading`.
    const text = htmlToPlainText(String(payload?.title ?? payload?.heading ?? '')).trim();
    return text || 'Untitled';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Deleted items are kept until 90 days after the proposal is submitted. Restoring one renumbers the rest automatically.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh] pr-3">
          {isLoading && <p className="py-4 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="py-4 text-sm italic text-muted-foreground">Nothing deleted recently.</p>
          )}
          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{rowLabel(row.payload)}</p>
                  <p className="text-xs text-muted-foreground">
                    Deleted {formatDateTime(row.deleted_at)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void restore(row.id)}>
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default WPBinDialog;
