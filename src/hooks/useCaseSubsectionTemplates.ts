import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CaseSubsectionTemplate {
  id: string;
  proposal_id: string;
  key: string;
  heading: string;
  guideline: string | null;
  order_index: number;
  is_default: boolean;
}

const QUERY_KEY = (proposalId: string) => ['case-subsection-templates', proposalId];

export function useCaseSubsectionTemplates(proposalId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY(proposalId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_subsection_templates')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data || []) as CaseSubsectionTemplate[];
    },
    enabled: !!proposalId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY(proposalId) });

  const updateRow = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CaseSubsectionTemplate> }) => {
      const { error } = await supabase
        .from('case_subsection_templates')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY(proposalId) });
      const prev = queryClient.getQueryData<CaseSubsectionTemplate[]>(QUERY_KEY(proposalId));
      queryClient.setQueryData<CaseSubsectionTemplate[]>(QUERY_KEY(proposalId), (old) =>
        (old || []).map((r) => (r.id === id ? { ...r, ...updates } : r)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY(proposalId), ctx.prev);
      toast.error('Failed to update subsection');
    },
    onSettled: invalidate,
  });

  const addRow = useMutation({
    mutationFn: async () => {
      const existing = query.data || [];
      const nextIndex = existing.length;
      const baseKey = `custom_${Date.now()}`;
      const { error } = await supabase.from('case_subsection_templates').insert({
        proposal_id: proposalId,
        key: baseKey,
        heading: 'New subsection',
        guideline: '',
        order_index: nextIndex,
        is_default: false,
      });
      if (error) throw error;
    },
    onSettled: invalidate,
    onError: () => toast.error('Failed to add subsection'),
  });

  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('case_subsection_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: invalidate,
    onError: () => toast.error('Failed to delete subsection'),
  });

  const reorder = useMutation({
    mutationFn: async (reordered: CaseSubsectionTemplate[]) => {
      for (let i = 0; i < reordered.length; i++) {
        const r = reordered[i];
        if (r.order_index === i) continue;
        const { error } = await supabase
          .from('case_subsection_templates')
          .update({ order_index: i })
          .eq('id', r.id);
        if (error) throw error;
      }
    },
    onMutate: async (reordered) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY(proposalId) });
      const prev = queryClient.getQueryData<CaseSubsectionTemplate[]>(QUERY_KEY(proposalId));
      queryClient.setQueryData(
        QUERY_KEY(proposalId),
        reordered.map((r, i) => ({ ...r, order_index: i })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY(proposalId), ctx.prev);
      toast.error('Failed to reorder subsections');
    },
    onSettled: invalidate,
  });

  return {
    templates: query.data || [],
    isLoading: query.isLoading,
    updateRow,
    addRow,
    deleteRow,
    reorder,
  };
}
