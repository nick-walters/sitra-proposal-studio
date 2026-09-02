import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Distinct from ['ls-personnel', …], ['ls-costs', …], ['ls-depreciation', …]
 * and ['ls-access', …]: no collision and no prefix overlap.
 */
export const LUMP_SUM_TOTALS_QUERY_KEY = (proposalId: string) => ['ls-totals', proposalId] as const;

export const WP_COMMENT_LIMIT = 1000;

export type LumpSumTotalsWorkPackage = {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color: string;
};

export type LumpSumTotalsParticipant = {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
  organisation_name: string | null;
};

export type LsWpBudgetRow = {
  id: string;
  participant_id: string;
  wp_draft_id: string;
  comments: string;
  requested_eu_contribution: number | null;
};

export type LsParticipantBudgetRow = {
  participant_id: string;
  a4_unit_cost: number | null;
  funding_rate_override: number | null;
  is_locked: boolean;
};

export type LumpSumTotalsData = {
  wpBudgets: LsWpBudgetRow[];
  participantBudgets: LsParticipantBudgetRow[];
  workPackages: LumpSumTotalsWorkPackage[];
  participants: LumpSumTotalsParticipant[];
  /** Both rates come from the proposals row; nothing here is hardcoded. */
  indirectCostRate: number;
  defaultFundingRate: number;
};

export type { LumpSumWpInputs, LumpSumWpTotals } from '@/lib/lumpSumFigures';
export { computeWpTotals, roundCents } from '@/lib/lumpSumFigures';

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
}

export function useLumpSumTotals(proposalId: string) {
  const queryClient = useQueryClient();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const queryKey = LUMP_SUM_TOTALS_QUERY_KEY(proposalId);

  const query = useQuery({
    queryKey,
    enabled: Boolean(proposalId),
    queryFn: async (): Promise<LumpSumTotalsData> => {
      const [wpBudgetResult, participantBudgetResult, proposalResult, wpResult, participantResult] = await Promise.all([
        supabase.from('ls_wp_budget').select('id, participant_id, wp_draft_id, comments, requested_eu_contribution').eq('proposal_id', proposalId),
        supabase.from('ls_participant_budget').select('participant_id, a4_unit_cost, funding_rate_override, is_locked').eq('proposal_id', proposalId),
        supabase.from('proposals').select('ls_indirect_cost_rate, ls_default_funding_rate').eq('id', proposalId).single(),
        supabase.from('wp_drafts').select('id, number, short_name, title, color').eq('proposal_id', proposalId).order('number'),
        supabase.from('participants').select('id, participant_number, organisation_short_name, organisation_name').eq('proposal_id', proposalId).order('participant_number'),
      ]);
      const failure = [wpBudgetResult, participantBudgetResult, proposalResult, wpResult, participantResult].find(result => result.error);
      if (failure?.error) throw failure.error;
      return {
        wpBudgets: (wpBudgetResult.data ?? []) as LsWpBudgetRow[],
        participantBudgets: (participantBudgetResult.data ?? []) as LsParticipantBudgetRow[],
        workPackages: (wpResult.data ?? []) as LumpSumTotalsWorkPackage[],
        participants: (participantResult.data ?? []) as LumpSumTotalsParticipant[],
        indirectCostRate: Number(proposalResult.data?.ls_indirect_cost_rate ?? 0),
        defaultFundingRate: Number(proposalResult.data?.ls_default_funding_rate ?? 0),
      };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const ensureParticipantBudget = async (participantId: string) => {
    const { error } = await supabase
      .from('ls_participant_budget')
      .upsert({ proposal_id: proposalId, participant_id: participantId }, { onConflict: 'participant_id' });
    if (error) throw error;
  };

  const saveWpBudget = useMutation({
    mutationFn: async ({ participantId, wpDraftId, patch }: {
      participantId: string;
      wpDraftId: string;
      patch: { comments?: string; requested_eu_contribution?: number | null };
    }) => {
      await ensureParticipantBudget(participantId);
      const existing = query.data?.wpBudgets.find(row => row.participant_id === participantId && row.wp_draft_id === wpDraftId);
      const { error } = await supabase.from('ls_wp_budget').upsert({
        proposal_id: proposalId,
        participant_id: participantId,
        wp_draft_id: wpDraftId,
        comments: patch.comments ?? existing?.comments ?? '',
        requested_eu_contribution: patch.requested_eu_contribution !== undefined
          ? patch.requested_eu_contribution
          : (existing?.requested_eu_contribution ?? null),
      }, { onConflict: 'participant_id,wp_draft_id' });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to save the work package budget: ${errorMessage(error)}`),
  });

  const saveFundingRate = useMutation({
    mutationFn: async ({ participantId, value }: { participantId: string; value: number | null }) => {
      await ensureParticipantBudget(participantId);
      const { error } = await supabase
        .from('ls_participant_budget')
        .update({ funding_rate_override: value })
        .eq('proposal_id', proposalId)
        .eq('participant_id', participantId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(`Failed to save the funding rate: ${errorMessage(error)}`),
  });

  const debounced = (key: string, callback: () => void) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(callback, 350);
  };

  return {
    ...query,
    data: query.data,
    setRequestedContribution: (participantId: string, wpDraftId: string, value: number | null) =>
      debounced(`request-${participantId}-${wpDraftId}`, () => saveWpBudget.mutate({ participantId, wpDraftId, patch: { requested_eu_contribution: value } })),
    setComments: (participantId: string, wpDraftId: string, value: string) =>
      debounced(`comments-${participantId}-${wpDraftId}`, () => saveWpBudget.mutate({ participantId, wpDraftId, patch: { comments: value.slice(0, WP_COMMENT_LIMIT) } })),
    setFundingRateOverride: (participantId: string, value: number | null) =>
      debounced(`funding-${participantId}`, () => saveFundingRate.mutate({ participantId, value })),
    saving: saveWpBudget.isPending || saveFundingRate.isPending,
  };
}
