import { supabase } from '@/integrations/supabase/client';
import type { DeleteResequenceResult } from '@/lib/versionedSave';

/**
 * Deletes a milestone or risk the same way `deleteAndResequence` does — same
 * version check, same renumbering — but files a copy of the row and its WP
 * links in the recycle bin first, so the block's Restore control can put it
 * back.
 */
export async function binAndDeleteNumberedRow(
  table: 'proposal_milestones' | 'proposal_risks',
  id: string,
  expectedVersion: number | null = null,
): Promise<DeleteResequenceResult> {
  const { data, error } = await (supabase as any).rpc('bin_and_delete_numbered_row', {
    p_table: table,
    p_id: id,
    p_expected_version: expectedVersion,
  });
  if (error) return { ok: false, conflict: false, error: error.message };
  return (data ?? { ok: false, conflict: false, error: 'no response' }) as DeleteResequenceResult;
}
