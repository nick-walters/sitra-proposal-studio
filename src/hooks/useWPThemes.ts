 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { toast } from 'sonner';
 
 export interface WPTheme {
   id: string;
   proposal_id: string;
   number: number;
   short_name: string | null;
   name: string | null;
   color: string;
   order_index: number;
 }
 
 const DEFAULT_THEME_COLORS = [
   '#2563EB', '#059669', '#D97706', '#E11D48', '#7C3AED', '#0891B2',
   '#EA580C', '#DB2777', '#475569', '#65A30D', '#4F46E5', '#0D9488'
 ];
 
 export function useWPThemes(proposalId: string) {
   const queryClient = useQueryClient();
 
   // Fetch themes
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
 
   // Add theme mutation
   const addThemeMutation = useMutation({
     mutationFn: async () => {
       const newNumber = themes.length + 1;
       const color = DEFAULT_THEME_COLORS[(newNumber - 1) % DEFAULT_THEME_COLORS.length];
       
       const { data, error } = await supabase
         .from('wp_themes')
         .insert({
           proposal_id: proposalId,
           number: newNumber,
           color,
           order_index: newNumber - 1,
         })
         .select()
         .single();
       if (error) throw error;
       return data;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['wp-themes', proposalId] });
       toast.success('Theme added');
     },
     onError: () => {
       toast.error('Failed to add theme');
     },
   });
 
   // Update theme mutation
   const updateThemeMutation = useMutation({
     mutationFn: async ({ id, updates }: { id: string; updates: Partial<WPTheme> }) => {
       const { error } = await supabase
         .from('wp_themes')
         .update(updates)
         .eq('id', id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['wp-themes', proposalId] });
     },
   });
 
   // Delete theme mutation
   const deleteThemeMutation = useMutation({
     mutationFn: async (themeId: string) => {
       const { error } = await supabase
         .from('wp_themes')
         .delete()
         .eq('id', themeId);
       if (error) throw error;
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
 
   // Reorder themes mutation
   const reorderThemesMutation = useMutation({
     mutationFn: async (reorderedThemes: WPTheme[]) => {
       const updates = reorderedThemes.map((theme, index) => ({
         id: theme.id,
         order_index: index,
         number: index + 1,
       }));
       
       for (const update of updates) {
         const { error } = await supabase
           .from('wp_themes')
           .update({ order_index: update.order_index, number: update.number })
           .eq('id', update.id);
         if (error) throw error;
       }
     },
     onMutate: async (reorderedThemes) => {
       await queryClient.cancelQueries({ queryKey: ['wp-themes', proposalId] });
       const previousThemes = queryClient.getQueryData<WPTheme[]>(['wp-themes', proposalId]);
       
       const optimisticThemes = reorderedThemes.map((theme, index) => ({
         ...theme,
         order_index: index,
         number: index + 1,
       }));
       queryClient.setQueryData(['wp-themes', proposalId], optimisticThemes);
       
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
     addTheme: addThemeMutation.mutate,
     updateTheme: (id: string, updates: Partial<WPTheme>) => 
       updateThemeMutation.mutate({ id, updates }),
     deleteTheme: deleteThemeMutation.mutate,
     reorderThemes: reorderThemesMutation.mutate,
     isAdding: addThemeMutation.isPending,
   };
 }