import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildEvaluationPayload } from '@/lib/evaluationPayload';
import { countWords } from '@/lib/wordCount';
import { normalizeSectionNumber } from '@/lib/sectionNumber';

/**
 * In-editor page estimate.
 *
 * This used to read the legacy `section_content` table, which since the card
 * restructure holds only pre-restructure remnants — it understated SUSIE-Q by
 * roughly four times and told authors they had pages to spare when they were
 * over the limit. It now derives from `evaluationPayload`, the same live-card
 * assembly the evaluator uses, so the editor and the evaluator agree.
 */
interface UsePageEstimateResult {
  estimatedPages: number | null;
  totalWords: number;
  /**
   * Words per emitted Part B section, keyed by NORMALISED SECTION NUMBER
   * ("B1.1"). Not by id: the navigation carries `template_sections.id` while
   * the document carries `proposal_template_sections.id`, so an id key never
   * matched and the badge's section half was always blank.
   */
  sectionWords: Record<string, number>;
  isLoading: boolean;
}

export const pageEstimateKey = (proposalId: string) => ['page-estimate', proposalId];

/**
 * `enabled: false` when a real compiled count already answers the question —
 * the caller then reads the cache and pays nothing.
 */
export function usePageEstimate(proposalId: string, enabled = true): UsePageEstimateResult {
  const { data, isLoading } = useQuery({
    queryKey: pageEstimateKey(proposalId),
    queryFn: () => buildEvaluationPayload(proposalId),
    enabled: !!proposalId && enabled,
    // The assembly is text-only now, but it is still dozens of selects, so it
    // is computed ONCE per proposal and held until the content changes:
    // `markCompiledPageCountStale` invalidates this key alongside the compiled
    // counts. Navigating between screens re-reads the cache and costs nothing.
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const sectionWords = useMemo(() => {
    const out: Record<string, number> = {};
    for (const section of data?.sections ?? [])
      out[normalizeSectionNumber(section.number)] = countWords(section.text);
    return out;
  }, [data]);

  return {
    estimatedPages: data?.estimatedPages ?? null,
    totalWords: data?.words ?? 0,
    sectionWords,
    isLoading,
  };
}
