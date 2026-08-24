import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GuidelineType } from '@/components/GuidelinesDialog';

/**
 * Commission guidelines for one block on the cards board.
 *
 * Two sources are merged, in the order the dialog shows them:
 *   - guidelines attached to the block's TEMPLATE (`card_guideline_templates`)
 *   - guidelines attached to the whole DOCUMENT (`card_guideline_documents`),
 *     which is where the formatting requirements and definitions live.
 *
 * Read-only: the seed owns this content.
 */

export interface CardGuideline {
  id: string;
  type: GuidelineType;
  title: string;
  content: string;
  order_index: number;
}

type GuidelineRow = {
  id: string;
  guideline_type: string;
  title: string | null;
  content: string;
  is_active: boolean;
  order_index: number;
};

function toGuideline(row: GuidelineRow, order: number): CardGuideline {
  const type: GuidelineType =
    row.guideline_type === 'evaluation'
      ? 'evaluation'
      : row.guideline_type === 'sitra_tip'
        ? 'sitra_tip'
        : 'official';
  return {
    id: row.id,
    type,
    title: row.title || '',
    content: row.content,
    order_index: order,
  };
}

export function useCardGuidelines(templateKey: string | null, document = 'part_b') {
  return useQuery({
    queryKey: ['card-guidelines', templateKey, document],
    queryFn: async (): Promise<CardGuideline[]> => {
      const out: CardGuideline[] = [];
      const seen = new Set<string>();

      if (templateKey) {
        const { data: templates } = await supabase
          .from('card_templates')
          .select('id')
          .eq('key', templateKey);
        const ids = (templates ?? []).map((t) => t.id);
        if (ids.length > 0) {
          const { data } = await supabase
            .from('card_guideline_templates')
            .select('order_index, card_guidelines(*)')
            .in('card_template_id', ids)
            .order('order_index');
          for (const link of data ?? []) {
            const row = (link as any).card_guidelines as GuidelineRow | null;
            if (!row?.is_active || seen.has(row.id)) continue;
            seen.add(row.id);
            out.push(toGuideline(row, (link as any).order_index ?? row.order_index));
          }
        }
      }

      const { data: docLinks } = await supabase
        .from('card_guideline_documents')
        .select('order_index, card_guidelines(*)')
        .eq('document', document)
        .order('order_index');
      for (const link of docLinks ?? []) {
        const row = (link as any).card_guidelines as GuidelineRow | null;
        if (!row?.is_active || seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(toGuideline(row, 1000 + ((link as any).order_index ?? row.order_index)));
      }

      return out;
    },
    staleTime: 5 * 60 * 1000,
  });
}
