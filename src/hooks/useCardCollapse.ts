import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Per-user, per-block collapse state for the cards board.
 *
 * Storage: `card_collapse_states` — a row means "this block is collapsed FOR
 * ME". No row means expanded, so a user who has never touched a block sees it
 * expanded, and one user's layout never touches another's. The state lives in
 * its own table (never on `proposal_cards`) because it is a view preference,
 * not document state: it has no effect on visibility, export, numbering or
 * the page-limit estimate.
 */

export const cardCollapseKey = (cardIds: string[]) => [
  'card-collapse-states',
  [...cardIds].sort(),
];

type CollapseSet = Set<string>;

export function useCardCollapse(cardIds: string[]) {
  const queryClient = useQueryClient();
  const key = cardCollapseKey(cardIds);

  const query = useQuery({
    queryKey: key,
    enabled: cardIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<CollapseSet> => {
      // RLS scopes this to the caller's own rows — no user filter needed.
      const { data, error } = await supabase
        .from('card_collapse_states')
        .select('card_id')
        .in('card_id', cardIds);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.card_id));
    },
  });

  const collapsedIds: CollapseSet = query.data ?? new Set();

  const optimistic = (updater: (prev: CollapseSet) => CollapseSet) => {
    const prev = queryClient.getQueryData<CollapseSet>(key) ?? new Set<string>();
    queryClient.setQueryData(key, updater(prev));
    return prev;
  };

  const setCollapsed = useMutation({
    mutationFn: async ({ cardId, collapsed }: { cardId: string; collapsed: boolean }) => {
      if (collapsed) {
        // user_id defaults to auth.uid() server-side; the client never sends it.
        const { error } = await supabase
          .from('card_collapse_states')
          .upsert({ card_id: cardId }, { onConflict: 'user_id,card_id', ignoreDuplicates: true });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('card_collapse_states')
          .delete()
          .eq('card_id', cardId);
        if (error) throw error;
      }
    },
    onMutate: ({ cardId, collapsed }) =>
      optimistic((prev) => {
        const next = new Set(prev);
        if (collapsed) next.add(cardId);
        else next.delete(cardId);
        return next;
      }),
    onError: (_e, _vars, prev) => {
      if (prev) queryClient.setQueryData(key, prev);
      toast.error('Could not save the collapse preference');
    },
  });

  const setAllCollapsed = useMutation({
    mutationFn: async ({ ids, collapsed }: { ids: string[]; collapsed: boolean }) => {
      if (ids.length === 0) return;
      if (collapsed) {
        const { error } = await supabase
          .from('card_collapse_states')
          .upsert(
            ids.map((id) => ({ card_id: id })),
            { onConflict: 'user_id,card_id', ignoreDuplicates: true },
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('card_collapse_states')
          .delete()
          .in('card_id', ids);
        if (error) throw error;
      }
    },
    onMutate: ({ ids, collapsed }) =>
      optimistic((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (collapsed) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
    onError: (_e, _vars, prev) => {
      if (prev) queryClient.setQueryData(key, prev);
      toast.error('Could not save the collapse preference');
    },
  });

  return { collapsedIds, setCollapsed, setAllCollapsed };
}
