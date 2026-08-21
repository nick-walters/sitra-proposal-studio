import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  mapCardTable,
  mapCardTableCell,
  mapCardTableColumn,
  mapCardTableRow,
  type CardTable,
  type CardTableCell,
  type CardTableColumn,
  type CardTableRow,
} from '@/types/cardTable';
import type { CellAlignH, CellAlignV } from '@/lib/tableStyleSpec';

export const cardTableKey = (cardId: string) => ['card-table', cardId];

export interface CardTableData {
  table: CardTable | null;
  columns: CardTableColumn[];
  rows: CardTableRow[];
  cells: CardTableCell[];
}

/**
 * Whole table block in one query: the block row, its columns, rows and cells.
 * Everything downstream (rendering, resize, alignment) reads from here.
 */
export function useCardTable(cardId: string) {
  const queryClient = useQueryClient();
  const queryKey = cardTableKey(cardId);

  const query = useQuery({
    queryKey,
    enabled: !!cardId,
    queryFn: async (): Promise<CardTableData> => {
      const [tableRes, colRes, rowRes] = await Promise.all([
        supabase.from('card_table').select('*').eq('card_id', cardId).maybeSingle(),
        supabase.from('card_table_columns').select('*').eq('card_id', cardId).order('part').order('order_index'),
        supabase.from('card_table_rows').select('*').eq('card_id', cardId).order('part').order('order_index'),
      ]);
      if (tableRes.error) throw tableRes.error;
      if (colRes.error) throw colRes.error;
      if (rowRes.error) throw rowRes.error;

      const rows = (rowRes.data ?? []).map(mapCardTableRow);
      let cells: CardTableCell[] = [];
      if (rows.length > 0) {
        const { data, error } = await supabase
          .from('card_table_cells')
          .select('*')
          .in('row_id', rows.map((r) => r.id));
        if (error) throw error;
        cells = (data ?? []).map(mapCardTableCell);
      }

      return {
        table: tableRes.data ? mapCardTable(tableRes.data) : null,
        columns: (colRes.data ?? []).map(mapCardTableColumn),
        rows,
        cells,
      };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addRow = useMutation({
    mutationFn: async ({ part, rowType = 'body' }: { part: number; rowType?: 'header' | 'body' }) => {
      const { error } = await supabase.rpc('add_card_table_row', {
        p_card_id: cardId,
        p_part: part,
        p_row_type: rowType,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message || 'Could not add the row'),
  });

  const deleteRow = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.rpc('delete_card_table_row', { p_row_id: rowId });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message || 'Could not remove the row'),
  });

  const addColumn = useMutation({
    mutationFn: async (part: number) => {
      const { error } = await supabase.rpc('add_card_table_column', { p_card_id: cardId, p_part: part });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message || 'Could not add the column'),
  });

  const deleteColumn = useMutation({
    mutationFn: async (columnId: string) => {
      const { error } = await supabase.rpc('delete_card_table_column', { p_column_id: columnId });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message || 'Could not remove the column'),
  });

  const saveColumn = useMutation({
    mutationFn: async ({
      columnId,
      patch,
    }: {
      columnId: string;
      patch: { label_html?: string; width_px?: number | null; align_h?: CellAlignH | null; align_v?: CellAlignV | null };
    }) => {
      const { error } = await supabase.rpc('save_card_table_column', {
        p_column_id: columnId,
        p_patch: patch,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message || 'Could not save the column'),
  });

  const saveCell = useMutation({
    mutationFn: async ({
      cellId,
      patch,
    }: {
      cellId: string;
      patch: { content_html?: string; align_h?: CellAlignH | null; align_v?: CellAlignV | null };
    }) => {
      const { error } = await supabase.rpc('save_card_table_cell', {
        p_cell_id: cellId,
        p_patch: patch,
      });
      if (error) throw error;
    },
    // Content saves are debounced and frequent; only alignment changes need a
    // refetch, and the caller asks for it explicitly.
    onError: (e: Error) => toast.error(e.message || 'Could not save the cell'),
  });

  const saveMeta = useMutation({
    mutationFn: async (patch: { caption?: string; caption_suffix?: string | null }) => {
      const { error } = await supabase.rpc('save_card_table_meta', {
        p_card_id: cardId,
        p_patch: patch,
      });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the caption'),
  });

  return {
    ...(query.data ?? { table: null, columns: [], rows: [], cells: [] }),
    isLoading: query.isLoading,
    refetch: invalidate,
    addRow,
    deleteRow,
    addColumn,
    deleteColumn,
    saveColumn,
    saveCell,
    saveMeta,
  };
}
