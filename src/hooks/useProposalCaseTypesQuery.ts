import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Canonical fetcher for proposal_case_types.
 *
 * Three consumers (useProposalSections, B11ParticipantsTable, CaseManagementCard)
 * previously ran three different inline queries under the SAME React Query key,
 * so whichever mounted first primed the cache with a partial row shape. This
 * hook owns the key and the (full) column set so every consumer sees one shape.
 *
 * Rows stay in snake_case — consumers read snake_case fields.
 */
export interface ProposalCaseType {
  id: string;
  proposal_id: string;
  type_code: string | null;
  custom_type_name: string | null;
  outline_color: string;
  include_number: boolean;
  include_abbreviation: boolean;
  order_index: number;
  caption_text: string | null;
}

const CASE_TYPE_COLUMNS =
  'id, proposal_id, type_code, custom_type_name, outline_color, include_number, include_abbreviation, order_index, caption_text';

/** Do not change this key: existing invalidations elsewhere depend on it. */
export function proposalCaseTypesQueryKey(proposalId: string | undefined | null) {
  return ['proposal-case-types', proposalId] as const;
}

export function useProposalCaseTypesQuery(
  proposalId: string | undefined | null,
  options?: { enabled?: boolean },
) {
  const enabled = (options?.enabled ?? true) && !!proposalId;
  return useQuery({
    queryKey: proposalCaseTypesQueryKey(proposalId),
    enabled,
    queryFn: async (): Promise<ProposalCaseType[]> => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('proposal_case_types')
        .select(CASE_TYPE_COLUMNS)
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data ?? []) as ProposalCaseType[];
    },
  });
}
