import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { deriveB32Signals, type B32Signals } from '@/lib/cards/b32Conditions';

/**
 * A2 signals behind B3.2's two conditional blocks. Read-only — see
 * `src/lib/cards/b32Conditions.ts` for the rules.
 */
export function useB32Conditions(proposalId: string, enabled: boolean) {
  const qc = useQueryClient();

  const query = useQuery<B32Signals>({
    queryKey: ['b32-conditions', proposalId],
    enabled: !!proposalId && enabled,
    queryFn: async () => {
      const [propR, partR] = await Promise.all([
        supabase
          .from('proposals')
          .select(
            'mirror_value_chain, mirror_industrial_involvement, mirror_participation_justification',
          )
          .eq('id', proposalId)
          .maybeSingle(),
        supabase
          .from('participants')
          .select('organisation_category, organisation_type, country')
          .eq('proposal_id', proposalId),
      ]);
      if (propR.error) throw propR.error;
      if (partR.error) throw partR.error;
      return deriveB32Signals(propR.data, partR.data || []);
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const handler = () => qc.invalidateQueries({ queryKey: ['b32-conditions', proposalId] });
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [qc, proposalId, enabled]);

  return query.data ?? null;
}
