import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProposalReference {
  id: string;
  proposal_id: string;
  citation_number: number;
  doi: string | null;
  authors: string[] | null;
  year: number | null;
  title: string;
  journal: string | null;
  volume: string | null;
  pages: string | null;
  formatted_citation: string | null;
  verified: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface Reference {
  authors: string[];
  year: number | null;
  title: string;
  journal: string | null;
  volume: string | null;
  pages: string | null;
  doi: string | null;
}

export function useProposalReferences(proposalId: string) {
  const [references, setReferences] = useState<ProposalReference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch all references for the proposal
  const fetchReferences = useCallback(async () => {
    if (!proposalId) {
      setReferences([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('references')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('citation_number', { ascending: true });

      if (fetchError) throw fetchError;
      setReferences(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching references:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [proposalId]);

  // Add a new reference
  const addReference = useCallback(async (
    reference: Reference,
    formattedCitation: string,
    citationNumber: number
  ): Promise<ProposalReference | null> => {
    if (!proposalId) return null;

    try {
      const { data, error: insertError } = await supabase
        .from('references')
        .insert({
          proposal_id: proposalId,
          citation_number: citationNumber,
          doi: reference.doi,
          authors: reference.authors,
          year: reference.year,
          title: reference.title,
          journal: reference.journal,
          volume: reference.volume,
          pages: reference.pages,
          formatted_citation: formattedCitation,
          verified: true,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      
      // Update local state
      setReferences(prev => [...prev, data]);
      return data;
    } catch (err) {
      console.error('Error adding reference:', err);
      return null;
    }
  }, [proposalId]);

  // Find existing reference by DOI or title
  const findExistingReference = useCallback((reference: Reference): ProposalReference | undefined => {
    return references.find(
      ref => 
        (ref.doi && ref.doi === reference.doi) || 
        (ref.title.toLowerCase() === reference.title.toLowerCase() && ref.year === reference.year)
    );
  }, [references]);

  // Get next citation number
  const getNextCitationNumber = useCallback((): number => {
    if (references.length === 0) return 1;
    const maxNumber = Math.max(...references.map(r => r.citation_number));
    return maxNumber + 1;
  }, [references]);

  // Initial fetch
  useEffect(() => {
    fetchReferences();
  }, [fetchReferences]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!proposalId) return;

    const channel = supabase
      .channel(`references-${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'references',
          filter: `proposal_id=eq.${proposalId}`,
        },
        () => {
          // Refetch on any changes
          fetchReferences();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, fetchReferences]);

  return {
    references,
    isLoading,
    error,
    addReference,
    findExistingReference,
    getNextCitationNumber,
    refetch: fetchReferences,
  };
}
