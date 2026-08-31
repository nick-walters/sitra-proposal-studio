import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { markCompiledPageCountStale } from '@/hooks/usePageCount';
import { mapField, type CardField } from '@/types/cards';

export const cardFieldsKey = (cardId: string) => ['card-fields', cardId];

/** Batch key: the sorted card ids of one board, joined. */
export const cardFieldsBatchKey = (cardIds: string[]) => [
  'card-fields-batch',
  [...cardIds].sort().join(','),
];

/**
 * Invalidates only the batch queries that actually contain one of `cardIds`.
 *
 * Invalidating the `['card-fields-batch']` prefix refetches every cached
 * section's whole field batch (137-154KB each) for a single field edit, so
 * every caller scopes by card instead. With no ids the prefix is used, which
 * is correct for "everything changed" cases only.
 */
export function invalidateCardFieldsBatches(qc: QueryClient, cardIds: (string | null | undefined)[]) {
  // Any card field change invalidates the compiled page count as well.
  markCompiledPageCountStale(qc);
  const ids = new Set(cardIds.filter((id): id is string => !!id));
  if (ids.size === 0) return qc.invalidateQueries({ queryKey: ['card-fields-batch'] });
  return qc.invalidateQueries({
    predicate: (q) => {
      if (q.queryKey[0] !== 'card-fields-batch') return false;
      const joined = q.queryKey[1];
      return typeof joined === 'string' && joined.split(',').some((id) => ids.has(id));
    },
  });
}

/**
 * Live (non-deleted) fields of a single card, in display order.
 */
export function useCardFields(cardId: string) {
  const { data: fields = [], isLoading, error, refetch } = useQuery({
    queryKey: cardFieldsKey(cardId),
    queryFn: async (): Promise<CardField[]> => {
      const { data, error } = await supabase
        .from('card_fields')
        .select('*')
        .eq('card_id', cardId)
        .is('deleted_at', null)
        .order('order_index');
      if (error) throw error;
      return (data || []).map(mapField);
    },
    enabled: !!cardId,
  });

  return { fields, isLoading, error: error as Error | null, refetch };
}

/**
 * Live fields for many cards at once (avoids one query per card).
 */
export function useCardFieldsForCards(cardIds: string[]) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: cardFieldsBatchKey(cardIds),
    queryFn: async (): Promise<Record<string, CardField[]>> => {
      if (cardIds.length === 0) return {};
      const { data, error } = await supabase
        .from('card_fields')
        .select('*')
        .in('card_id', cardIds)
        .is('deleted_at', null)
        .order('order_index');
      if (error) throw error;
      const grouped: Record<string, CardField[]> = {};
      for (const row of data || []) {
        const f = mapField(row);
        (grouped[f.cardId] ||= []).push(f);
      }
      return grouped;
    },
    enabled: cardIds.length > 0,
  });

  return { fieldsByCard: data || {}, isLoading, error: error as Error | null, refetch };
}
