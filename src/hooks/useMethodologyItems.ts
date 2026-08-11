import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MethodologyItem {
  id: string;
  proposalId: string;
  kind: string;
  caseTypeId: string | null;
  heading: string;
  contentHtml: string | null;
  assignedParticipantId: string | null;
  orderIndex: number;
}

export const methodologyItemsQueryKey = (proposalId: string | undefined | null) => [
  'methodology-items',
  proposalId,
];

/**
 * Canonical fetch for methodology_items. This is the ONLY place that owns the
 * query key, the select list and the snake_case -> camelCase mapping, so every
 * consumer of ['methodology-items', proposalId] sees the same row shape.
 */
export function useMethodologyItemsQuery(
  proposalId: string | undefined | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: methodologyItemsQueryKey(proposalId),
    enabled: !!proposalId && (options?.enabled ?? true),
    queryFn: async (): Promise<MethodologyItem[]> => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('methodology_items')
        .select(
          'id, proposal_id, kind, case_type_id, heading, content_html, assigned_participant_id, order_index',
        )
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        proposalId: r.proposal_id,
        kind: r.kind,
        caseTypeId: r.case_type_id,
        heading: r.heading,
        contentHtml: r.content_html,
        assignedParticipantId: r.assigned_participant_id,
        orderIndex: r.order_index,
      }));
    },
  });
}

export function useMethodologyItems(proposalId: string) {
  const queryClient = useQueryClient();
  const queryKey = methodologyItemsQueryKey(proposalId);

  const { data: items = [], isLoading } = useMethodologyItemsQuery(proposalId);


  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const isPlaceholder = (id: string) => {
    const current = queryClient.getQueryData<MethodologyItem[]>(queryKey) || [];
    return current.find((i) => i.id === id)?.kind === 'case_placeholder';
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const current =
        queryClient.getQueryData<MethodologyItem[]>(queryKey) || [];
      const nextIndex = current.length
        ? Math.max(...current.map((i) => i.orderIndex)) + 1
        : 0;
      const { error } = await supabase.from('methodology_items').insert({
        proposal_id: proposalId,
        kind: 'methodology',
        heading: '',
        content_html: '',
        order_index: nextIndex,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('methodology_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const assignMutation = useMutation({
    mutationFn: async ({
      id,
      participantId,
    }: {
      id: string;
      participantId: string | null;
    }) => {
      if (isPlaceholder(id)) return;
      const { error } = await supabase
        .from('methodology_items')
        .update({ assigned_participant_id: participantId })
        .eq('id', id)
        .eq('kind', 'methodology');
      if (error) throw error;
    },
    onSuccess: invalidate,
  });


  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
          .from('methodology_items')
          .update({ order_index: i })
          .eq('id', orderedIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  // --- Debounced text saves (per item id, per field) ---
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const debouncedSave = useCallback(
    (
      id: string,
      field: 'heading' | 'content_html',
      value: string,
      patch: Partial<MethodologyItem>,
    ) => {
      // Headings are derived for placeholders; descriptions are editable.
      if (field === 'heading' && isPlaceholder(id)) return;
      queryClient.setQueryData<MethodologyItem[]>(queryKey, (prev) =>
        (prev || []).map((i) => (i.id === id ? { ...i, ...patch } : i)),
      );

      const timerKey = `${id}:${field}`;
      if (timersRef.current[timerKey]) clearTimeout(timersRef.current[timerKey]);
      timersRef.current[timerKey] = setTimeout(async () => {
        delete timersRef.current[timerKey];
        pendingRef.current += 1;
        setSaving(true);
        try {
          let q = supabase
            .from('methodology_items')
            .update(
              field === 'heading' ? { heading: value } : { content_html: value },
            )
            .eq('id', id);
          // Heading writes stay restricted to real methodology rows.
          if (field === 'heading') q = q.eq('kind', 'methodology');
          const { error } = await q;
          if (error) throw error;

          setLastSaved(new Date());
        } finally {
          pendingRef.current -= 1;
          if (pendingRef.current <= 0) setSaving(false);
        }
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, proposalId],
  );


  const updateHeading = useCallback(
    (id: string, heading: string) => debouncedSave(id, 'heading', heading, { heading }),
    [debouncedSave],
  );

  const updateContent = useCallback(
    (id: string, contentHtml: string) =>
      debouncedSave(id, 'content_html', contentHtml, { contentHtml }),
    [debouncedSave],
  );

  return {
    items,
    isLoading,
    saving,
    lastSaved,
    addItem: () => addMutation.mutateAsync(),
    deleteItem: (id: string) => deleteMutation.mutateAsync(id),
    updateHeading,
    updateContent,
    setAssignedParticipant: (id: string, participantId: string | null) =>
      assignMutation.mutateAsync({ id, participantId }),
    reorder: (orderedIds: string[]) => reorderMutation.mutateAsync(orderedIds),
  };
}
