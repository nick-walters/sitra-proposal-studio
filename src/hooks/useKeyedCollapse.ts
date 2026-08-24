import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Per-user collapse state for cards that are NOT blocks.
 *
 * Part B blocks are rows in `proposal_cards`, so their collapse preference is
 * keyed to that uuid (`card_collapse_states`). Part A cards have no such row —
 * they are hand-written sections of a form — so they are keyed instead by a
 * STABLE STRING chosen in the code, e.g. `a1.abstract`, scoped to the
 * proposal and the user (`ui_collapse_states`).
 *
 * As on the board: a row means "collapsed for me", no row means expanded, so
 * the default is expanded and one user's layout never touches another's. This
 * is a view preference only — it has no effect on the proposal's data, on
 * validation, on visibility, on numbering or on any export.
 */

export const keyedCollapseKey = (proposalId: string | null | undefined) => [
  'ui-collapse-states',
  proposalId ?? 'none',
];

type CollapseSet = Set<string>;

export function useKeyedCollapse(proposalId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = keyedCollapseKey(proposalId);

  const query = useQuery({
    queryKey,
    enabled: !!proposalId,
    staleTime: 60_000,
    queryFn: async (): Promise<CollapseSet> => {
      // RLS scopes this to the caller's own rows — no user filter needed.
      const { data, error } = await supabase
        .from('ui_collapse_states')
        .select('card_key')
        .eq('proposal_id', proposalId!);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.card_key));
    },
  });

  const collapsedKeys: CollapseSet = query.data ?? new Set();

  const optimistic = (updater: (prev: CollapseSet) => CollapseSet) => {
    const prev = queryClient.getQueryData<CollapseSet>(queryKey) ?? new Set<string>();
    queryClient.setQueryData(queryKey, updater(prev));
    return prev;
  };

  const setCollapsed = useMutation({
    mutationFn: async ({ keys, collapsed }: { keys: string[]; collapsed: boolean }) => {
      if (!proposalId || keys.length === 0) return;
      if (collapsed) {
        // user_id defaults to auth.uid() server-side; the client never sends it.
        const { error } = await supabase.from('ui_collapse_states').upsert(
          keys.map((card_key) => ({ proposal_id: proposalId, card_key })),
          { onConflict: 'user_id,proposal_id,card_key', ignoreDuplicates: true },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ui_collapse_states')
          .delete()
          .eq('proposal_id', proposalId)
          .in('card_key', keys);
        if (error) throw error;
      }
    },
    onMutate: ({ keys, collapsed }) =>
      optimistic((prev) => {
        const next = new Set(prev);
        for (const k of keys) {
          if (collapsed) next.add(k);
          else next.delete(k);
        }
        return next;
      }),
    onError: (_e, _vars, prev) => {
      if (prev) queryClient.setQueryData(queryKey, prev);
      toast.error('Could not save the collapse preference');
    },
  });

  return { collapsedKeys, setCollapsed };
}
