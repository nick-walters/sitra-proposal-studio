import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mapCard, type ProposalCard } from '@/types/cards';

export const sectionCardsKey = (proposalId: string, sectionId: string) => [
  'section-cards',
  proposalId,
  sectionId,
];

/**
 * Live (non-deleted) cards of a section, ordered head → free → tail.
 */
export function useSectionCards(proposalId: string, sectionId: string) {
  const queryClient = useQueryClient();
  const queryKey = sectionCardsKey(proposalId, sectionId);

  const { data: cards = [], isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<ProposalCard[]> => {
      const { data, error } = await supabase
        .from('proposal_cards')
        .select('*')
        .eq('proposal_id', proposalId)
        .eq('section_id', sectionId)
        .is('deleted_at', null)
        .order('order_index');
      if (error) throw error;
      return (data || []).map(mapCard);
    },
    enabled: !!proposalId && !!sectionId,
  });

  // Keep the list fresh when other collaborators change cards in this section.
  useEffect(() => {
    if (!proposalId || !sectionId) return;
    const channel = supabase
      .channel(`section-cards-${sectionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proposal_cards', filter: `section_id=eq.${sectionId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId, sectionId]);

  return {
    cards,
    headCards: cards.filter((c) => c.anchor === 'head'),
    freeCards: cards.filter((c) => c.anchor === 'free'),
    tailCards: cards.filter((c) => c.anchor === 'tail'),
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
