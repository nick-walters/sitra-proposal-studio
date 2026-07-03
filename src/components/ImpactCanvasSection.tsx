import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { ImpactCanvasGraphic } from '@/components/ImpactCanvasGraphic';

interface Props {
  proposalId: string;
}

/**
 * Impact Canvas — compulsory figure fixed at the end of B2.1.
 * Renders the real structured graphic (shared with the builder preview
 * via ImpactCanvasGraphic) + autonumbered caption sourced from the
 * figures row (figure_number + caption). Gated by
 * proposals.impact_canvas_enabled (defaults true). Read-only here —
 * editing lives on the dedicated figure/builder page.
 */
export function ImpactCanvasSection({ proposalId }: Props) {
  const enabledQ = useQuery({
    queryKey: ['impact-canvas-enabled', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('impact_canvas_enabled')
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return (data?.impact_canvas_enabled ?? true) as boolean;
    },
  });

  const figureQ = useQuery({
    queryKey: ['impact-canvas-figure', proposalId],
    enabled: !!proposalId && enabledQ.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('figures')
        .select('id, figure_number, caption, title')
        .eq('proposal_id', proposalId)
        .eq('figure_type', 'impact-canvas')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (enabledQ.isLoading) return null;
  if (enabledQ.data !== true) return null;
  if (!figureQ.data) return null;

  const fig = figureQ.data;

  return (
    <div
      data-impact-canvas-mount="true"
      className="space-y-1 [&_p]:!my-0 mt-[2px]"
    >
      <ImpactCanvasGraphic proposalId={proposalId} />
      <EditableCaption
        proposalId={proposalId}
        figureId={fig.id}
        label={`Figure ${fig.figure_number}.`}
        defaultCaption={fig.caption || fig.title || 'Impact canvas'}
      />
    </div>
  );
}

