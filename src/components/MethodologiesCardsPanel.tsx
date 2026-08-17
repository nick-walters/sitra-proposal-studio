import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MethodologyCardsBoard } from '@/components/cards/MethodologyCardsBoard';

/** B1.2 source section id in the Part B template (RIA/IA full proposal). */
const B12_SOURCE_SECTION_ID = '00000000-0003-0001-0002-000000000002';

interface MethodologiesCardsPanelProps {
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
  proposalAcronym?: string;
  acronymSegments?: { text: string; color: string }[];
}

/**
 * Temporary beta panel: the card-model copy of B1.2, rendered inside the
 * existing /proposal/:id editor next to the current Methodologies page.
 */
export default function MethodologiesCardsPanel({
  proposalId,
  canEdit,
  isCoordinator,
  proposalAcronym,
  acronymSegments,
}: MethodologiesCardsPanelProps) {
  const { data: sectionId, isLoading } = useQuery({
    queryKey: ['methodologies-cards-section', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data } = await supabase
        .from('proposal_template_sections')
        .select('id, proposal_templates!inner(proposal_id)')
        .eq('proposal_templates.proposal_id', proposalId)
        .eq('source_section_id', B12_SOURCE_SECTION_ID)
        .maybeSingle();
      return data?.id ?? null;
    },
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  if (!sectionId) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        This proposal has no B1.2 section, so there are no cards to show.
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
