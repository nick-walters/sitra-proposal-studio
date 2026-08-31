import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUnloadFlush } from '@/lib/unloadFlush';
import { saveVersionedRow } from '@/lib/versionedSave';


export interface MethodologySubsection {
  id: string;
  proposalId: string;
  key: string;
  title: string;
  orderIndex: number;
  isVisible: boolean;
  contentHtml: string | null;
  version: number;
}

export function useMethodologySubsections(proposalId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['methodology-subsections', proposalId];
  /** Stored row version last seen per subsection, for the save-time check. */
  const versionsRef = useRef<Record<string, number>>({});

  const { data: subsections = [], isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<MethodologySubsection[]> => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('methodology_subsections')
        .select('id, proposal_id, key, title, order_index, is_visible, content_html, version')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data || []).map((r) => {
        versionsRef.current[r.id] = r.version;
        return {
          id: r.id,
          proposalId: r.proposal_id,
          key: r.key,
          title: r.title,
          orderIndex: r.order_index,
          isVisible: r.is_visible,
          contentHtml: r.content_html,
          version: r.version,
        };
      });
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

  // --- Debounced content autosave (per subsection id) ---
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /** The newest un-written value per subsection, so it can be flushed. */
  const pendingValuesRef = useRef<Record<string, string>>({});
  const pendingRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  /**
   * Writes one subsection's content through the shared version-guarded save,
   * so a second author's write cannot silently overwrite the first — the
   * rejected text is offered back through the global lost-text dialog.
   */
  const writeContent = useCallback(
    async (id: string, contentHtml: string) => {
      pendingRef.current += 1;
      setSaving(true);
      try {
        const res = await saveVersionedRow<{ version: number }>(
          'methodology_subsections',
          id,
          { content_html: contentHtml },
          versionsRef.current[id] ?? null,
        );
        if (res.version) versionsRef.current[id] = res.version;
        if (!res.ok) {
          if (res.conflict) {
            queryClient.invalidateQueries({ queryKey: ['methodology-subsections', proposalId] });
          } else {
            toast.error('Change not saved', { description: res.error || 'Please try again.' });
          }
          return;
        }
        setLastSaved(new Date());
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current <= 0) setSaving(false);
      }
    },
    [queryClient, proposalId],
  );


  /** Writes every pending value at once (unmount, tab hidden, tab closed). */
  const flushPending = useCallback(() => {
    const timers = timersRef.current;
    const pending = pendingValuesRef.current;
    pendingValuesRef.current = {};
    for (const [id, timer] of Object.entries(timers)) {
      clearTimeout(timer);
      delete timers[id];
    }
    for (const [id, html] of Object.entries(pending)) void writeContent(id, html);
  }, [writeContent]);

  // Unmounting used to CLEAR the timers, throwing away up to 800 ms of typing
  // on a route change. It now writes them.
  useEffect(() => () => flushPending(), [flushPending]);
  useUnloadFlush(flushPending);

  const updateContent = useCallback(
    (id: string, contentHtml: string) => {
      // Update the cache in place so editors are never remounted.
      queryClient.setQueryData<MethodologySubsection[]>(queryKey, (prev) =>
        (prev || []).map((s) => (s.id === id ? { ...s, contentHtml } : s)),
      );

      pendingValuesRef.current[id] = contentHtml;
      if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
      timersRef.current[id] = setTimeout(() => {
        delete timersRef.current[id];
        delete pendingValuesRef.current[id];
        void writeContent(id, contentHtml);
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, proposalId, writeContent],
  );

  return {
    subsections,
    isLoading,
    saving,
    lastSaved,
    updateContent,
    updateTitle: (id: string, title: string) => updateTitleMutation.mutateAsync({ id, title }),
    setVisible: (id: string, isVisible: boolean) => setVisibleMutation.mutateAsync({ id, isVisible }),
    reorder: (orderedIds: string[]) => reorderMutation.mutateAsync(orderedIds),
  };
}

