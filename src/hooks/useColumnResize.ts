import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook for draggable column resizing in tables.
 * Returns column widths state, a table ref, and a handler factory for resize start.
 * When colWidths is non-empty, set table-layout: fixed and apply widths to <th> elements.
 */
export function useColumnResize(deps: any[] = []) {
  const [colWidths, setColWidths] = useState<number[]>([]);
  const tableRef = useRef<HTMLTableElement>(null);
  const resizingRef = useRef<{ index: number; startX: number; startWidths: number[] } | null>(null);

  // Initialize column widths from actual rendered widths
  useEffect(() => {
    if (colWidths.length === 0 && tableRef.current) {
      const headerCells = tableRef.current.querySelectorAll('thead th');
      if (headerCells.length > 0) {
        const widths = Array.from(headerCells).map(cell => (cell as HTMLElement).offsetWidth);
        setColWidths(widths);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colWidths.length, ...deps]);

  const handleColResizeStart = useCallback((index: number) => (e: React.MouseEvent) => {
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
      // Clamp so total widths don't exceed the table's container
      const containerWidth = tableRef.current?.parentElement?.clientWidth ?? Infinity;
      const otherWidths = newWidths.reduce((sum, w, i) => i === colIdx ? sum : sum + w, 0);
      newWidths[colIdx] = Math.min(proposed, Math.max(40, containerWidth - otherWidths));
      setColWidths(newWidths);
    };

    const onMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [colWidths]);

  return { colWidths, tableRef, handleColResizeStart };
}
