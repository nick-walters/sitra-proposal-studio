import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { computeFigureNumbers } from '@/lib/figureNumbering';
import { mapCardFigure, type CardFigureBlockData } from '@/types/cardTable';

export const cardFigureKey = (cardId: string) => ['card-figure', cardId];

export interface ProposalFigureOption {
  id: string;
  /** Derived from the placing block; null when the figure is unplaced. */
  figureNumber: string | null;
  title: string;
  figureType: string;
  caption: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  /** Block currently holding this figure, or null when unplaced. */
  placedCardId: string | null;
  placedSectionId: string | null;
  /** "B1.2" — the section of the placing block. */
  placedSectionLabel: string | null;
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
      width_pct?: number;
      placement?: 'full_width' | 'beside_next' | 'top_of_page';
      break_before?: boolean;
      keep_with_next?: boolean;
      keep_whole?: boolean;
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

/**
 * All figures of a proposal, each annotated with where it is placed and the
 * number DERIVED from that placement. Nothing here reads
 * `figures.figure_number`, `figures.section_id` or `figures.order_index`.
 */
export function useProposalFigures(proposalId: string) {
  return useQuery({
    queryKey: ['figures', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<ProposalFigureOption[]> => {
      const [figRes, placementRes, cardRes] = await Promise.all([
        supabase
          .from('figures')
          .select('id, title, figure_type, caption, content, created_at')
          .eq('proposal_id', proposalId)
          .order('created_at'),
        supabase.from('card_figure').select('card_id, figure_id').eq('proposal_id', proposalId),
        supabase
          .from('proposal_cards')
          .select('id, section_id, order_index')
          .eq('proposal_id', proposalId)
          .is('deleted_at', null),
      ]);
      if (figRes.error) throw figRes.error;

      const cards = cardRes.data ?? [];
      const sectionIds = Array.from(new Set(cards.map((c) => c.section_id).filter(Boolean))) as string[];
      const sectionRes = sectionIds.length
        ? await supabase
            .from('proposal_template_sections')
            .select('id, section_number, order_index')
            .in('id', sectionIds)
        : { data: [] as { id: string; section_number: string | null; order_index: number | null }[] };
      const sections = sectionRes.data ?? [];

      const numbers = computeFigureNumbers(
        (placementRes.data ?? []) as { card_id: string; figure_id: string | null }[],
        cards as { id: string; section_id: string | null; order_index: number | null }[],
        sections as { id: string; section_number: string | null; order_index: number | null }[],
      );
      const cardById = new Map(cards.map((c) => [c.id, c]));
      const sectionById = new Map(sections.map((s) => [s.id, s]));
      const placementByFigure = new Map<string, { cardId: string; sectionId: string | null; sectionLabel: string | null }>();
      for (const p of placementRes.data ?? []) {
        if (!p.figure_id) continue;
        const card = cardById.get(p.card_id);
        placementByFigure.set(p.figure_id, {
          cardId: p.card_id,
          sectionId: card?.section_id ?? null,
          sectionLabel: card?.section_id ? sectionById.get(card.section_id)?.section_number ?? null : null,
        });
      }

      return (figRes.data ?? []).map((f) => {
        const placement = placementByFigure.get(f.id) ?? null;
        return {
          id: f.id,
          figureNumber: numbers.get(f.id) ?? null,
          title: f.title,
          figureType: f.figure_type,
          caption: f.caption,
          content: f.content,
          placedCardId: placement?.cardId ?? null,
          placedSectionId: placement?.sectionId ?? null,
          placedSectionLabel: placement?.sectionLabel ?? null,
        };
      });
    },
  });
}
