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

export function usePageEstimate(proposalId: string): UsePageEstimateResult {
  const { data, isLoading } = useQuery({
    queryKey: ['page-estimate', proposalId],
    queryFn: () => buildEvaluationPayload(proposalId),
    enabled: !!proposalId,
    // Assembling the live document is heavier than a single select, so the
    // estimate is cached for a minute rather than recomputed on every mount.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
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
