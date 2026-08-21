import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReferenceData } from '@/lib/referenceData';
import {
  fetchSectionCitationSources,
  sectionCitedReferences,
  type SectionCitedReference,
} from '@/lib/sectionCitations';

export type { SectionCitedReference };

/**
 * The references cited by ONE section — card blocks and the legacy
 * `section_content` body alike. The scan and the ordering live in
 * `src/lib/sectionCitations.ts`, shared with the PDF/DOCX export so both
 * surfaces list exactly the same thing.
 */
export function useSectionCitedReferences(proposalId: string, sectionId: string) {
  const { data: refData } = useReferenceData(proposalId);

  const sources = useQuery({
    queryKey: ['section-citation-sources', proposalId],
    enabled: !!proposalId,
    staleTime: 15_000,
    queryFn: () => fetchSectionCitationSources(proposalId),
  });

  const entries = useMemo(
    () =>
      sources.data
        ? sectionCitedReferences(sources.data, { sectionId }, refData?.citationNumbers)
        : [],
    [sources.data, sectionId, refData?.citationNumbers],
  );

  return {
    entries,
    isLoading: sources.isLoading,
    /** Whether the section cites anything at all — drives block visibility. */
    hasAny: entries.length > 0,
  };
}
