import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Recycle bin for the two B3.1 relational blocks (milestones and risks).
 *
 * Those rows are hard-deleted so the numbering triggers can resequence what is
 * left, so a soft-delete flag is not an option: instead the delete RPC files a
 * full copy of the row and its WP links in `proposal_row_bin`, and restoring
 * re-inserts it, which lets the same triggers renumber on the way back in.
 */
export type BinnedTable = 'proposal_milestones' | 'proposal_risks';

export interface BinnedRow {
  id: string;
  rowId: string;
  label: string | null;
  createdAt: string;
}

export const numberedRowBinKey = (proposalId: string, table: BinnedTable) => [
  'proposal-row-bin',
  proposalId,
  table,
];

export function useNumberedRowBin(proposalId: string, table: BinnedTable) {
  const queryClient = useQueryClient();
  const key = numberedRowBinKey(proposalId, table);

  const { data: deletedRows = [] } = useQuery({
    queryKey: key,
    enabled: !!proposalId,
    queryFn: async (): Promise<BinnedRow[]> => {
      const { data, error } = await supabase
        .from('proposal_row_bin')
        .select('id, row_id, label, created_at')
        .eq('proposal_id', proposalId)
        .eq('table_name', table)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        rowId: r.row_id,
        label: r.label,
        createdAt: r.created_at,
      }));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (binId: string) => {
      const { data, error } = await supabase.rpc('restore_binned_row', { p_bin_id: binId });
      if (error) throw error;
      const res = data as { ok?: boolean; error?: string } | null;
      if (!res?.ok) throw new Error(res?.error || 'Could not restore the row');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return {
    deletedRows,
    restoreRow: (binId: string) => restoreMutation.mutateAsync(binId),
    invalidateBin: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}
