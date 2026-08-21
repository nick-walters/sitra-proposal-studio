import { supabase } from '@/integrations/supabase/client';
import { extractCitationRefKeys } from '@/lib/citationNumbering';

/**
 * Keeps the DERIVED `citation_instances` index in step with field HTML.
 *
 * The authoritative anchor for a citation is, and stays, the
 * `<sup data-citation="…">` node inside the saved HTML — that is what copy,
 * paste, undo and track-changes operate on, and none of it is touched here.
 * These rows exist only so numbering and the references block can be computed
 * without parsing every field's HTML on every render.
 *
 * Because the index is derived, it is always safe to rebuild: the reconciler
 * replaces the whole set for one anchor in a single call (there is no DELETE
 * grant, so `reconcile_citation_instances` does the swap server-side). A lost
 * or late reconcile costs nothing beyond a stale index until the next save.
 *
 * Debounced per anchor, matching the badge reconcilers: a burst of keystrokes
 * produces one write, and the trailing call always wins.
 */

const DEBOUNCE_MS = 800;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, ReconcileArgs>();

export interface ReconcileArgs {
  proposalId: string;
  /** Anchor: a field, or a block for content not held in a field. */
  fieldId?: string | null;
  cardId?: string | null;
  html: string | null | undefined;
}

function anchorKey(args: ReconcileArgs): string {
  return args.fieldId ? `field:${args.fieldId}` : `card:${args.cardId}`;
}

/** Immediate, un-debounced rebuild for one anchor. */
export async function reconcileCitationInstancesNow(args: ReconcileArgs): Promise<void> {
  if (!args.proposalId) return;
  if (!args.fieldId && !args.cardId) return;

  const refKeys = extractCitationRefKeys(args.html);
  const { error } = await supabase.rpc('reconcile_citation_instances', {
    p_proposal_id: args.proposalId,
    p_field_id: args.fieldId ?? null,
    p_card_id: args.cardId ?? null,
    p_ref_keys: refKeys,
  });
  // A failure here degrades the index, never the document, so it is logged
  // rather than surfaced: the next save reconciles again from the same HTML.
  if (error) console.warn('citation instance reconcile failed', error);
}

/** Debounced rebuild. Repeated calls for the same anchor collapse into one. */
export function scheduleCitationInstanceReconcile(args: ReconcileArgs): void {
  const key = anchorKey(args);
  pending.set(key, args);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      const latest = pending.get(key);
      pending.delete(key);
      if (latest) void reconcileCitationInstancesNow(latest);
    }, DEBOUNCE_MS),
  );
}

/** Flush every outstanding reconcile — used on blur and before unload. */
export function flushCitationInstanceReconciles(): void {
  for (const [key, timer] of timers) {
    clearTimeout(timer);
    timers.delete(key);
    const latest = pending.get(key);
    pending.delete(key);
    if (latest) void reconcileCitationInstancesNow(latest);
  }
}
