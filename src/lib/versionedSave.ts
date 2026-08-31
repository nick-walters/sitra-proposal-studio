import { supabase } from '@/integrations/supabase/client';
import { reportLostText, firstTextValue } from '@/lib/lostTextBus';

/**
 * Every rejected write surfaces the text the user typed, whatever triggered
 * it. Reporting happens HERE rather than in the callers because a save can
 * outlive the component that issued it (text flushed while navigating away),
 * and a caller-owned dialog cannot render once unmounted.
 */
function surfaceRejection(patch: Record<string, any> | string | null | undefined) {
  const text = typeof patch === 'string' ? patch : firstTextValue(patch);
  reportLostText(text);
}

/**
 * Save-time conflict rejection for the WP draft, milestone, risk and case
 * draft tables. Mirrors the cards board pattern (`save_card_text`): every save
 * carries the row version the client last loaded; the server refuses to write
 * when the stored version has moved on and hands back the authoritative row.
 */

export type VersionedTable =
  | 'wp_drafts'
  | 'wp_draft_tasks'
  | 'wp_draft_deliverables'
  | 'proposal_milestones'
  | 'proposal_risks'
  | 'case_drafts'
  | 'methodology_subsections'
  | 'methodology_items'
  | 'methodology_linked_activities';

export interface VersionedSaveResult<T = any> {
  ok: boolean;
  conflict: boolean;
  /** Stored version after a successful write, or the current one on conflict. */
  version?: number;
  /** Authoritative row, returned on success and on conflict. */
  row?: T;
  error?: string;
}

export interface ReorderItem {
  id: string;
  expected_version: number | null;
  number: number;
  order_index: number;
}

export interface ReorderResult<T = any> {
  ok: boolean;
  conflict: boolean;
  rows?: T[];
  /** Ids whose stored version had moved on; nothing was written. */
  stale?: string[];
  error?: string;
}

/** Guarded single-row save. `expectedVersion` null skips the check. */
export async function saveVersionedRow<T = any>(
  table: VersionedTable,
  id: string,
  patch: Record<string, any>,
  expectedVersion: number | null,
): Promise<VersionedSaveResult<T>> {
  const { data, error } = await (supabase as any).rpc('save_versioned_row', {
    p_table: table,
    p_id: id,
    p_patch: patch,
    p_expected_version: expectedVersion,
  });
  if (error) {
    surfaceRejection(patch);
    return { ok: false, conflict: false, error: error.message };
  }
  const res = (data ?? { ok: false, conflict: false, error: 'no response' }) as VersionedSaveResult<T>;
  if (!res.ok) surfaceRejection(patch);
  return res;
}

/**
 * All-or-nothing reorder. Every row carries the version the client loaded; if
 * any one has moved on the whole operation is refused and nothing is written.
 * Partial reorders would leave broken numbering (a D2.3 with no D2.2), which
 * is worse than asking the user to reload.
 */
export async function reorderVersionedRows<T = any>(
  table: VersionedTable,
  items: ReorderItem[],
): Promise<ReorderResult<T>> {
  const { data, error } = await (supabase as any).rpc('reorder_versioned_rows', {
    p_table: table,
    p_items: items,
  });
  if (error) return { ok: false, conflict: false, error: error.message };
  return (data ?? { ok: false, conflict: false, error: 'no response' }) as ReorderResult<T>;
}

export interface SubsectionSaveResult {
  ok: boolean;
  conflict: boolean;
  version?: number;
  /** Stored body of that subsection, returned on conflict. */
  value?: string;
  subsection_content?: Record<string, any>;
  error?: string;
}

/**
 * Per-subsection guarded save for `case_drafts.subsection_content`. The check
 * is per key rather than whole-column so two people can work on different
 * narrative subsections of the same case at once; the row `version` still
 * guards the scalar columns.
 */
export async function saveCaseDraftSubsection(
  caseId: string,
  key: string,
  body: string,
  heading: string | null,
  expectedBody: string | null,
): Promise<SubsectionSaveResult> {
  const { data, error } = await (supabase as any).rpc('save_case_draft_subsection', {
    p_id: caseId,
    p_key: key,
    p_body: body,
    p_heading: heading,
    p_expected_body: expectedBody,
  });
  if (error) {
    surfaceRejection(body);
    return { ok: false, conflict: false, error: error.message };
  }
  const res = (data ?? { ok: false, conflict: false, error: 'no response' }) as SubsectionSaveResult;
  if (!res.ok) surfaceRejection(body);
  return res;
}

/** True when the value carries no user text worth offering back for copying. */
export function isBlankValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== 'string') return false;
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';
}

export interface DeleteResequenceResult {
  ok: boolean;
  conflict: boolean;
  /** Rows left under the parent after the delete. */
  remaining?: number;
  error?: string;
}

/**
 * Moves a milestone or risk into the proposal row recycle bin, then
 * resequences the surviving rows in the same transaction.
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

/**
 * Deletes one row of a numbered list and renumbers its surviving siblings in
 * the SAME transaction. The old delete-then-reorder pair could leave a gap
 * behind whenever the second call never landed.
 */
export async function deleteAndResequence(
  table: 'wp_drafts' | 'wp_draft_tasks' | 'wp_draft_deliverables' | 'proposal_milestones' | 'proposal_risks',
  id: string,
  expectedVersion: number | null = null,
): Promise<DeleteResequenceResult> {
  const { data, error } = await (supabase as any).rpc('delete_and_resequence', {
    p_table: table,
    p_id: id,
    p_expected_version: expectedVersion,
  });
  if (error) return { ok: false, conflict: false, error: error.message };
  return (data ?? { ok: false, conflict: false, error: 'no response' }) as DeleteResequenceResult;
}

/**
 * Deletes a WP draft child (or the field before the first task) into the
 * recycle bin (kept until 90 days after submission). The row is snapshotted with its links BEFORE the
 * resequencing delete, so `restore_binned_target` can put it back.
 */
export async function binTargetRow(
  targetType: 'wp_draft_task' | 'wp_draft_deliverable' | 'wp_draft_intro' | 'case_subsection',
  targetId: string,
  expectedVersion: number | null = null,
): Promise<{ ok: boolean; conflict?: boolean; error?: string }> {
  const { data, error } = await (supabase as any).rpc('bin_target_row', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_expected_version: expectedVersion,
  });
  if (error) return { ok: false, conflict: false, error: error.message };
  return (data ?? { ok: false, error: 'no response' }) as any;
}

/**
 * Moves a task or deliverable to another work package: the move, the source
 * renumber and the target append all happen in one transaction.
 */
export async function moveChildToWpRpc(
  table: 'wp_draft_tasks' | 'wp_draft_deliverables',
  id: string,
  targetWpDraftId: string,
  expectedVersion: number | null = null,
): Promise<{ ok: boolean; conflict: boolean; moved?: boolean; error?: string }> {
  const { data, error } = await (supabase as any).rpc('move_child_to_wp', {
    p_table: table,
    p_id: id,
    p_target_wp_draft_id: targetWpDraftId,
    p_expected_version: expectedVersion,
  });
  if (error) return { ok: false, conflict: false, error: error.message };
  return (data ?? { ok: false, conflict: false, error: 'no response' }) as any;
}

/**
 * Guarded milestone save that ALSO resequences the whole milestone list in the
 * same transaction. Used when `due_month` changes, because the board orders
 * milestones by due month — the stored numbers must move with it, and doing it
 * as two calls is exactly how the numbering drifted before.
 */
export async function saveMilestoneAndResequence<T = any>(
  id: string,
  patch: Record<string, any>,
  expectedVersion: number | null,
): Promise<VersionedSaveResult<T>> {
  const { data, error } = await (supabase as any).rpc('save_milestone_and_resequence', {
    p_id: id,
    p_patch: patch,
    p_expected_version: expectedVersion,
  });
  if (error) {
    surfaceRejection(patch);
    return { ok: false, conflict: false, error: error.message };
  }
  const res = (data ?? { ok: false, conflict: false, error: 'no response' }) as VersionedSaveResult<T>;
  if (!res.ok) surfaceRejection(patch);
  return res;
}
