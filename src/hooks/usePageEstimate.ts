import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

// A typical A4 page with Times New Roman 11pt, 1.5cm margins, single spacing
// holds approximately 500-600 words of body text.
// We use 500 as a conservative estimate to account for headings, tables, figures.
const WORDS_PER_PAGE = 500;

// Additional pages for front matter (title, participant table, etc.)
const FRONT_MATTER_PAGES = 1;

interface UsePageEstimateResult {
  estimatedPages: number | null;
  totalWords: number;
  isLoading: boolean;
}

export function usePageEstimate(proposalId: string): UsePageEstimateResult {
  // Fetch all section content plus the typed A1 abstract in parallel.
  // The `section_content` row for `a1` is a legacy JSON blob and would
  // pollute the word count — exclude it and use `part_a1.abstract` instead.
  const { data, isLoading } = useQuery({
    queryKey: ['page-estimate-content', proposalId],
    queryFn: async () => {
      const [sectionsRes, a1Res] = await Promise.all([
        supabase.from('section_content').select('section_id, content').eq('proposal_id', proposalId),
        supabase.from('part_a1').select('abstract').eq('proposal_id', proposalId).maybeSingle(),
      ]);
      if (sectionsRes.error) throw sectionsRes.error;
      return {
        sections: sectionsRes.data || [],
        a1Abstract: a1Res.data?.abstract || '',
      };
    },
    enabled: !!proposalId,
    staleTime: 30000,
  });

  const result = useMemo(() => {
    if (!data) return { totalWords: 0, estimatedPages: null };

    const countWords = (html: string) => {
      const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return text ? text.split(' ').filter(w => w.length > 0).length : 0;
    };

    let totalWords = 0;
    for (const section of data.sections) {
      if (section.section_id === 'a1') continue; // legacy JSON blob — skip
      if (section.content) totalWords += countWords(section.content);
    }
    totalWords += countWords(data.a1Abstract);

    const contentPages = Math.ceil(totalWords / WORDS_PER_PAGE);
    const estimatedPages = contentPages + FRONT_MATTER_PAGES;
    return { totalWords, estimatedPages };
  }, [data]);

  return {
    estimatedPages: result.estimatedPages,
    totalWords: result.totalWords,
    isLoading,
  };
}
