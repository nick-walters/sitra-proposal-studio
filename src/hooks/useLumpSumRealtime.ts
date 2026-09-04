import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Viewer-side live updates for the lump-sum budget.
 *
 * The four lump-sum hooks fetch on mount and refetch only after their OWN
 * mutations, so somebody merely LOOKING at a budget never sees another
 * person's edits. This subscribes to the six lump-sum tables and invalidates
 * the affected query keys — it never writes into the cache, so those hooks
 * remain the only thing that shapes the data.
 *
 * Deliberately NOT used on an entry surface the current user can edit: those
 * fields hold local debounced state and an invalidation mid-edit would reseed
 * a field being typed into.
 */

/** Replica identity is default, so DELETE payloads carry only the primary key. */
const TABLES = [
  'ls_personnel_roles',
  'ls_personnel_effort',
  'ls_cost_items',
  'ls_depreciation_items',
  'ls_participant_budget',
  'ls_wp_budget',
] as const;

/** One refetch per burst. An editor commits every 350ms; a viewer needs far less. */
const COALESCE_MS = 1500;

function keysFor(proposalId: string) {
  return [
    ['ls-personnel', proposalId],
    ['ls-costs', proposalId],
    ['ls-depreciation', proposalId],
    ['ls-totals', proposalId],
  ];
}

/**
 * Subscriptions are unfiltered, because a server-side `proposal_id` filter
 * would silently drop every DELETE under default replica identity. Events for
 * other proposals therefore arrive and are discarded here where the payload
 * allows it; otherwise the query-key scoping makes an over-eager invalidation
 * cost one wasted refetch, never wrong data.
 */
function concernsProposal(payload: { new?: unknown; old?: unknown }, proposalId: string) {
  const candidates = [payload.new, payload.old];
  for (const record of candidates) {
    if (!record || typeof record !== 'object') continue;
    const value = (record as Record<string, unknown>).proposal_id;
    if (typeof value === 'string') return value === proposalId;
  }
  // No proposal_id in the payload (a DELETE carrying only the primary key):
  // let it through and rely on the query-key scoping.
  return true;
}

export function useLumpSumRealtime(proposalId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!proposalId || !enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const flush = () => {
      timer = null;
      if (cancelled) return;
      for (const queryKey of keysFor(proposalId)) {
        queryClient.invalidateQueries({ queryKey });
      }
    };

    // Coalescing: the first event in a burst schedules the single refetch and
    // every further event within the window is folded into it.
    const schedule = () => {
      if (timer !== null) return;
      timer = setTimeout(flush, COALESCE_MS);
    };

    // Unique topic per subscriber: the Overview and the entry surface can be
    // mounted at once, and two channels sharing a topic interfere.
    const channel = supabase.channel(`ls-realtime:${proposalId}:${Math.random().toString(36).slice(2)}`);
    for (const table of TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        payload => {
          if (!concernsProposal(payload as { new?: unknown; old?: unknown }, proposalId)) return;
          schedule();
        },
      );
    }
    channel.subscribe();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [proposalId, enabled, queryClient]);
}
