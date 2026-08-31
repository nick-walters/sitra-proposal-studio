/** Browser-facing re-export of the canonical derived figure numbering. */
export {
  computeFigureNumbers,
  figureLetter,
  type FigureNumberingCard,
  type FigureNumberingPlacement,
  type FigureNumberingSection,
} from '../../supabase/functions/_shared/figureNumbering';

import { supabase } from '@/integrations/supabase/client';
import {
  computeFigureNumbers as compute,
  figureLetter,
} from '../../supabase/functions/_shared/figureNumbering';

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

/**
 * The Pert and Gantt charts are SOURCE-FED blocks of B3.1 — they are not
 * placed through `card_figure`, so `computeFigureNumbers()` has no placement
 * for them and returns nothing (which is why their captions read "Figure .").
 * Their numbers are derived from B3.1 instead: they follow any figures that
 * ARE placed in that section, in the order the section renders them (Pert,
 * then Gantt).
 */
export async function fetchB31SystemFigureNumbers(
  proposalId: string,
): Promise<{ pert: string; gantt: string }> {
  const { data: cards } = await supabase
    .from('proposal_cards')
    .select('id, section_id')
    .eq('proposal_id', proposalId)
    .is('deleted_at', null);
  const sectionIds = Array.from(
    new Set((cards || []).map((c: { section_id: string | null }) => c.section_id).filter(Boolean)),
  ) as string[];
  if (!sectionIds.length) return { pert: '', gantt: '' };
  const { data: sections } = await supabase
    .from('proposal_template_sections')
    .select('id, section_number')
    .in('id', sectionIds);
  const section = (sections || []).find(
    (s: { section_number: string | null }) =>
      (s.section_number ?? '').replace(/^[A-Za-z]+/, '').trim() === '3.1',
  );
  if (!section) return { pert: '', gantt: '' };
  const sectionCardIds = (cards || [])
    .filter((c: { section_id: string | null }) => c.section_id === section.id)
    .map((c: { id: string }) => c.id);
  let placed = 0;
  if (sectionCardIds.length) {
    const { data: placements } = await supabase
      .from('card_figure')
      .select('figure_id, card_id')
      .eq('proposal_id', proposalId)
      .in('card_id', sectionCardIds);
    placed = (placements || []).filter((p: { figure_id: string | null }) => p.figure_id).length;
  }
  return {
    pert: `3.1.${figureLetter(placed)}`,
    gantt: `3.1.${figureLetter(placed + 1)}`,
  };
}
