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
  // Fetch all section content for this proposal
  const { data: sectionContents, isLoading } = useQuery({
    queryKey: ['page-estimate-content', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('section_content')
        .select('content')
        .eq('proposal_id', proposalId);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!proposalId,
    staleTime: 30000, // Cache for 30 seconds
  });

  const result = useMemo(() => {
    if (!sectionContents || sectionContents.length === 0) {
      return { totalWords: 0, estimatedPages: null };
    }

    // Count words across all sections (strip HTML tags)
    const totalWords = sectionContents.reduce((sum, section) => {
      if (!section.content) return sum;
      const text = section.content
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const words = text ? text.split(' ').filter(w => w.length > 0).length : 0;
      return sum + words;
    }, 0);

    // Calculate estimated pages
    const contentPages = Math.ceil(totalWords / WORDS_PER_PAGE);
    const estimatedPages = contentPages + FRONT_MATTER_PAGES;

    return { totalWords, estimatedPages };
  }, [sectionContents]);

  return {
    estimatedPages: result.estimatedPages,
    totalWords: result.totalWords,
    isLoading,
  };
}
