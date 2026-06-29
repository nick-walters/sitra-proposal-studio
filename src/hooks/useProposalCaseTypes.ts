import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lightweight read of proposal_case_types for wording purposes.
 * Returns just type_code + custom_type_name (ordered) so callers can
 * feed it into caseWord() from @/lib/caseTypeLabels.
 */
export interface ProposalCaseTypeLite {
  type_code: string | null;
  custom_type_name: string | null;
}

export function useProposalCaseTypes(proposalId: string | undefined | null) {
  return useQuery({
    queryKey: ['proposal-case-types-wording', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<ProposalCaseTypeLite[]> => {
      const { data } = await supabase
        .from('proposal_case_types')
        .select('type_code, custom_type_name')
        .eq('proposal_id', proposalId as string)
        .order('order_index');
      return (data ?? []) as ProposalCaseTypeLite[];
    },
  });
}
