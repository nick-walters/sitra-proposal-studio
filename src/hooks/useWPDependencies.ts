import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface WPDependency {
  id: string;
  proposal_id: string;
  from_wp_id: string;
  to_wp_id: string;
  created_at: string;
}

export function useWPDependencies(proposalId: string | null) {
  const [dependencies, setDependencies] = useState<WPDependency[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDependencies = useCallback(async () => {
    if (!proposalId) {
      setDependencies([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('wp_dependencies')
        .select('*')
        .eq('proposal_id', proposalId);

      if (error) throw error;
      setDependencies(data || []);
    } catch (err) {
      console.error('Error fetching WP dependencies:', err);
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    fetchDependencies();
  }, [fetchDependencies]);

  const addDependency = useCallback(async (fromWpId: string, toWpId: string) => {
    if (!proposalId) return false;

    // Check if dependency already exists
    if (dependencies.some(d => d.from_wp_id === fromWpId && d.to_wp_id === toWpId)) {
      toast.error('This dependency already exists');
      return false;
    }

    // Check for self-reference
    if (fromWpId === toWpId) {
      toast.error('A work package cannot depend on itself');
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('wp_dependencies')
        .insert({
          proposal_id: proposalId,
          from_wp_id: fromWpId,
          to_wp_id: toWpId,
        })
        .select()
        .single();

      if (error) throw error;

      setDependencies(prev => [...prev, data]);
      return true;
    } catch (err) {
      console.error('Error adding dependency:', err);
      toast.error('Failed to add dependency');
      return false;
    }
  }, [proposalId, dependencies]);

  const removeDependency = useCallback(async (dependencyId: string) => {
    try {
      const { error } = await supabase
        .from('wp_dependencies')
        .delete()
        .eq('id', dependencyId);

      if (error) throw error;

      setDependencies(prev => prev.filter(d => d.id !== dependencyId));
      return true;
    } catch (err) {
      console.error('Error removing dependency:', err);
      toast.error('Failed to remove dependency');
      return false;
    }
  }, []);

  // Get all WPs that depend on a given WP (incoming dependencies)
  const getIncomingDependencies = useCallback((wpId: string) => {
    return dependencies.filter(d => d.to_wp_id === wpId);
  }, [dependencies]);

  // Get all WPs that a given WP depends on (outgoing dependencies)
  const getOutgoingDependencies = useCallback((wpId: string) => {
    return dependencies.filter(d => d.from_wp_id === wpId);
  }, [dependencies]);

  return {
    dependencies,
    loading,
    refetch: fetchDependencies,
    addDependency,
    removeDependency,
    getIncomingDependencies,
    getOutgoingDependencies,
  };
}
