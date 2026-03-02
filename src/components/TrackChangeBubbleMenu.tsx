import { useCallback, useEffect, useRef, useState } from 'react';
import { type Editor, useEditorState } from '@tiptap/react';
import { Check, X } from 'lucide-react';
import { format } from 'date-fns';

interface MarkInfo {
  changeId: string;
  type: 'insertion' | 'deletion';
  authorName: string;
  timestamp: string | null;
}

interface TrackChangeBubbleMenuProps {
  editor: Editor;
}

function extractMarkInfo(el: HTMLElement, editor: Editor): MarkInfo | null {
  const changeId = el.getAttribute('data-change-id');
  if (!changeId) return null;

  const isInsertion = el.hasAttribute('data-track-insertion');
  const type: 'insertion' | 'deletion' = isInsertion ? 'insertion' : 'deletion';

  let authorName = el.getAttribute('data-author-name') || '';
  if (!authorName) {
    const storage = (editor.storage as any).trackChanges;
    const change = storage?.changes?.find((c: any) => c.id === changeId);
    if (change) authorName = change.authorName;
  }
  if (!authorName) authorName = 'Unknown';

  let timestamp: string | null = null;
  const rawTs = el.getAttribute('data-timestamp');
  if (rawTs) {
    try { timestamp = format(new Date(rawTs), 'MMM d, h:mm a'); } catch { /* skip */ }
  }

  return { changeId, type, authorName, timestamp };
}

export function TrackChangeBubbleMenu({ editor }: TrackChangeBubbleMenuProps) {
  const [hoverInfo, setHoverInfo] = useState<{ mark: MarkInfo; x: number; y: number } | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();
  const tooltipRef = useRef<HTMLDivElement>(null);

  // --- Cursor-based mark info (shows when cursor is inside a tracked change) ---
  const cursorMarkInfo = useEditorState({
    editor,
    selector: ({ editor: e }): MarkInfo | null => {
      if (!e) return null;
      const { $from } = e.state.selection;
      const mark = $from.marks().find(
        (m) => m.type.name === 'trackInsertion' || m.type.name === 'trackDeletion'
      );
      if (!mark) return null;
      const type: 'insertion' | 'deletion' =
        mark.type.name === 'trackInsertion' ? 'insertion' : 'deletion';
      let timestamp: string | null = null;
      if (mark.attrs.timestamp) {
        try { timestamp = format(new Date(mark.attrs.timestamp), 'MMM d, h:mm a'); } catch { /* skip */ }
      }
      return {
        changeId: mark.attrs.changeId as string,
        type,
        authorName: mark.attrs.authorName || 'Unknown',
        timestamp,
      };
    },
  });

  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!cursorMarkInfo) { setCursorCoords(null); return; }
    try {
      const c = editor.view.coordsAtPos(editor.state.selection.from);
      setCursorCoords({ x: c.left, y: c.top });
    } catch { setCursorCoords(null); }
  }, [cursorMarkInfo, editor]);

  // --- Hover-based detection via pointer hit-testing (robust across nested editor DOM) ---
  useEffect(() => {
    const editorDom = editor.view.dom as HTMLElement;

    const updateHoverFromPoint = (clientX: number, clientY: number) => {
      const pointed = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      if (!pointed) return;

      // Keep tooltip visible while moving onto the tooltip itself
      if (tooltipRef.current?.contains(pointed)) {
        clearTimeout(hideTimeout.current);
        return;
      }

      const el = pointed.closest('[data-track-insertion], [data-track-deletion]') as HTMLElement | null;
      if (!el || !editorDom.contains(el)) {
        hideTimeout.current = setTimeout(() => setHoverInfo(null), 120);
        return;
      }

      clearTimeout(hideTimeout.current);
      const info = extractMarkInfo(el, editor);
      if (!info) return;

      const rect = el.getBoundingClientRect();
      setHoverInfo((prev) => {
        if (
          prev &&
          prev.mark.changeId === info.changeId &&
          Math.abs(prev.x - (rect.left + rect.width / 2)) < 1 &&
          Math.abs(prev.y - rect.top) < 1
        ) {
          return prev;
        }
        return { mark: info, x: rect.left + rect.width / 2, y: rect.top };
      });
    };

    const onPointerMove = (e: PointerEvent) => {
      updateHoverFromPoint(e.clientX, e.clientY);
    };

    document.addEventListener('pointermove', onPointerMove, true);
    return () => {
      document.removeEventListener('pointermove', onPointerMove, true);
      clearTimeout(hideTimeout.current);
    };
  }, [editor]);

  const handleTooltipEnter = useCallback(() => clearTimeout(hideTimeout.current), []);
  const handleTooltipLeave = useCallback(() => {
    hideTimeout.current = setTimeout(() => setHoverInfo(null), 200);
  }, []);

  // Determine which info to show: hover takes priority, then cursor
  const active = hoverInfo
    ? { mark: hoverInfo.mark, x: hoverInfo.x, y: hoverInfo.y }
    : cursorMarkInfo && cursorCoords
      ? { mark: cursorMarkInfo, x: cursorCoords.x, y: cursorCoords.y }
      : null;

  const handleAccept = useCallback(() => {
    if (!active) return;
    editor.commands.acceptChange(active.mark.changeId);
    setHoverInfo(null);
  }, [editor, active]);

  const handleReject = useCallback(() => {
    if (!active) return;
    editor.commands.rejectChange(active.mark.changeId);
    setHoverInfo(null);
  }, [editor, active]);

  if (!active) return null;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[9999] flex items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 shadow-md pointer-events-auto"
      style={{
        left: `${active.x}px`,
        top: `${active.y}px`,
        transform: 'translate(-50%, -100%) translateY(-4px)',
      }}
      onMouseEnter={handleTooltipEnter}
      onMouseLeave={handleTooltipLeave}
    >
      <span className="text-[10px] text-muted-foreground mr-1 whitespace-nowrap">
        {active.mark.authorName} · {active.mark.type === 'insertion' ? 'inserted' : 'deleted'}
        {active.mark.timestamp && (
          <span className="ml-1 opacity-70">· {active.mark.timestamp}</span>
        )}
      </span>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleAccept}
        className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 cursor-pointer"
        title="Accept change"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleReject}
        className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 cursor-pointer"
        title="Reject change"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
