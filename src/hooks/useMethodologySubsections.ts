import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MethodologySubsection {
  id: string;
  proposalId: string;
  key: string;
  title: string;
  orderIndex: number;
  isVisible: boolean;
  contentHtml: string | null;
}

export function useMethodologySubsections(proposalId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['methodology-subsections', proposalId];

  const { data: subsections = [], isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<MethodologySubsection[]> => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('methodology_subsections')
        .select('id, proposal_id, key, title, order_index, is_visible, content_html')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        proposalId: r.proposal_id,
        key: r.key,
        title: r.title,
        orderIndex: r.order_index,
        isVisible: r.is_visible,
        contentHtml: r.content_html,
      }));
    },
    enabled: !!proposalId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const updateTitleMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from('methodology_subsections')
        .update({ title })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setVisibleMutation = useMutation({
    mutationFn: async ({ id, isVisible }: { id: string; isVisible: boolean }) => {
      const { error } = await supabase
        .from('methodology_subsections')
        .update({ is_visible: isVisible })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
          .from('methodology_subsections')
          .update({ order_index: i })
          .eq('id', orderedIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  return {
    subsections,
    isLoading,
    updateTitle: (id: string, title: string) => updateTitleMutation.mutateAsync({ id, title }),
    setVisible: (id: string, isVisible: boolean) => setVisibleMutation.mutateAsync({ id, isVisible }),
    reorder: (orderedIds: string[]) => reorderMutation.mutateAsync(orderedIds),
  };
}
