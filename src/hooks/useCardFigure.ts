import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { mapCardFigure, type CardFigureBlockData } from '@/types/cardTable';

export const cardFigureKey = (cardId: string) => ['card-figure', cardId];

export interface ProposalFigureOption {
  id: string;
  figureNumber: string;
  title: string;
  figureType: string;
  caption: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
}

/** Figure block placement row. `card_figure` alone decides where it renders. */
export function useCardFigure(cardId: string) {
  const queryClient = useQueryClient();
  const queryKey = cardFigureKey(cardId);

  const query = useQuery({
    queryKey,
    enabled: !!cardId,
    queryFn: async (): Promise<CardFigureBlockData | null> => {
      const { data, error } = await supabase
        .from('card_figure')
        .select('*')
        .eq('card_id', cardId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapCardFigure(data) : null;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: {
      figure_id?: string | null;
      caption?: string;
      float?: 'none' | 'left' | 'right';
      max_width_cm?: number | null;
    }) => {
      const { error } = await supabase.rpc('save_card_figure', {
        p_card_id: cardId,
        p_patch: patch,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message || 'Could not save the figure block'),
  });

  return { figureBlock: query.data ?? null, isLoading: query.isLoading, save };
}

/** All figures belonging to a proposal, for the block's figure picker. */
export function useProposalFigures(proposalId: string) {
  return useQuery({
    queryKey: ['figures', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<ProposalFigureOption[]> => {
      const { data, error } = await supabase
        .from('figures')
        .select('id, figure_number, title, figure_type, caption, content')
        .eq('proposal_id', proposalId)
        .order('section_id')
        .order('order_index');
      if (error) throw error;
      return (data ?? []).map((f) => ({
        id: f.id,
        figureNumber: f.figure_number,
        title: f.title,
        figureType: f.figure_type,
        caption: f.caption,
        content: f.content,
      }));
    },
  });
}
