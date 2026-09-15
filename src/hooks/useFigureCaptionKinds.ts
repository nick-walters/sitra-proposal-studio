import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const figureCaptionKindsKey = (proposalId: string) => ['figure-caption-kinds', proposalId];

export interface FigureCaptionKinds {
  /** Block-level placements: card id → 'figure' | 'table'. */
  byCard: Record<string, 'figure' | 'table'>;
  /** Module placements: module id → 'figure' | 'table'. */
  byField: Record<string, 'figure' | 'table'>;
}

/**
 * How each placed picture is CAPTIONED. A picture is captioned as a figure
 * unless its placement says otherwise, so an absent entry always means
 * 'figure' and the numbering walk behaves exactly as it did before this
 * setting existed.
 */
export function useFigureCaptionKinds(proposalId: string) {
  return useQuery({
    queryKey: figureCaptionKindsKey(proposalId),
    enabled: !!proposalId,
    queryFn: async (): Promise<FigureCaptionKinds> => {
      const { data, error } = await supabase
        .from('card_figure')
        .select('card_id, field_id, caption_kind')
        .eq('proposal_id', proposalId);
      if (error) throw error;
      const out: FigureCaptionKinds = { byCard: {}, byField: {} };
      for (const row of data ?? []) {
        const kind = row.caption_kind === 'table' ? 'table' : 'figure';
        if (row.field_id) out.byField[row.field_id] = kind;
        else out.byCard[row.card_id] = kind;
      }
      return out;
    },
  });
}

export function invalidateFigureCaptionKinds(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'figure-caption-kinds' });
}
