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
 * The proposal's own page limit.
 *
 * `useProposalTemplateCreation` freezes `base_page_limit + pageLimitDelta`
 * onto `proposal_templates` at seeding, and that frozen number goes WRONG the
 * moment the template type's base is corrected afterwards: SUSIE-Q was seeded
 * against a 45-page RIA/IA base, so the lump sum +5 landed it on 50 and stayed
 * there after the base was fixed to 40. So the limit is DERIVED here — type
 * base plus the deltas of the applied modifiers — and the stored value is used
 * only when the template has been customised by hand.
 */
export function useProposalPageLimit(proposalId: string) {
  const { data } = useQuery({
    queryKey: ['proposal-page-limit', proposalId],
    enabled: !!proposalId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: tpl } = await supabase
        .from('proposal_templates')
        .select('base_page_limit, is_customized, applied_modifier_ids, source_template_type_id')
        .eq('proposal_id', proposalId)
        .maybeSingle();

      if (tpl?.is_customized && tpl.base_page_limit) return tpl.base_page_limit as number;

      const typeId =
        tpl?.source_template_type_id ??
        (
          await supabase
            .from('proposals')
            .select('template_type_id')
            .eq('id', proposalId)
            .maybeSingle()
        ).data?.template_type_id;

      if (!typeId) return (tpl?.base_page_limit as number) || DEFAULT_BASE_PAGE_LIMIT;

      const { data: type } = await supabase
        .from('template_types')
        .select('base_page_limit')
        .eq('id', typeId)
        .maybeSingle();

      const base = (type?.base_page_limit as number) || DEFAULT_BASE_PAGE_LIMIT;

      const ids = (tpl?.applied_modifier_ids as string[] | null) ?? [];
      if (!ids.length) return base;

      const { data: mods } = await supabase
        .from('template_modifiers')
        .select('effects')
        .in('id', ids);

      const delta = (mods ?? []).reduce((sum, m) => {
        const effects = (m.effects ?? {}) as { page_limit_delta?: number };
        return sum + (Number(effects.page_limit_delta ?? 0) || 0);
      }, 0);

      return base + delta;
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
