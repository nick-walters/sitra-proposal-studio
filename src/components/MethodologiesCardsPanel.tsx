import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MethodologyCardsBoard } from '@/components/cards/MethodologyCardsBoard';

interface MethodologiesCardsPanelProps {
  proposalId: string;
  /** Section number of B1.2 as it appears in the panel, e.g. "B1.2". */
  sectionNumber: string;
  canEdit: boolean;
  isCoordinator: boolean;
  proposalAcronym?: string;
  acronymSegments?: { text: string; color: string }[];
}

/**
 * B1.2 — the block board. Opened from the "B1.2 Methodology" entry in the
 * left panel. The legacy MethodologiesPage stays in the codebase as the
 * rollback path but is reachable from nothing.
 */
export default function MethodologiesCardsPanel({
  proposalId,
  sectionNumber,
  canEdit,
  isCoordinator,
  proposalAcronym,
  acronymSegments,
}: MethodologiesCardsPanelProps) {
  const { data: sectionId, isLoading } = useQuery({
    queryKey: ['methodologies-cards-section', proposalId, sectionNumber],
    enabled: !!proposalId,
    queryFn: async () => {
      const bare = sectionNumber.replace(/^B/i, '');
      const { data } = await supabase
        .from('proposal_template_sections')
        .select('id, section_number, proposal_templates!inner(proposal_id)')
        .eq('proposal_templates.proposal_id', proposalId)
        .in('section_number', [`B${bare}`, bare]);
      return data?.[0]?.id ?? null;
    },
  });


  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  if (!sectionId) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        This proposal has no B1.2 section, so there are no blocks to show.
      </p>
    );
  }

  return (
    <MethodologyCardsBoard
      proposalId={proposalId}
      sectionId={sectionId}
      canEdit={canEdit}
      isCoordinator={isCoordinator}
      proposalAcronym={proposalAcronym}
      acronymSegments={acronymSegments}
    />
  );
}
