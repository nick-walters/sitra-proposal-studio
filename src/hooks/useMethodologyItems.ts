import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { createMethodologyAssignmentNotification } from '@/hooks/useNotifications';
import { toast } from 'sonner';
import { useUnloadFlush } from '@/lib/unloadFlush';


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
  const { user } = useAuth();
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
      const current = queryClient.getQueryData<MethodologyItem[]>(queryKey) || [];
      const item = current.find((i) => i.id === id);
      const previousParticipantId = item?.assignedParticipantId ?? null;
      // No actual change — nothing to write, nothing to notify.
      if (previousParticipantId === participantId) return;

      const { error } = await supabase
        .from('methodology_items')
        .update({ assigned_participant_id: participantId })
        .eq('id', id)
        .eq('kind', 'methodology');
      if (error) throw error;

      // Notify only when an assignment is SET (clearing sends nothing, and the
      // previous organisation is not told — matching section assignments).
      if (participantId && user?.id) {
        const result = await createMethodologyAssignmentNotification({
          proposalId,
          participantId,
          assignedBy: user.id,
          methodologyHeading: item?.heading ?? null,
        });
        if (result.status === 'no-access') {
          toast.warning('Assignment saved, but no notification sent', {
            description: `${result.personLabel} has no access to this proposal, so they cannot be notified. Grant them a role on the proposal if they should see it.`,
            duration: 8000,
          });
        }
      }

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
  /** Newest un-written value per `${id}:${field}` key, so it can be flushed. */
  const pendingValuesRef = useRef<
    Record<string, { id: string; field: 'heading' | 'content_html'; value: string }>
  >({});
  const pendingRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  /** Writes one field, reporting failure instead of rejecting unhandled. */
  const writeField = useCallback(
    async (id: string, field: 'heading' | 'content_html', value: string) => {
      pendingRef.current += 1;
      setSaving(true);
      try {
        let q = supabase
          .from('methodology_items')
          .update(field === 'heading' ? { heading: value } : { content_html: value })
          .eq('id', id);
        // Heading writes stay restricted to real methodology rows.
        if (field === 'heading') q = q.eq('kind', 'methodology');
        const { error } = await q;
        if (error) throw error;
        setLastSaved(new Date());
      } catch (err) {
        toast.error('Change not saved', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current <= 0) setSaving(false);
      }
    },
    [],
  );

  /** Writes every pending value at once (unmount, tab hidden, tab closed). */
  const flushPending = useCallback(() => {
    const timers = timersRef.current;
    const pending = pendingValuesRef.current;
    pendingValuesRef.current = {};
    for (const [key, timer] of Object.entries(timers)) {
      clearTimeout(timer);
      delete timers[key];
    }
    for (const { id, field, value } of Object.values(pending)) void writeField(id, field, value);
  }, [writeField]);

  useEffect(() => () => flushPending(), [flushPending]);
  useUnloadFlush(flushPending);

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
      pendingValuesRef.current[timerKey] = { id, field, value };
      if (timersRef.current[timerKey]) clearTimeout(timersRef.current[timerKey]);
      timersRef.current[timerKey] = setTimeout(() => {
        delete timersRef.current[timerKey];
        delete pendingValuesRef.current[timerKey];
        void writeField(id, field, value);
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, proposalId, writeField],
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
