import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MethodologyCardsBoard } from '@/components/cards/MethodologyCardsBoard';

interface MethodologiesCardsPanelProps {
  proposalId: string;
  /** Template section id (template_sections.id) for B1.2 in this proposal's type. */
  sourceSectionId: string;
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
  sourceSectionId,
  canEdit,
  isCoordinator,
  proposalAcronym,
  acronymSegments,
}: MethodologiesCardsPanelProps) {
  const { data: sectionId, isLoading } = useQuery({
    queryKey: ['methodologies-cards-section', proposalId, sourceSectionId],
    enabled: !!proposalId && !!sourceSectionId,
    queryFn: async () => {
      const { data } = await supabase
        .from('proposal_template_sections')
        .select('id, proposal_templates!inner(proposal_id)')
        .eq('proposal_templates.proposal_id', proposalId)
        .eq('source_section_id', sourceSectionId)
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
