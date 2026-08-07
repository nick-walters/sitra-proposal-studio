import { supabase } from '@/integrations/supabase/client';
import { syncBoundElements, type BoundLayoutOptions } from '@/lib/impactCanvasLayout';

/**
 * Project overview canvas (B1.1) — a duplicate of the Impact Canvas tool
 * scoped to its own figure.
 *
 * Data model: the figure row (figure_type = 'overview-canvas') owns the
 * canvas. Its columns/rows live in impact_canvas_columns/rows with
 * figure_id = the figure id (the Impact Canvas singleton keeps figure_id
 * NULL), and its free/bound elements live in impact_canvas_elements with
 * the same figure_id.
 */

export const OVERVIEW_CANVAS_FIGURE_TYPE = 'overview-canvas';

export const OVERVIEW_DEFAULT_COLUMNS: Array<{ key: string; heading: string; guideline: string }> = [
  { key: 'challenges', heading: 'Challenges', guideline: 'What challenges does the project address?' },
  {
    key: 'approaches_outputs',
    heading: 'Approaches & key outputs',
    guideline: 'How will the project address them, and what will it produce?',
  },
  {
    key: 'impacts',
    heading: 'Key outcomes & impacts',
    guideline: 'What wider effects will the results bring about?',
  },
];

export function overviewCanvasTitle(acronym?: string | null): string {
  return `${(acronym || 'Project').trim()} overview`;
}

/**
 * Idempotently ensure the overview canvas figure exists for a proposal, with
 * its three default columns and single content row seeded. Returns the
 * figure id (or null when it could not be created).
 */
export async function ensureOverviewCanvas(
  proposalId: string,
  acronym?: string | null,
): Promise<string | null> {
  if (!proposalId) return null;

  const { data: existing } = await supabase
    .from('figures')
    .select('id')
    .eq('proposal_id', proposalId)
    .eq('figure_type', OVERVIEW_CANVAS_FIGURE_TYPE)
    .maybeSingle();

  let figureId = existing?.id ?? null;

  if (!figureId) {
    const { data: sectionFigures } = await supabase
      .from('figures')
      .select('id')
      .eq('proposal_id', proposalId)
      .eq('section_id', '1.1');
    const index = sectionFigures?.length ?? 0;
    const title = overviewCanvasTitle(acronym);
    const { data: inserted, error } = await supabase
      .from('figures')
      .insert({
        proposal_id: proposalId,
        figure_number: `1.1.${String.fromCharCode(97 + index)}`,
        section_id: '1.1',
        title,
        caption: title,
        figure_type: OVERVIEW_CANVAS_FIGURE_TYPE,
        content: null,
        order_index: index,
      })
      .select('id')
      .maybeSingle();
    if (error) throw error;
    figureId = inserted?.id ?? null;
  }

  if (!figureId) return null;

  // Seed the three default columns (once).
  const { data: cols } = await supabase
    .from('impact_canvas_columns')
    .select('id')
    .eq('proposal_id', proposalId)
    .eq('figure_id', figureId);
  if ((cols?.length ?? 0) === 0) {
    const { error } = await supabase.from('impact_canvas_columns').insert(
      OVERVIEW_DEFAULT_COLUMNS.map((c, i) => ({
        proposal_id: proposalId,
        figure_id: figureId,
        key: c.key,
        heading: c.heading,
        guideline: c.guideline,
        order_index: i,
      })),
    );
    if (error) throw error;
  }

  // Seed the single content row (once).
  const { data: rows } = await supabase
    .from('impact_canvas_rows')
    .select('id')
    .eq('proposal_id', proposalId)
    .eq('figure_id', figureId);
  if ((rows?.length ?? 0) === 0) {
    const { error } = await supabase.from('impact_canvas_rows').insert({
      proposal_id: proposalId,
      figure_id: figureId,
      content: {},
      order_index: 0,
    });
    if (error) throw error;
  }

  await syncBoundElements(proposalId, figureId);
  return figureId;
}
