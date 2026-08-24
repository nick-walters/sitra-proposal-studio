import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * One-line identity for each figure block on the cards board, shown when the
 * block is collapsed: the block's own caption, falling back to the placed
 * figure's title. Read-only — the block remains the only writer.
 */
export function useCardFigureSummaries(cardIds: string[]) {
  return useQuery({
    queryKey: ['card-figure-summaries', [...cardIds].sort()],
    enabled: cardIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data: rows, error } = await supabase
        .from('card_figure')
        .select('card_id, figure_id, caption')
        .in('card_id', cardIds);
      if (error) throw error;

      const figureIds = (rows ?? [])
        .map((r) => r.figure_id)
        .filter((id): id is string => !!id);
      const { data: figs, error: figError } = figureIds.length
        ? await supabase.from('figures').select('id, title').in('id', figureIds)
        : { data: [] as { id: string; title: string }[], error: null };
      if (figError) throw figError;
      const titleById = new Map((figs ?? []).map((f) => [f.id, f.title]));

      const map: Record<string, string> = {};
      for (const r of rows ?? []) {
        map[r.card_id] =
          (r.caption ?? '').trim() ||
          (r.figure_id ? (titleById.get(r.figure_id) ?? '') : '') ||
          'No figure chosen yet';
      }
      return map;
    },
  });
}
