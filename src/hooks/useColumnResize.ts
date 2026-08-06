import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/**
 * Hook for draggable column resizing in tables with persistence.
 * Column widths are saved to the database per proposal+table and restored on load.
 * Only users with canResize=true can drag to resize.
 */
export function useColumnResize(options: {
  proposalId?: string;
  tableKey: string;
  canResize?: boolean;
  resizeMode?: 'single' | 'adjacent';
  minWidth?: number;
  /** Per-column minimum widths (e.g. measured badge widths). Falls back to minWidth. */
  minWidths?: number[];
  /** Hard cap on the total table width (e.g. the 18cm text column in px). */
  maxTotalWidth?: number;
} = { tableKey: 'default' }) {
  const { proposalId, tableKey, canResize = false, minWidth = 40, minWidths, maxTotalWidth } = options;

  const [colWidths, setColWidths] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const resizingRef = useRef<{ index: number; startX: number; startWidths: number[] } | null>(null);

  // Load saved widths from DB
  useEffect(() => {
    if (!proposalId || !tableKey) return;
    
    const load = async () => {
      const { data } = await supabase
        .from('table_column_widths')
        .select('column_widths')
        .eq('proposal_id', proposalId)
        .eq('table_key', tableKey)
        .maybeSingle();
      
      if (data?.column_widths && Array.isArray(data.column_widths) && data.column_widths.length > 0) {
        setColWidths(data.column_widths as number[]);
      }
      setLoaded(true);
    };
    
    load();
  }, [proposalId, tableKey]);

  // Save widths to DB
  const saveWidths = useCallback(async (widths: number[]) => {
    if (!proposalId || !tableKey || widths.length === 0) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    
    await supabase
      .from('table_column_widths')
      .upsert({
        proposal_id: proposalId,
        table_key: tableKey,
        column_widths: widths as Json,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      }, { onConflict: 'proposal_id,table_key' });
  }, [proposalId, tableKey]);

  const handleColResizeStart = useCallback((index: number) => (e: React.MouseEvent) => {
    if (!canResize) return;
    e.preventDefault();
    e.stopPropagation();
    const measureFromDom = (): number[] => {
      const table = tableRef.current;
      if (!table) return [];
      // Prefer first tbody row (always has every column) over thead which may
      // contain colSpan headers that don't map 1:1 to columns.
      const bodyCells = table.querySelectorAll('tbody tr:first-child > td');
      if (bodyCells.length > 0) {
        return Array.from(bodyCells).map(cell => (cell as HTMLElement).offsetWidth);
      }
      const headerCells = table.querySelectorAll('thead th');
      return Array.from(headerCells).map(cell => (cell as HTMLElement).offsetWidth);
    };
    const measuredWidths = measureFromDom();
    const hasUsableSavedWidths = colWidths.length > 0
      && (measuredWidths.length === 0 || colWidths.length === measuredWidths.length)
      && colWidths.every((w) => Number.isFinite(w));
    const currentWidths = hasUsableSavedWidths ? [...colWidths] : measuredWidths;
    if (currentWidths[index] === undefined || Number.isNaN(currentWidths[index])) return;
    resizingRef.current = { index, startX: e.clientX, startWidths: currentWidths };

    const minOf = (i: number) => Math.max(minWidth, minWidths?.[i] ?? 0);

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const { index: colIdx, startX, startWidths } = resizingRef.current;
      const delta = ev.clientX - startX;
      const newWidths = [...startWidths];

      // Word-like semantics:
      // - internal border: only the two adjacent columns change; total width constant
      // - last column's right border: total table width changes (never wider than
      //   the available text column, i.e. 18cm)
      const isLast = colIdx >= startWidths.length - 1;
      if (!isLast && startWidths.length > 1) {
        const minDelta = minOf(colIdx) - startWidths[colIdx];
        const maxDelta = startWidths[colIdx + 1] - minOf(colIdx + 1);
        const clampedDelta = Math.min(Math.max(delta, minDelta), Math.max(minDelta, maxDelta));
        newWidths[colIdx] = startWidths[colIdx] + clampedDelta;
        newWidths[colIdx + 1] = startWidths[colIdx + 1] - clampedDelta;
      } else {
        const containerWidth = tableRef.current?.parentElement?.clientWidth ?? Infinity;
        const cap = Math.min(containerWidth, maxTotalWidth ?? Infinity);
        const total = startWidths.reduce((a, b) => a + b, 0);
        const minDelta = minOf(colIdx) - startWidths[colIdx];
        const maxDelta = cap - total;
        const clampedDelta = Math.min(Math.max(delta, minDelta), Math.max(0, maxDelta));
        newWidths[colIdx] = startWidths[colIdx] + clampedDelta;
      }

      setColWidths(newWidths);
    };


    const onMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // Save final widths
      setColWidths(prev => {
        saveWidths(prev);
        return prev;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [colWidths, canResize, saveWidths, minWidth]);

  return { colWidths, setColWidths, tableRef, handleColResizeStart, saveWidths, loaded };
}
