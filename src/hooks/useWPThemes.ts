import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  WP_CONTENT_COLORS,
  WP_EXPLOITATION_COLOR,
  WP_COORDINATION_COLOR,
  STANDARD_EXPLOITATION_NAME,
  STANDARD_COORDINATION_NAME,
  STANDARD_EXPLOITATION_SHORT,
  STANDARD_COORDINATION_SHORT,
} from '@/lib/wpColors';

export interface WPTheme {
  id: string;
  proposal_id: string;
  number: number;
  short_name: string | null;
  name: string | null;
  color: string;
  order_index: number;
}

/**
 * Fixed-pair rule: the LAST TWO themes by order_index are the fixed slots
 * (penultimate = exploitation, last = coordination). Derived from position,
 * not a DB flag. Content themes occupy indices 0 .. total-3.
 */
export function isFixedThemeIndex(orderIndex: number, total: number): boolean {
  return total >= 2 && orderIndex >= total - 2;
}

export function useWPThemes(proposalId: string) {
  const queryClient = useQueryClient();

  const { data: themes = [], isLoading } = useQuery({
    queryKey: ['wp-themes', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_themes')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return data as WPTheme[];
    },
    enabled: !!proposalId,
  });

  /**
   * Seed exactly 4 themes when the themes list is empty. No-op otherwise.
   * Order: [content1, content2, exploitation(fixed), coordination(fixed)].
   */
  const seedThemesMutation = useMutation({
    mutationFn: async () => {
      const { data: existing, error: exErr } = await supabase
        .from('wp_themes')
        .select('id')
        .eq('proposal_id', proposalId)
        .limit(1);
      if (exErr) throw exErr;
      if ((existing || []).length > 0) return { seeded: false };

      const rows = [
        { proposal_id: proposalId, number: 1, order_index: 0, color: WP_CONTENT_COLORS[0], short_name: null, name: null },
        { proposal_id: proposalId, number: 2, order_index: 1, color: WP_CONTENT_COLORS[1], short_name: null, name: null },
        { proposal_id: proposalId, number: 3, order_index: 2, color: WP_EXPLOITATION_COLOR, short_name: STANDARD_EXPLOITATION_SHORT, name: STANDARD_EXPLOITATION_NAME },
        { proposal_id: proposalId, number: 4, order_index: 3, color: WP_COORDINATION_COLOR, short_name: STANDARD_COORDINATION_SHORT, name: STANDARD_COORDINATION_NAME },
      ];
      const { error } = await supabase.from('wp_themes').insert(rows);
      if (error) throw error;
      return { seeded: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-themes', proposalId] });
    },
  });

  /**
   * Insert a new CONTENT theme just before the fixed pair (i.e. at
   * order_index = total-2), shifting the fixed pair to indices total-1 / total.
   * If fewer than 2 themes exist (unseeded), simply appends.
   */
  const addThemeMutation = useMutation({
    mutationFn: async () => {
      const total = themes.length;
      if (total < 2) {
        // Fallback: append (no fixed pair to preserve).
        const color = WP_CONTENT_COLORS[total % WP_CONTENT_COLORS.length];
        const { error } = await supabase.from('wp_themes').insert({
          proposal_id: proposalId,
          number: total + 1,
          order_index: total,
          color,
        });
        if (error) throw error;
        return;
      }

      const insertIdx = total - 2; // before the fixed pair
      // Two-phase renumber: bump the last two out of the way, then insert.
      // No unique constraint on (proposal_id, order_index) so a direct shift works.
      const fixed = themes.slice(total - 2);
      for (const t of fixed) {
        const { error } = await supabase
          .from('wp_themes')
          .update({ order_index: t.order_index + 1, number: t.order_index + 2 })
          .eq('id', t.id);
        if (error) throw error;
      }
      const color = WP_CONTENT_COLORS[insertIdx % WP_CONTENT_COLORS.length];
      const { error: insErr } = await supabase.from('wp_themes').insert({
        proposal_id: proposalId,
        number: insertIdx + 1,
        order_index: insertIdx,
        color,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-themes', proposalId] });
      toast.success('Theme added');
    },
    onError: () => {
      toast.error('Failed to add theme');
    },
  });

  const updateThemeMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<WPTheme> }) => {
      const { error } = await supabase.from('wp_themes').update(updates).eq('id', id);
      if (error) throw error;
      if (Object.prototype.hasOwnProperty.call(updates, 'color')) {
        const { reconcileWPColorsForProposal } = await import('@/lib/computeWPColors');
        await reconcileWPColorsForProposal(proposalId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-themes', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts-management', proposalId] });
    },
  });

  const deleteThemeMutation = useMutation({
    mutationFn: async (themeId: string) => {
      const { error } = await supabase.from('wp_themes').delete().eq('id', themeId);
      if (error) throw error;
      // Renumber remaining sequentially
      const remaining = themes.filter((t) => t.id !== themeId);
      for (let i = 0; i < remaining.length; i++) {
        const t = remaining[i];
        if (t.order_index !== i || t.number !== i + 1) {
          await supabase.from('wp_themes').update({ order_index: i, number: i + 1 }).eq('id', t.id);
        }
      }
      const { reconcileWPColorsForProposal } = await import('@/lib/computeWPColors');
      await reconcileWPColorsForProposal(proposalId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-themes', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-drafts', proposalId] });
      toast.success('Theme deleted');
    },
    onError: () => {
      toast.error('Failed to delete theme');
    },
  });

  /**
   * Constrained reorder: content themes reorder among positions 0..total-3;
   * the fixed pair (last two by original order_index) is pinned to the last
   * two positions and cannot be moved out.
   */
  const reorderThemesMutation = useMutation({
    mutationFn: async (reorderedThemes: WPTheme[]) => {
      const total = reorderedThemes.length;
      if (total < 2) return;
      // Identify the fixed pair from the CURRENT (pre-reorder) themes list.
      const currentSorted = [...themes].sort((a, b) => a.order_index - b.order_index);
      const fixedIds = new Set(currentSorted.slice(-2).map((t) => t.id));
      const content = reorderedThemes.filter((t) => !fixedIds.has(t.id));
      const fixed = currentSorted.slice(-2); // preserve fixed-pair internal order

      const final = [...content, ...fixed];
      for (let i = 0; i < final.length; i++) {
        const t = final[i];
        const { error } = await supabase
          .from('wp_themes')
          .update({ order_index: i, number: i + 1 })
          .eq('id', t.id);
        if (error) throw error;
      }
      const { reconcileWPColorsForProposal } = await import('@/lib/computeWPColors');
      await reconcileWPColorsForProposal(proposalId);
    },
    onMutate: async (reorderedThemes) => {
      await queryClient.cancelQueries({ queryKey: ['wp-themes', proposalId] });
      const previousThemes = queryClient.getQueryData<WPTheme[]>(['wp-themes', proposalId]);
      const currentSorted = [...(previousThemes || themes)].sort((a, b) => a.order_index - b.order_index);
      const fixedIds = new Set(currentSorted.slice(-2).map((t) => t.id));
      const content = reorderedThemes.filter((t) => !fixedIds.has(t.id));
      const fixed = currentSorted.slice(-2);
      const optimistic = [...content, ...fixed].map((t, i) => ({ ...t, order_index: i, number: i + 1 }));
      queryClient.setQueryData(['wp-themes', proposalId], optimistic);
      return { previousThemes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousThemes) {
        queryClient.setQueryData(['wp-themes', proposalId], context.previousThemes);
      }
      toast.error('Failed to reorder themes');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-themes', proposalId] });
    },
  });

  return {
    themes,
    isLoading,
    seedThemesIfEmpty: seedThemesMutation.mutateAsync,
    addTheme: addThemeMutation.mutate,
    updateTheme: (id: string, updates: Partial<WPTheme>) => updateThemeMutation.mutate({ id, updates }),
    deleteTheme: deleteThemeMutation.mutate,
    reorderThemes: reorderThemesMutation.mutate,
    isAdding: addThemeMutation.isPending,
  };
}
