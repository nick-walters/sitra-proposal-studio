import { useCallback, useEffect, useState } from 'react';
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

export function TrackChangeBubbleMenu({ editor }: TrackChangeBubbleMenuProps) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  // Reactively extract mark info from editor state via useEditorState
  const markInfo = useEditorState({
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
      const authorName = mark.attrs.authorName || 'Unknown';
      const changeId = mark.attrs.changeId as string;
      let timestamp: string | null = null;
      if (mark.attrs.timestamp) {
        try {
          timestamp = format(new Date(mark.attrs.timestamp), 'MMM d, h:mm a');
        } catch {
          timestamp = null;
        }
      }
      return { changeId, type, authorName, timestamp };
    },
  });

  // Update position whenever markInfo changes
  useEffect(() => {
    if (!markInfo) {
      setCoords(null);
      return;
    }
    try {
      const { from } = editor.state.selection;
      const c = editor.view.coordsAtPos(from);
      setCoords({ x: c.left, y: c.top });
    } catch {
      setCoords(null);
    }
  }, [markInfo, editor]);

  // Also reposition on scroll
  useEffect(() => {
    if (!markInfo) return;
    const reposition = () => {
      try {
        const { from } = editor.state.selection;
        const c = editor.view.coordsAtPos(from);
        setCoords({ x: c.left, y: c.top });
      } catch {
        setCoords(null);
      }
    };
    const scrollEl = editor.view.dom.closest('.overflow-y-auto, .overflow-auto') || window;
    scrollEl.addEventListener('scroll', reposition, { passive: true });
    return () => scrollEl.removeEventListener('scroll', reposition);
  }, [markInfo, editor]);

  const handleAccept = useCallback(() => {
    if (!markInfo) return;
    editor.commands.acceptChange(markInfo.changeId);
  }, [editor, markInfo]);

  const handleReject = useCallback(() => {
    if (!markInfo) return;
    editor.commands.rejectChange(markInfo.changeId);
  }, [editor, markInfo]);

  if (!markInfo || !coords) return null;

  return (
    <div
      className="fixed z-[9999] flex items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 shadow-md pointer-events-auto"
      style={{
        left: `${coords.x}px`,
        top: `${coords.y}px`,
        transform: 'translate(-50%, -100%) translateY(-4px)',
      }}
    >
      <span className="text-[10px] text-muted-foreground mr-1 whitespace-nowrap">
        {markInfo.authorName} · {markInfo.type === 'insertion' ? 'inserted' : 'deleted'}
        {markInfo.timestamp && (
          <span className="ml-1 opacity-70">· {markInfo.timestamp}</span>
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
