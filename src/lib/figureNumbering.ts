/** Browser-facing re-export of the canonical derived figure numbering. */
export {
  computeFigureNumbers,
  figureLetter,
  type FigureNumberingCard,
  type FigureNumberingPlacement,
  type FigureNumberingSection,
} from '../../supabase/functions/_shared/figureNumbering';

import { supabase } from '@/integrations/supabase/client';
import { computeFigureNumbers as compute } from '../../supabase/functions/_shared/figureNumbering';

/**
 * Derives every figure number of a proposal from the block that places the
 * figure. This is the ONLY authority — `figures.figure_number` is a dead
 * column that is neither written nor read any more (prompt 179).
 */
export async function fetchDerivedFigureNumbers(
  proposalId: string,
): Promise<Map<string, string>> {
  const [placementRes, cardRes] = await Promise.all([
    supabase.from('card_figure').select('card_id, figure_id').eq('proposal_id', proposalId),
    supabase
      .from('proposal_cards')
      .select('id, section_id, order_index')
      .eq('proposal_id', proposalId)
      .is('deleted_at', null),
  ]);
  const sectionIds = Array.from(
    new Set((cardRes.data || []).map((c: any) => c.section_id).filter(Boolean)),
  ) as string[];
  const sectionRes = sectionIds.length
    ? await supabase
        .from('proposal_template_sections')
        .select('id, section_number, order_index')
        .in('id', sectionIds)
    : { data: [] as any[] };
  return compute(
    (placementRes.data || []) as any[],
    (cardRes.data || []) as any[],
    (sectionRes.data || []) as any[],
  );
}
