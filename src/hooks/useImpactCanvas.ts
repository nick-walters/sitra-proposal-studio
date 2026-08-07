import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { syncBoundElements, type BoundLayoutOptions } from '@/lib/impactCanvasLayout';


export interface ImpactCanvasColumn {
  id: string;
  proposal_id: string;
  key: string;
  heading: string;
  guideline: string | null;
  order_index: number;
}

export interface ImpactCanvasRow {
  id: string;
  proposal_id: string;
  content: Record<string, string>;
  order_index: number;
}

const COLS_KEY = (pid: string, fid?: string | null) => ['impact-canvas-columns', pid, fid ?? 'impact'];
const ROWS_KEY = (pid: string, fid?: string | null) => ['impact-canvas-rows', pid, fid ?? 'impact'];
const ENABLED_KEY = (pid: string) => ['impact-canvas-enabled', pid];

const EMPTY_COLS: ImpactCanvasColumn[] = [];
const EMPTY_ROWS: ImpactCanvasRow[] = [];

export function useImpactCanvasColumns(proposalId: string, figureId?: string | null) {
  const qc = useQueryClient();
  const fid = figureId ?? null;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const scope = (query: any): any => (fid ? query.eq('figure_id', fid) : query.is('figure_id', null));
  const q = useQuery({
    queryKey: COLS_KEY(proposalId, fid),
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await scope(supabase
        .from('impact_canvas_columns')
        .select('*')
        .eq('proposal_id', proposalId))
        .order('order_index');
      if (error) throw error;
      return (data || []) as ImpactCanvasColumn[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: COLS_KEY(proposalId, fid) });

  const updateCol = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ImpactCanvasColumn> }) => {
      const { error } = await supabase.from('impact_canvas_columns').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSettled: invalidate,
    onError: () => toast.error('Failed to update column'),
  });

  const addCol = useMutation({
    mutationFn: async () => {
      const existing = q.data || [];
      const { error } = await supabase.from('impact_canvas_columns').insert({
        proposal_id: proposalId,
        figure_id: fid,
        key: `col_${Date.now()}`,
        heading: 'New column',
        guideline: '',
        order_index: existing.length,
      });
      if (error) throw error;
      await syncBoundElements(proposalId, fid);
    },
    onSettled: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['canvas-elements', fid ?? `impact:${proposalId}`] });
    },
    onError: () => toast.error('Failed to add column'),
  });

  const deleteCol = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('impact_canvas_columns').delete().eq('id', id);
      if (error) throw error;
      await syncBoundElements(proposalId, fid);
    },
    onSettled: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['canvas-elements', fid ?? `impact:${proposalId}`] });
    },
    onError: () => toast.error('Failed to delete column'),
  });



  const reorder = useMutation({
    mutationFn: async (reordered: ImpactCanvasColumn[]) => {
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order_index === i) continue;
        const { error } = await supabase
          .from('impact_canvas_columns')
          .update({ order_index: i })
          .eq('id', reordered[i].id);
        if (error) throw error;
      }
    },
    onMutate: async (reordered) => {
      await qc.cancelQueries({ queryKey: COLS_KEY(proposalId, fid) });
      const prev = qc.getQueryData<ImpactCanvasColumn[]>(COLS_KEY(proposalId, fid));
      qc.setQueryData(COLS_KEY(proposalId, fid), reordered.map((r, i) => ({ ...r, order_index: i })));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(COLS_KEY(proposalId, fid), ctx.prev);
      toast.error('Failed to reorder columns');
    },
    onSettled: invalidate,
  });

  return { columns: q.data ?? EMPTY_COLS, isLoading: q.isLoading, updateCol, addCol, deleteCol, reorder };
}

export function useImpactCanvasRows(proposalId: string, figureId?: string | null) {
  const qc = useQueryClient();
  const fid = figureId ?? null;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const scope = (query: any): any => (fid ? query.eq('figure_id', fid) : query.is('figure_id', null));
  const q = useQuery({
    queryKey: ROWS_KEY(proposalId, fid),
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await scope(supabase
        .from('impact_canvas_rows')
        .select('*')
        .eq('proposal_id', proposalId))
        .order('order_index');
      if (error) throw error;
      return (data || []).map((r) => ({
        ...r,
        content: (r.content ?? {}) as Record<string, string>,
      })) as ImpactCanvasRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ROWS_KEY(proposalId, fid) });

  const addRow = useMutation({
    mutationFn: async () => {
      const existing = q.data || [];
      const { error } = await supabase.from('impact_canvas_rows').insert({
        proposal_id: proposalId,
        figure_id: fid,
        content: {},
        order_index: existing.length,
      });
      if (error) throw error;
      await syncBoundElements(proposalId, fid);
    },
    onSettled: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['canvas-elements', fid ?? `impact:${proposalId}`] });
    },
    onError: () => toast.error('Failed to add row'),
  });


  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('impact_canvas_rows').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['canvas-elements', fid ?? `impact:${proposalId}`] });
    },
    onError: () => toast.error('Failed to delete row'),
  });


  const updateCell = useMutation({
    mutationFn: async ({ rowId, key, html }: { rowId: string; key: string; html: string }) => {
      const row = (q.data || []).find((r) => r.id === rowId);
      const nextContent = { ...(row?.content || {}), [key]: html };
      const { error } = await supabase
        .from('impact_canvas_rows')
        .update({ content: nextContent })
        .eq('id', rowId);
      if (error) throw error;
    },
    onMutate: async ({ rowId, key, html }) => {
      await qc.cancelQueries({ queryKey: ROWS_KEY(proposalId, fid) });
      const prev = qc.getQueryData<ImpactCanvasRow[]>(ROWS_KEY(proposalId, fid));
      qc.setQueryData<ImpactCanvasRow[]>(ROWS_KEY(proposalId, fid), (old) =>
        (old || []).map((r) => (r.id === rowId ? { ...r, content: { ...r.content, [key]: html } } : r)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ROWS_KEY(proposalId, fid), ctx.prev);
      toast.error('Failed to save cell');
    },
    onSettled: invalidate,
  });

  return { rows: q.data ?? EMPTY_ROWS, isLoading: q.isLoading, addRow, deleteRow, updateCell };
}

export function useImpactCanvasEnabled(proposalId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ENABLED_KEY(proposalId),
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('impact_canvas_enabled')
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return (data?.impact_canvas_enabled ?? true) as boolean;
    },
  });

  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('proposals')
        .update({ impact_canvas_enabled: enabled })
        .eq('id', proposalId);
      if (error) throw error;
    },
    onMutate: async (enabled) => {
      await qc.cancelQueries({ queryKey: ENABLED_KEY(proposalId) });
      const prev = qc.getQueryData<boolean>(ENABLED_KEY(proposalId));
      qc.setQueryData(ENABLED_KEY(proposalId), enabled);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(ENABLED_KEY(proposalId), ctx.prev);
      toast.error('Failed to update toggle');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ENABLED_KEY(proposalId) }),
  });

  return { enabled: q.data ?? true, isLoading: q.isLoading, setEnabled };
}


/** Overview canvas (B1.1) on/off switch — mirrors useImpactCanvasEnabled. */
const OVERVIEW_ENABLED_KEY = (pid: string) => ['overview-canvas-enabled', pid];

export function useOverviewCanvasEnabled(proposalId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: OVERVIEW_ENABLED_KEY(proposalId),
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('overview_canvas_enabled')
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return (data?.overview_canvas_enabled ?? true) as boolean;
    },
  });

  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('proposals')
        .update({ overview_canvas_enabled: enabled })
        .eq('id', proposalId);
      if (error) throw error;
    },
    onMutate: async (enabled) => {
      await qc.cancelQueries({ queryKey: OVERVIEW_ENABLED_KEY(proposalId) });
      const prev = qc.getQueryData<boolean>(OVERVIEW_ENABLED_KEY(proposalId));
      qc.setQueryData(OVERVIEW_ENABLED_KEY(proposalId), enabled);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(OVERVIEW_ENABLED_KEY(proposalId), ctx.prev);
      toast.error('Failed to update toggle');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: OVERVIEW_ENABLED_KEY(proposalId) }),
  });

  return { enabled: q.data ?? true, isLoading: q.isLoading, setEnabled };
}
