import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GuidelineType } from '@/components/GuidelinesDialog';

/**
 * Commission guidelines for one block on the cards board.
 *
 * ONE source: guidelines attached to the block's TEMPLATE
 * (`card_guideline_templates`). Document-level entries — the general
 * definitions and the formatting requirements — live in
 * `card_guideline_documents` and are read separately by
 * `useDocumentGuidelines`, so a block dialog only ever shows that block's
 * own guidance.
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
    row.guideline_type === 'criteria'
      ? 'criteria'
      : row.guideline_type === 'evaluation'
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

      // Document-level entries (general definitions, formatting requirements)
      // are deliberately NOT merged here: a block's dialog shows that block's
      // guidance only. They remain available through the document-level
      // guidelines surfaces via `useDocumentGuidelines`.

      return out;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Document-level guidance (formatting requirements, general definitions),
 * shown on document-wide surfaces rather than inside a block's dialog.
 */
export function useDocumentGuidelines(document = 'part_b') {
  return useQuery({
    queryKey: ['document-guidelines', document],
    queryFn: async (): Promise<CardGuideline[]> => {
      const { data } = await supabase
        .from('card_guideline_documents')
        .select('order_index, card_guidelines(*)')
        .eq('document', document)
        .order('order_index');
      const out: CardGuideline[] = [];
      for (const link of data ?? []) {
        const row = (link as any).card_guidelines as GuidelineRow | null;
        if (!row?.is_active) continue;
        out.push(toGuideline(row, (link as any).order_index ?? row.order_index));
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Evaluation criteria for a SECTION as a whole.
 *
 * Criteria are their own category (`criteria`) and attach at section level via
 * `card_guideline_sections`, not per block: the Commission scores the
 * subsection, not the individual text box. The board passes the proposal's
 * section id; the link is stored against the TEMPLATE section it was copied
 * from, so that is resolved first.
 */
export function useSectionCriteria(proposalSectionId: string | null | undefined) {
  return useQuery({
    queryKey: ['section-criteria', proposalSectionId],
    enabled: !!proposalSectionId,
    queryFn: async (): Promise<CardGuideline[]> => {
      const { data: section } = await supabase
        .from('proposal_template_sections')
        .select('source_section_id')
        .eq('id', proposalSectionId!)
        .maybeSingle();
      const sourceId = section?.source_section_id;
      if (!sourceId) return [];

      const { data } = await supabase
        .from('card_guideline_sections')
        .select('card_guidelines(*)')
        .eq('section_source_id', sourceId);

      const out: CardGuideline[] = [];
      for (const link of data ?? []) {
        const row = (link as any).card_guidelines as GuidelineRow | null;
        if (!row?.is_active || row.guideline_type !== 'criteria') continue;
        out.push(toGuideline(row, row.order_index));
      }
      return out.sort((a, b) => a.order_index - b.order_index);
    },
    staleTime: 5 * 60 * 1000,
  });
}
