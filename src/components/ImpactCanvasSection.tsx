import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { Checkbox } from '@/components/ui/checkbox';
import { useProposalRole } from '@/hooks/useProposalRole';

interface Props {
  proposalId: string;
}

/**
 * Impact Canvas — compulsory figure fixed at the end of B2.1.
 * Phase 1a: renders a placeholder + autonumbered caption. Data model,
 * toggle, and default-column seeding are wired; the grid builder (1b)
 * and canvas graphic (1c) come later.
 */
export function ImpactCanvasSection({ proposalId }: Props) {
  const qc = useQueryClient();
  const { roleTier } = useProposalRole(proposalId);
  const isCoordinator = roleTier === 'coordinator';

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
    // Count user-typed "Figure 2.1.x." captions already present in the editor
    // HTML; the canvas figure takes the next letter after them.
    const matches = html.match(/(Figure)\s+2\.1\.([a-z])\./gim) || [];
    return String.fromCharCode('a'.charCodeAt(0) + matches.length);
  }, [b21ContentQ.data]);

  const enabled = enabledQ.data === true;

  const setEnabled = async (v: boolean) => {
    qc.setQueryData(['impact-canvas-enabled', proposalId], v);
    const { error } = await supabase
      .from('proposals')
      .update({ impact_canvas_enabled: v })
      .eq('id', proposalId);
    if (error) qc.invalidateQueries({ queryKey: ['impact-canvas-enabled', proposalId] });
  };

  if (enabledQ.isLoading) return null;
  if (!enabled && !isCoordinator) return null;

  return (
    <div
      data-impact-canvas-mount="true"
      className="space-y-1 [&_p]:!my-0 mt-[2px]"
    >
      {isCoordinator && (
        <div className="flex items-center gap-2 pb-2 print:hidden">
          <Checkbox
            id="impact-canvas-enabled"
            checked={enabled}
            onCheckedChange={(v) => setEnabled(v === true)}
          />
          <label htmlFor="impact-canvas-enabled" className="text-xs cursor-pointer text-muted-foreground">
            Include impact canvas
          </label>
        </div>
      )}

      {enabled && (
        <>
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
        </>
      )}
    </div>
  );
}
