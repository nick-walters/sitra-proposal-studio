/**
 * The authoritative Part B page count.
 *
 * The word-derived estimate was only ever an approximation; the Typst compile
 * in `PartBDocumentView` produces the REAL page count in about a second, so
 * that number is published into the query cache and reused everywhere in the
 * editor chrome. The word estimate survives only as the placeholder shown
 * before the first compile of a session.
 *
 * Cache lifetime: the compiled count is kept per proposal with no expiry and
 * is marked STALE (not discarded) whenever a card field changes — see
 * `invalidateCardFieldsBatches` in `useCardFields.ts`. A stale count is still
 * shown, flagged as such, until the next compile replaces it.
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_BASE_PAGE_LIMIT } from '@/lib/constants';
import { usePageEstimate } from './usePageEstimate';

export interface CompiledPageCount {
  pages: number;
  /** Epoch ms of the compile that produced it. */
  at: number;
  /** True once content has changed since that compile. */
  stale: boolean;
}

export const compiledPageCountKey = (proposalId: string) => ['compiled-page-count', proposalId];

/** Called by the document view after every successful compile. */
export function publishCompiledPageCount(qc: QueryClient, proposalId: string, pages: number) {
  if (!proposalId || !pages) return;
  qc.setQueryData<CompiledPageCount>(compiledPageCountKey(proposalId), {
    pages,
    at: Date.now(),
    stale: false,
  });
}

/** Marks every cached compiled count as out of date after a content change. */
export function markCompiledPageCountStale(qc: QueryClient) {
  qc.setQueriesData<CompiledPageCount>(
    { queryKey: ['compiled-page-count'] },
    (old) => (old ? { ...old, stale: true } : old),
  );
}

/**
 * The proposal's own page limit, which already carries any modifier delta:
 * `useProposalTemplateCreation` writes `base_page_limit + pageLimitDelta` onto
 * `proposal_templates` at seeding, so a lump sum or CBE JU proposal is stored
 * with its adjusted limit rather than the template type's base.
 */
export function useProposalPageLimit(proposalId: string) {
  const { data } = useQuery({
    queryKey: ['proposal-page-limit', proposalId],
    enabled: !!proposalId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: tpl } = await supabase
        .from('proposal_templates')
        .select('base_page_limit')
        .eq('proposal_id', proposalId)
        .maybeSingle();
      if (tpl?.base_page_limit) return tpl.base_page_limit as number;

      const { data: proposal } = await supabase
        .from('proposals')
        .select('template_type_id')
        .eq('id', proposalId)
        .maybeSingle();
      if (!proposal?.template_type_id) return DEFAULT_BASE_PAGE_LIMIT;

      const { data: type } = await supabase
        .from('template_types')
        .select('base_page_limit')
        .eq('id', proposal.template_type_id)
        .maybeSingle();
      return (type?.base_page_limit as number) || DEFAULT_BASE_PAGE_LIMIT;
    },
  });
  return data ?? DEFAULT_BASE_PAGE_LIMIT;
}

export interface PageCountResult {
  /** Real compiled pages when available, otherwise the word estimate. */
  pages: number | null;
  /** True when `pages` came from a Typst compile. */
  isCompiled: boolean;
  /** True when the compiled count predates the latest content change. */
  isStale: boolean;
  words: number;
  limit: number;
  overLimit: boolean;
  isLoading: boolean;
}

export function usePageCount(proposalId: string): PageCountResult {
  const qc = useQueryClient();
  const limit = useProposalPageLimit(proposalId);
  const { estimatedPages, totalWords, isLoading } = usePageEstimate(proposalId);

  const { data: compiled } = useQuery<CompiledPageCount | null>({
    queryKey: compiledPageCountKey(proposalId),
    enabled: !!proposalId,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: () => qc.getQueryData<CompiledPageCount>(compiledPageCountKey(proposalId)) ?? null,
  });

  const pages = compiled?.pages ?? estimatedPages ?? null;

  return {
    pages,
    isCompiled: !!compiled,
    isStale: !!compiled?.stale,
    words: totalWords,
    limit,
    overLimit: pages !== null && pages > limit,
    isLoading,
  };
}
