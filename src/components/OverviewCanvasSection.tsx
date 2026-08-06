import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { ImpactCanvasFreeformRenderer } from '@/components/ImpactCanvasFreeformRenderer';
import { ensureOverviewCanvas, OVERVIEW_CANVAS_FIGURE_TYPE, overviewCanvasTitle } from '@/lib/overviewCanvas';

interface Props {
  proposalId: string;
  /** When false the component never provisions the figure (read-only contexts). */
  provision?: boolean;
}

/**
 * Project overview canvas — the compulsory B1.1 figure rendered inside the
 * Objectives subsection. Read-only here; editing lives on the figure page
 * (FigureEditor → ImpactCanvasBuilder in 'overview' variant).
 * Gated by proposals.overview_canvas_enabled (defaults true).
 */
export function OverviewCanvasSection({ proposalId, provision = true }: Props) {
  const qc = useQueryClient();

  const metaQ = useQuery({
    queryKey: ['overview-canvas-meta', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const [{ data: proposal }, { data: figure }] = await Promise.all([
        supabase
          .from('proposals')
          .select('overview_canvas_enabled, acronym')
          .eq('id', proposalId)
          .maybeSingle(),
        supabase
          .from('figures')
          .select('id, figure_number, caption, title')
          .eq('proposal_id', proposalId)
          .eq('figure_type', OVERVIEW_CANVAS_FIGURE_TYPE)
          .maybeSingle(),
      ]);
      return {
        enabled: (proposal?.overview_canvas_enabled ?? true) as boolean,
        acronym: (proposal?.acronym ?? '') as string,
        figure,
      };
    },
  });

  const enabled = metaQ.data?.enabled === true;
  const figure = metaQ.data?.figure ?? null;

  // Provision the figure + default columns/row the first time an enabled
  // proposal renders B1.1 (idempotent).
  useEffect(() => {
    if (!provision || !proposalId || !enabled || !metaQ.data || figure) return;
    let cancelled = false;
    ensureOverviewCanvas(proposalId, metaQ.data.acronym)
      .then(() => {
        if (!cancelled) qc.invalidateQueries({ queryKey: ['overview-canvas-meta', proposalId] });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [provision, proposalId, enabled, figure, metaQ.data, qc]);

  if (metaQ.isLoading) return null;
  if (!enabled) return null;
  if (!figure) return null;

  return (
    <div data-overview-canvas-mount="true" className="mt-[2px]">
      <ImpactCanvasFreeformRenderer proposalId={proposalId} figureId={figure.id} mode="impact" />
      <EditableCaption
        proposalId={proposalId}
        figureId={figure.id}
        label={`Figure ${figure.figure_number}.`}
        defaultCaption={figure.caption || figure.title || overviewCanvasTitle(metaQ.data?.acronym)}
      />
    </div>
  );
}

export default OverviewCanvasSection;
