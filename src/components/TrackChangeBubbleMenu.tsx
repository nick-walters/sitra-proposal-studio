import { useCallback, useEffect, useRef, useState } from 'react';
import { type Editor, useEditorState } from '@tiptap/react';
import { Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useProposalUserColors } from '@/hooks/useProposalUserColors';

interface MarkInfo {
  changeId: string;
  type: 'insertion' | 'deletion';
  authorId: string;
  authorName: string;
  timestamp: string | null;
}

interface TrackChangeBubbleMenuProps {
  editor: Editor;
  proposalId?: string;
}

// Cache for profile name lookups (authorId -> full_name)
const profileNameCache = new Map<string, string>();

async function resolveAuthorName(authorId: string, fallback: string): Promise<string> {
  if (!authorId || authorId === 'ai-assistant') return fallback || 'Unknown';
  if (profileNameCache.has(authorId)) return profileNameCache.get(authorId)!;

  try {
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', authorId)
      .single();
    const name = data?.full_name || fallback || 'Unknown';
    profileNameCache.set(authorId, name);
    return name;
  } catch {
    profileNameCache.set(authorId, fallback || 'Unknown');
    return fallback || 'Unknown';
  }
}

export function TrackChangeBubbleMenu({ editor, proposalId }: TrackChangeBubbleMenuProps) {
  const { getUserColor } = useProposalUserColors(proposalId);
  const [hoverInfo, setHoverInfo] = useState<{ mark: MarkInfo; x: number; y: number } | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Resolved display name (from profile DB lookup)
  const [displayName, setDisplayName] = useState<string | null>(null);

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
        try {
          const d = new Date(mark.attrs.timestamp);
          timestamp = format(d, 'dd.MM.yyyy, HH:mm');
        } catch { /* skip */ }
      }
      return {
        changeId: mark.attrs.changeId as string,
        type,
        authorId: mark.attrs.authorId || '',
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

  // --- Hover-based detection via editor coordinates (robust on desktop hover) ---
  useEffect(() => {
    const editorDom = editor.view.dom as HTMLElement;

    const getMarkInfoAtCoords = (clientX: number, clientY: number): { mark: MarkInfo; x: number; y: number } | null => {
      const pos = editor.view.posAtCoords({ left: clientX, top: clientY });
      if (!pos) return null;

      const $pos = editor.state.doc.resolve(pos.pos);
      const markCandidates = [
        ...$pos.marks(),
        ...($pos.nodeBefore?.marks ?? []),
        ...($pos.nodeAfter?.marks ?? []),
      ];

      const trackMark = markCandidates.find(
        (m) => m.type.name === 'trackInsertion' || m.type.name === 'trackDeletion'
      );
      if (!trackMark) return null;

      const type: 'insertion' | 'deletion' =
        trackMark.type.name === 'trackInsertion' ? 'insertion' : 'deletion';
      let timestamp: string | null = null;
      if (trackMark.attrs.timestamp) {
        try {
          const d = new Date(trackMark.attrs.timestamp);
          timestamp = format(d, 'dd.MM.yyyy, HH:mm');
        } catch { /* skip */ }
      }

      const markInfo: MarkInfo = {
        changeId: trackMark.attrs.changeId as string,
        type,
        authorId: trackMark.attrs.authorId || '',
        authorName: trackMark.attrs.authorName || 'Unknown',
        timestamp,
      };

      try {
        const c = editor.view.coordsAtPos(pos.pos);
        return { mark: markInfo, x: c.left, y: c.top };
      } catch {
        return { mark: markInfo, x: clientX, y: clientY };
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (tooltipRef.current?.contains(target)) {
        clearTimeout(hideTimeout.current);
        return;
      }

      if (!editorDom.contains(target)) {
        hideTimeout.current = setTimeout(() => setHoverInfo(null), 120);
        return;
      }

      const found = getMarkInfoAtCoords(e.clientX, e.clientY);
      if (!found) {
        hideTimeout.current = setTimeout(() => setHoverInfo(null), 120);
        return;
      }

      clearTimeout(hideTimeout.current);
      setHoverInfo((prev) => {
        if (
          prev &&
          prev.mark.changeId === found.mark.changeId &&
          Math.abs(prev.x - found.x) < 1 &&
          Math.abs(prev.y - found.y) < 1
        ) {
          return prev;
        }
        return found;
      });
    };

    document.addEventListener('mousemove', onMouseMove, true);
    return () => {
      document.removeEventListener('mousemove', onMouseMove, true);
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

  // Resolve author display name from profile whenever active mark changes
  useEffect(() => {
    if (!active) { setDisplayName(null); return; }
    const { authorId, authorName } = active.mark;
    // If already cached, use sync
    if (authorId && profileNameCache.has(authorId)) {
      setDisplayName(profileNameCache.get(authorId)!);
      return;
    }
    // Async resolve
    let cancelled = false;
    resolveAuthorName(authorId, authorName).then((name) => {
      if (!cancelled) setDisplayName(name);
    });
    return () => { cancelled = true; };
  }, [active?.mark.changeId, active?.mark.authorId]);

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

  const shownName = displayName || active.mark.authorName;

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
      <span className="text-[10px] text-muted-foreground mr-1 whitespace-nowrap flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full inline-block shrink-0"
          style={{ backgroundColor: getUserColor(active.mark.authorId) }}
        />
        {shownName} · {active.mark.type === 'insertion' ? 'inserted' : 'deleted'}
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
