import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProposalRole } from '@/hooks/useProposalRole';
import { MethodologyCardsBoard } from '@/components/cards/MethodologyCardsBoard';

/** B1.2 source section id in the Part B template (RIA/IA full proposal). */
const B12_SOURCE_SECTION_ID = '00000000-0003-0001-0002-000000000002';

/**
 * Temporary, URL-only route: the card-model copy of B1.2 running in parallel
 * with the existing Methodologies page. No nav link points here.
 */
export default function MethodologiesCardsPage() {
  const { id: proposalId = '' } = useParams<{ id: string }>();
  const { roleTier, loading: roleLoading } = useProposalRole(proposalId);

  const { data: proposal } = useQuery({
    queryKey: ['methodologies-cards-proposal', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data } = await supabase
        .from('proposals')
        .select('acronym, acronym_segments')
        .eq('id', proposalId)
        .maybeSingle();
      return data;
    },
  });

  const { data: sectionId, isLoading: sectionLoading } = useQuery({
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

  if (roleLoading || sectionLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  if (roleTier === 'none') {
    return <p className="p-6 text-sm text-muted-foreground">You do not have access to this proposal.</p>;
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
      canEdit={roleTier === 'coordinator' || roleTier === 'editor'}
      isCoordinator={roleTier === 'coordinator'}
      proposalAcronym={proposal?.acronym ?? undefined}
      acronymSegments={
        (proposal?.acronym_segments as { text: string; color: string }[] | null) ?? undefined
      }
    />
  );
}
