import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';

interface Props {
  proposalId: string;
}

/**
 * Impact Canvas — compulsory figure fixed at the end of B2.1.
 * Phase 1a: renders a placeholder + autonumbered caption. Gated by
 * proposals.impact_canvas_enabled (defaults true). The toggle control
 * lives on the canvas builder page (Phase 1b), not here.
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

  // Fetch B2.1 section content to autonumber the caption letter.
  const b21ContentQ = useQuery({
    queryKey: ['impact-canvas-b21-html', proposalId],
    enabled: !!proposalId && enabledQ.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('section_content')
        .select('content')
        .eq('proposal_id', proposalId)
        .eq('section_id', 'b2-1')
        .maybeSingle();
      if (error) throw error;
      return (data?.content ?? '') as string;
    },
  });

  const letter = useMemo(() => {
    const html = b21ContentQ.data || '';
    const matches = html.match(/(Figure)\s+2\.1\.([a-z])\./gim) || [];
    return String.fromCharCode('a'.charCodeAt(0) + matches.length);
  }, [b21ContentQ.data]);

  if (enabledQ.isLoading) return null;
  if (enabledQ.data !== true) return null;

  return (
    <div
      data-impact-canvas-mount="true"
      className="space-y-1 [&_p]:!my-0 mt-[2px]"
    >
      <div
        className="border-2 border-dashed border-muted-foreground/40 rounded-md p-6 text-center text-sm text-muted-foreground bg-muted/20 font-['Times_New_Roman',Times,serif]"
        data-impact-canvas-placeholder="true"
      >
        [Impact Canvas — builder in Phase 1b]
      </div>
      <EditableCaption
        proposalId={proposalId}
        tableKey="figure-2.1-impact-canvas"
        label={`Figure 2.1.${letter}.`}
        defaultCaption="Impact canvas"
      />
    </div>
  );
}
