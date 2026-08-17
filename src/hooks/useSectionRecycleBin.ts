import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cardFieldsKey } from './useCardFields';
import { sectionCardsKey } from './useSectionCards';
import type { CardDeletionEntry } from '@/types/cards';

/**
 * Deleted cards and fields awaiting restore or purge.
 * Pass a sectionId to scope the bin to one section, or omit it for the whole proposal.
 */
export function useSectionRecycleBin(proposalId: string, sectionId?: string) {
  const queryClient = useQueryClient();
  const queryKey = ['card-recycle-bin', proposalId, sectionId ?? 'all'];

  const { data: entries = [], isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<CardDeletionEntry[]> => {
      let query = supabase
        .from('card_deletions')
        .select('*')
        .eq('proposal_id', proposalId)
        .is('restored_at', null)
        .order('deleted_at', { ascending: false });
      if (sectionId) query = query.eq('section_id', sectionId);

      const { data, error } = await query;
      if (error) throw error;
      const rows = data || [];

      const cardIds = rows.filter((r) => r.target_type === 'card').map((r) => r.target_id);
      const fieldIds = rows.filter((r) => r.target_type === 'field').map((r) => r.target_id);

      const labels = new Map<string, string | null>();
      const previews = new Map<string, string>();
      const fieldCounts = new Map<string, number>();

      if (cardIds.length) {
        const { data: cards } = await supabase
          .from('proposal_cards')
          .select('id, title')
          .in('id', cardIds);
        for (const c of cards || []) labels.set(c.id, c.title || null);

        const { data: cardFields } = await supabase
          .from('card_fields')
          .select('card_id, content_html, order_index')
          .in('card_id', cardIds)
          .order('order_index');
        for (const f of cardFields || []) {
          fieldCounts.set(f.card_id, (fieldCounts.get(f.card_id) ?? 0) + 1);
          previews.set(
            f.card_id,
            `${previews.get(f.card_id) ?? ''}${f.content_html ?? ''}`,
          );
        }
      }

      if (fieldIds.length) {
        const { data: fields } = await supabase
          .from('card_fields')
          .select('id, heading, content_html')
          .in('id', fieldIds);
        for (const f of fields || []) {
          labels.set(f.id, f.heading || null);
          previews.set(f.id, f.content_html ?? '');
        }
      }

      return rows.map((r) => ({
        id: r.id,
        proposalId: r.proposal_id,
        sectionId: r.section_id ?? null,
        targetType: r.target_type as 'card' | 'field',
        targetId: r.target_id,
        parentCardId: r.parent_card_id ?? null,
        deletedAt: r.deleted_at,
        deletedBy: r.deleted_by ?? null,
        purgeAfter: r.purge_after ?? null,
        restoredAt: r.restored_at ?? null,
        restoredBy: r.restored_by ?? null,
        label: labels.get(r.target_id) ?? null,
        contentHtml: previews.get(r.target_id) ?? null,
        fieldCount: r.target_type === 'card' ? (fieldCounts.get(r.target_id) ?? 0) : null,
      }));

    },
    enabled: !!proposalId,
  });

  const invalidateAll = (cardId?: string | null) => {
    queryClient.invalidateQueries({ queryKey: ['card-recycle-bin', proposalId] });
    if (sectionId) {
      queryClient.invalidateQueries({ queryKey: sectionCardsKey(proposalId, sectionId) });
    } else {
      queryClient.invalidateQueries({ queryKey: ['section-cards', proposalId] });
    }
    if (cardId) queryClient.invalidateQueries({ queryKey: cardFieldsKey(cardId) });
    queryClient.invalidateQueries({ queryKey: ['card-fields-batch'] });
  };

  const restoreCard = useMutation({
    mutationFn: async (cardId: string) => {
      const { data, error } = await supabase.rpc('restore_card', { p_card_id: cardId });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, cardId) => {
      invalidateAll(cardId);
      toast.success('Card restored');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not restore the card'),
  });

  const restoreField = useMutation({
    mutationFn: async (fieldId: string) => {
      const { data, error } = await supabase.rpc('restore_card_field', { p_field_id: fieldId });
      if (error) throw error;
      return data as { card_id?: string; restored_parent_card?: boolean } | null;
    },
    onSuccess: (data) => {
      invalidateAll(data?.card_id ?? null);
      toast.success(
        data?.restored_parent_card ? 'Field restored, along with its card' : 'Field restored',
      );
    },
    onError: (e: Error) => toast.error(e.message || 'Could not restore the field'),
  });

  return {
    entries,
    cardEntries: entries.filter((e) => e.targetType === 'card'),
    fieldEntries: entries.filter((e) => e.targetType === 'field'),
    isLoading,
    error: error as Error | null,
    refetch,
    restoreCard,
    restoreField,
  };
}
