import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchDerivedFigureNumbers } from '@/lib/figureNumbering';
import { EditableCaption } from '@/components/EditableCaption';
import { ImpactCanvasFreeformRenderer } from '@/components/ImpactCanvasFreeformRenderer';
import { ensureOverviewCanvas, OVERVIEW_CANVAS_FIGURE_TYPE, OVERVIEW_LAYOUT_OPTIONS, overviewCanvasTitle } from '@/lib/overviewCanvas';
import { syncBoundElements } from '@/lib/impactCanvasLayout';
import { resolveTableCanvasSize, tableCanvasToCanvasSize } from '@/lib/canvasFigureSize';

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
          .select('id, caption, title, content')
          .eq('proposal_id', proposalId)
          .eq('figure_type', OVERVIEW_CANVAS_FIGURE_TYPE)
          .maybeSingle(),
      ]);
      const numbers = figure ? await fetchDerivedFigureNumbers(proposalId) : null;
      return {
        enabled: (proposal?.overview_canvas_enabled ?? true) as boolean,
        acronym: (proposal?.acronym ?? '') as string,
        figure: figure ? { ...figure, figure_number: numbers?.get(figure.id) ?? '' } : null,
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

  // Make sure the bound (table-backed) boxes exist for the figure — the
  // layout sync runs client-side, so a figure provisioned elsewhere (e.g.
  // seeded directly) still gets its boxes on first render. Idempotent.
  useEffect(() => {
    if (!provision || !enabled || !figure?.id) return;
    let cancelled = false;
    supabase
      .from('impact_canvas_elements')
      .select('id')
      .eq('proposal_id', proposalId)
      .eq('figure_id', figure.id)
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        const hasElements = (data?.length ?? 0) > 0;
        // For full-width canvases we always re-sync so that existing boxes
        // are resized when the column count changes. The sync is idempotent
        // and only writes when x/w differ.
        if (hasElements && OVERVIEW_LAYOUT_OPTIONS.layout !== 'fullWidth') return;
         // On navigation/remount this is an additive self-heal only. Existing
         // geometry belongs to the user and must not be recalculated.
         return syncBoundElements(proposalId, figure.id, OVERVIEW_LAYOUT_OPTIONS, false).then(() => {
          if (!cancelled) {
            qc.invalidateQueries({ queryKey: ['canvas-elements', figure.id] });
          }
        });
      });
    return () => {
      cancelled = true;
    };
  }, [provision, enabled, figure?.id, proposalId, qc]);

  if (metaQ.isLoading) return null;
  if (!enabled) return null;
  if (!figure) return null;

  return (
    <div data-overview-canvas-mount="true" className="mt-[2px]">
      <ImpactCanvasFreeformRenderer
        proposalId={proposalId}
        figureId={figure.id}
        mode="impact"
        canvasSize={tableCanvasToCanvasSize(
          resolveTableCanvasSize(
            OVERVIEW_CANVAS_FIGURE_TYPE,
            (figure.content ?? null) as { presetId?: string | null; widthCm?: number | null; heightCm?: number | null } | null,
          ),
        )}
      />
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
