import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, X } from 'lucide-react';
import type { Editor } from '@tiptap/react';

import { format } from 'date-fns';

interface TooltipState {
  changeId: string;
  type: 'insertion' | 'deletion';
  authorName: string;
  timestamp: string | null;
  x: number;
  y: number;
}

interface TrackChangeTooltipProps {
  editor: Editor | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function TrackChangeTooltip({ editor, containerRef }: TrackChangeTooltipProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();
  const tooltipRef = useRef<HTMLDivElement>(null);

  const showTooltip = useCallback((el: HTMLElement) => {

    const changeId = el.getAttribute('data-change-id');
    if (!changeId) return;

    const isInsertion = el.hasAttribute('data-track-insertion');
    const type = isInsertion ? 'insertion' : 'deletion';

    // Read authorName and timestamp from DOM attributes
    let authorName = el.getAttribute('data-author-name') || '';
    if (!authorName && editor) {
      const storage = (editor.storage as any).trackChanges;
      const change = storage?.changes?.find((c: any) => c.id === changeId);
      if (change) authorName = change.authorName;
    }
    if (!authorName) authorName = 'Unknown';

    const rawTimestamp = el.getAttribute('data-timestamp');
    let timestamp: string | null = null;
    if (rawTimestamp) {
      try {
        timestamp = format(new Date(rawTimestamp), 'MMM d, h:mm a');
      } catch { timestamp = null; }
    }

    const rect = el.getBoundingClientRect();

    setTooltip({
      changeId,
      type,
      authorName,
      timestamp,
      x: rect.left + rect.width / 2,
      y: rect.top - 4,
    });
  }, [editor, containerRef]);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    // Normalize text nodes to their parent element so .closest() works
    let node = e.target as Node;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement!;
    if (!node || !(node as HTMLElement).closest) return;
    const target = (node as HTMLElement).closest('[data-track-insertion], [data-track-deletion]') as HTMLElement | null;
    if (target) {
      clearTimeout(hideTimeout.current);
      showTooltip(target);
    }
  }, [showTooltip]);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    let related = e.relatedTarget as Node | null;
    // Normalize text nodes
    if (related && related.nodeType === Node.TEXT_NODE) related = related.parentElement;
    const relatedEl = related as HTMLElement | null;
    // Don't hide if moving to the tooltip itself
    if (relatedEl && tooltipRef.current?.contains(relatedEl)) return;
    // Don't hide if moving to another tracked change
    if (relatedEl?.closest?.('[data-track-insertion], [data-track-deletion]')) return;

    hideTimeout.current = setTimeout(() => setTooltip(null), 150);
  }, []);

  // Keep tooltip visible when hovering over it
  const handleTooltipEnter = useCallback(() => {
    clearTimeout(hideTimeout.current);
  }, []);

  const handleTooltipLeave = useCallback(() => {
    hideTimeout.current = setTimeout(() => setTooltip(null), 150);
  }, []);

  useEffect(() => {
    // Use document-level listeners filtering by data-track-* attributes.
    // We avoid containerRef.current?.contains() because the ref may be null
    // during conditional rendering (loading states) causing silent early exits.
    const onOver = (e: MouseEvent) => {
      let target = e.target as Node;
      if (target.nodeType === Node.TEXT_NODE) target = target.parentElement!;
      if (!target) return;
      const el = target as HTMLElement;
      // Only process if inside the containerRef (when available) or inside any .tiptap element
      if (containerRef.current && !containerRef.current.contains(el)) return;
      if (!containerRef.current && !el.closest('.tiptap, .ProseMirror')) return;
      handleMouseOver(e);
    };
    const onOut = (e: MouseEvent) => {
      let target = e.target as Node;
      if (target.nodeType === Node.TEXT_NODE) target = target.parentElement!;
      if (!target) return;
      handleMouseOut(e);
    };

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    return () => {
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      clearTimeout(hideTimeout.current);
    };
  }, [handleMouseOver, handleMouseOut, containerRef]);

  const handleAccept = useCallback(() => {
    if (!editor || !tooltip) return;
    editor.commands.acceptChange(tooltip.changeId);
    setTooltip(null);
  }, [editor, tooltip]);

  const handleReject = useCallback(() => {
    if (!editor || !tooltip) return;
    editor.commands.rejectChange(tooltip.changeId);
    setTooltip(null);
  }, [editor, tooltip]);

  if (!tooltip) return null;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[9999] flex items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 shadow-md pointer-events-auto"
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
        transform: 'translate(-50%, -100%)',
      }}
      onMouseEnter={handleTooltipEnter}
      onMouseLeave={handleTooltipLeave}
    >
      <span className="text-[10px] text-muted-foreground mr-1 whitespace-nowrap flex items-center gap-1">
        <span
          className="w-2 h-2 rounded-full inline-block shrink-0"
          style={{ backgroundColor: (() => {
            // Read author color from the DOM element's data attribute
            const container = containerRef.current;
            if (!container) return '#3B82F6';
            const el = container.querySelector(`[data-change-id="${tooltip.changeId}"]`) as HTMLElement | null;
            return el?.getAttribute('data-author-color') || '#3B82F6';
          })() }}
        />
        {tooltip.authorName} · {tooltip.type === 'insertion' ? 'inserted' : 'deleted'}
        {tooltip.timestamp && <span className="ml-1 opacity-70">· {tooltip.timestamp}</span>}
      </span>
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={handleAccept}
        className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 cursor-pointer"
        title="Accept change"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={handleReject}
        className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 cursor-pointer"
        title="Reject change"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
