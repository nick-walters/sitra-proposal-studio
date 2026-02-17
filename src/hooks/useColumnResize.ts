import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook for draggable column resizing in tables with persistence.
 * Column widths are saved to the database per proposal+table and restored on load.
 * Only users with canResize=true can drag to resize.
 */
export function useColumnResize(options: {
  proposalId?: string;
  tableKey: string;
  canResize?: boolean;
} = { tableKey: 'default' }) {
  const { proposalId, tableKey, canResize = false } = options;
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
        column_widths: widths as any,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      }, { onConflict: 'proposal_id,table_key' });
  }, [proposalId, tableKey]);

  const handleColResizeStart = useCallback((index: number) => (e: React.MouseEvent) => {
    if (!canResize) return;
    e.preventDefault();
    const currentWidths = colWidths.length > 0 ? [...colWidths] : (() => {
      const headerCells = tableRef.current?.querySelectorAll('thead th');
      return headerCells ? Array.from(headerCells).map(cell => (cell as HTMLElement).offsetWidth) : [];
    })();
    resizingRef.current = { index, startX: e.clientX, startWidths: currentWidths };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const { index: colIdx, startX, startWidths } = resizingRef.current;
      const delta = ev.clientX - startX;
      const newWidths = [...startWidths];
      const proposed = Math.max(40, startWidths[colIdx] + delta);
      const containerWidth = tableRef.current?.parentElement?.clientWidth ?? Infinity;
      const otherWidths = newWidths.reduce((sum, w, i) => i === colIdx ? sum : sum + w, 0);
      newWidths[colIdx] = Math.min(proposed, Math.max(40, containerWidth - otherWidths));
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
  }, [colWidths, canResize, saveWidths]);

  return { colWidths, tableRef, handleColResizeStart, loaded };
}
