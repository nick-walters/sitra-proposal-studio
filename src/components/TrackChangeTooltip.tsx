import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, X } from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface TooltipState {
  changeId: string;
  type: 'insertion' | 'deletion';
  authorName: string;
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
    if (!containerRef.current) return;

    const changeId = el.getAttribute('data-change-id');
    if (!changeId) return;

    const isInsertion = el.hasAttribute('data-track-insertion');
    const type = isInsertion ? 'insertion' : 'deletion';

    // Read authorName from DOM attribute as primary source, fall back to storage
    let authorName = el.getAttribute('data-author-name') || '';
    if (!authorName && editor) {
      const storage = (editor.storage as any).trackChanges;
      const change = storage?.changes?.find((c: any) => c.id === changeId);
      if (change) authorName = change.authorName;
    }
    if (!authorName) authorName = 'Unknown';

    const rect = el.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    setTooltip({
      changeId,
      type,
      authorName,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 4,
    });
  }, [editor, containerRef]);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-track-insertion], [data-track-deletion]') as HTMLElement | null;
    if (target) {
      clearTimeout(hideTimeout.current);
      showTooltip(target);
    }
  }, [showTooltip]);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    // Don't hide if moving to the tooltip itself
    if (related && tooltipRef.current?.contains(related)) return;
    // Don't hide if moving to another tracked change
    if (related?.closest('[data-track-insertion], [data-track-deletion]')) return;

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
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);
    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
      clearTimeout(hideTimeout.current);
    };
  }, [containerRef, handleMouseOver, handleMouseOut]);

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
      className="absolute z-50 flex items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 shadow-md"
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
        transform: 'translate(-50%, -100%)',
      }}
      onMouseEnter={handleTooltipEnter}
      onMouseLeave={handleTooltipLeave}
    >
      <span className="text-[10px] text-muted-foreground mr-1 whitespace-nowrap">
        {tooltip.authorName} · {tooltip.type === 'insertion' ? 'inserted' : 'deleted'}
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
