import { useQuery } from '@tanstack/react-query';
import { buildEvaluationPayload } from '@/lib/evaluationPayload';

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

  return {
    estimatedPages: data?.estimatedPages ?? null,
    totalWords: data?.words ?? 0,
    isLoading,
  };
}
