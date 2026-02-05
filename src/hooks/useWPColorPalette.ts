import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';

export function useWPColorPalette(proposalId: string | null) {
  const [colors, setColors] = useState<string[]>(DEFAULT_WP_COLORS);
  const [loading, setLoading] = useState(true);

  const fetchPalette = useCallback(async () => {
    if (!proposalId) {
      setColors(DEFAULT_WP_COLORS);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('wp_color_palette')
        .select('colors')
        .eq('proposal_id', proposalId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      
      if (data?.colors) {
        setColors(data.colors as string[]);
      } else {
        setColors(DEFAULT_WP_COLORS);
      }
    } catch (err) {
      console.error('Error fetching color palette:', err);
      setColors(DEFAULT_WP_COLORS);
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    fetchPalette();
  }, [fetchPalette]);

  const updatePalette = useCallback(async (newColors: string[]) => {
    if (!proposalId) return false;

    try {
      const { error } = await supabase
        .from('wp_color_palette')
        .upsert({
          proposal_id: proposalId,
          colors: newColors,
        }, {
          onConflict: 'proposal_id',
        });

      if (error) throw error;

      setColors(newColors);
      return true;
    } catch (err) {
      console.error('Error updating color palette:', err);
      toast.error('Failed to update color palette');
      return false;
    }
  }, [proposalId]);

  const updateColor = useCallback(async (index: number, newColor: string) => {
    const newColors = [...colors];
    newColors[index] = newColor;
    return updatePalette(newColors);
  }, [colors, updatePalette]);

  return {
    colors,
    loading,
    refetch: fetchPalette,
    updatePalette,
    updateColor,
  };
}
