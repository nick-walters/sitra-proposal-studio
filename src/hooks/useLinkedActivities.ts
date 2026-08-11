import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface LinkedActivity {
  id: string;
  proposalId: string;
  acronym: string;
  instrumentCode: string | null;
  instrumentCustom: string | null;
  durationStart: number | null;
  durationEnd: number | null;
  linkDescriptionHtml: string | null;
  responsibleParticipantId: string | null;
  orderIndex: number;
}

export interface LinkedActivityPatch {
  acronym?: string;
  instrumentCode?: string | null;
  instrumentCustom?: string | null;
  durationStart?: number | null;
  durationEnd?: number | null;
  linkDescriptionHtml?: string | null;
  responsibleParticipantId?: string | null;
}

type Row = {
  id: string;
  proposal_id: string;
  acronym: string;
  instrument_code: string | null;
  instrument_custom: string | null;
  duration_start: number | null;
  duration_end: number | null;
  link_description_html: string | null;
  responsible_participant_id: string | null;
  order_index: number;
};

const TABLE = 'methodology_linked_activities';

// Fields saved with an 800 ms debounce (free typing); everything else saves at once.
const DEBOUNCED_FIELDS = new Set<keyof LinkedActivityPatch>([
  'acronym',
  'instrumentCustom',
  'linkDescriptionHtml',
]);

const COLUMN: Record<keyof LinkedActivityPatch, string> = {
  acronym: 'acronym',
  instrumentCode: 'instrument_code',
  instrumentCustom: 'instrument_custom',
  durationStart: 'duration_start',
  durationEnd: 'duration_end',
  linkDescriptionHtml: 'link_description_html',
  responsibleParticipantId: 'responsible_participant_id',
};

function mapRow(r: Row): LinkedActivity {
  return {
    id: r.id,
    proposalId: r.proposal_id,
    acronym: r.acronym,
    instrumentCode: r.instrument_code,
    instrumentCustom: r.instrument_custom,
    durationStart: r.duration_start,
    durationEnd: r.duration_end,
    linkDescriptionHtml: r.link_description_html,
    responsibleParticipantId: r.responsible_participant_id,
    orderIndex: r.order_index,
  };
}

export function useLinkedActivities(proposalId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['methodology-linked-activities', proposalId];

  const { data: activities = [], isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<LinkedActivity[]> => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from(TABLE)
        .select(
          'id, proposal_id, acronym, instrument_code, instrument_custom, duration_start, duration_end, link_description_html, responsible_participant_id, order_index',
        )
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return ((data as Row[]) || []).map(mapRow);
    },
    enabled: !!proposalId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addMutation = useMutation({
    mutationFn: async () => {
      const current = queryClient.getQueryData<LinkedActivity[]>(queryKey) || [];
      const nextIndex = current.length
        ? Math.max(...current.map((a) => a.orderIndex)) + 1
        : 0;
      const { error } = await supabase.from(TABLE).insert({
        proposal_id: proposalId,
        acronym: '',
        order_index: nextIndex,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
          .from(TABLE)
          .update({ order_index: i })
          .eq('id', orderedIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  // --- Saving state + debounced writes (per id, per field) ---
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

  const writeNow = useCallback(async (id: string, dbPatch: Record<string, unknown>) => {
    pendingRef.current += 1;
    setSaving(true);
    try {
      const { error } = await supabase
        .from(TABLE)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(dbPatch as any)
        .eq('id', id);
      if (error) throw error;
      setLastSaved(new Date());
    } catch (err) {
      toast({
        title: 'Change not saved',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
      queryClient.invalidateQueries({ queryKey });
    } finally {
      pendingRef.current -= 1;
      if (pendingRef.current <= 0) setSaving(false);
    }
  }, [queryClient, queryKey]);

  /**
   * Optimistically patches the cache in place (never remounts editors), then
   * writes: debounced for free-text/HTML fields, immediate for selects.
   */
  const updateField = useCallback(
    (id: string, patch: LinkedActivityPatch) => {
      queryClient.setQueryData<LinkedActivity[]>(queryKey, (prev) =>
        (prev || []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
      );

      const entries = Object.entries(patch) as [keyof LinkedActivityPatch, unknown][];
      const immediate: Record<string, unknown> = {};

      for (const [field, value] of entries) {
        if (DEBOUNCED_FIELDS.has(field)) {
          const timerKey = `${id}:${field}`;
          if (timersRef.current[timerKey]) clearTimeout(timersRef.current[timerKey]);
          timersRef.current[timerKey] = setTimeout(() => {
            delete timersRef.current[timerKey];
            void writeNow(id, { [COLUMN[field]]: value });
          }, 800);
        } else {
          immediate[COLUMN[field]] = value;
        }
      }

      if (Object.keys(immediate).length) void writeNow(id, immediate);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, proposalId, writeNow],
  );

  return {
    activities,
    isLoading,
    saving,
    lastSaved,
    addActivity: () => addMutation.mutateAsync(),
    deleteActivity: (id: string) => deleteMutation.mutateAsync(id),
    updateField,
    reorder: (orderedIds: string[]) => reorderMutation.mutateAsync(orderedIds),
  };
}
