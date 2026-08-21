import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProposalReference {
  id: string;
  proposal_id: string;
  /** Stable internal id for the reference. NOT the number a reader sees:
   * display numbers are derived from citation order by `citationNumber.ts`. */
  ref_key: number;
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
        .from('proposal_references')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('ref_key', { ascending: true });

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

  // Add a new reference.
  // `ref_key` is minted SERVER-SIDE by the `add_proposal_reference` security-definer
  // RPC, which takes a per-proposal advisory lock before computing max+1. The
  // `citationNumber` argument is accepted for call-site compatibility but ignored:
  // client-side max+1 raced across browsers and could collide on (proposal_id, ref_key).
  const addReference = useCallback(async (
    reference: Reference,
    formattedCitation: string,
    _citationNumber?: number
  ): Promise<ProposalReference | null> => {
    if (!proposalId) return null;

    try {
      const { data, error: insertError } = await supabase.rpc('add_proposal_reference', {
        p_proposal_id: proposalId,
        p_title: reference.title,
        p_formatted_citation: formattedCitation,
        p_doi: reference.doi ?? null,
        p_authors: reference.authors ?? null,
        p_year: reference.year ?? null,
        p_journal: reference.journal ?? null,
        p_volume: reference.volume ?? null,
        p_pages: reference.pages ?? null,
        p_verified: true,
      });

      if (insertError) throw insertError;

      const saved = data as unknown as ProposalReference;
      // Update local state
      setReferences(prev => (prev.some(r => r.id === saved.id) ? prev : [...prev, saved]));
      return saved;
    } catch (err) {
      console.error('Error adding reference:', err);
      return null;
    }
  }, [proposalId]);


  // Update an existing reference
  const updateReference = useCallback(async (
    refId: string,
    updates: Partial<Omit<ProposalReference, 'id' | 'proposal_id' | 'created_at'>>
  ): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('proposal_references')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', refId);

      if (updateError) throw updateError;

      setReferences(prev => prev.map(r => r.id === refId ? { ...r, ...updates } : r));
      return true;
    } catch (err) {
      console.error('Error updating reference:', err);
      return false;
    }
  }, []);

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
    const maxNumber = Math.max(...references.map(r => r.ref_key));
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
      .channel(`proposal_references-${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proposal_references',
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
    updateReference,
    findExistingReference,
    getNextCitationNumber,
    refetch: fetchReferences,
  };
}
