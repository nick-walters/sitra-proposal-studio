import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

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
      toast({
        title: 'Dependency exists',
        description: 'This dependency already exists',
        variant: 'destructive',
      });
      return false;
    }

    // Check for self-reference
    if (fromWpId === toWpId) {
      toast({
        title: 'Invalid dependency',
        description: 'A work package cannot depend on itself',
        variant: 'destructive',
      });
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
      toast({
        title: 'Error',
        description: 'Failed to add dependency',
        variant: 'destructive',
      });
      return false;
    }
  }, [proposalId, dependencies, toast]);

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
      toast({
        title: 'Error',
        description: 'Failed to remove dependency',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

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
