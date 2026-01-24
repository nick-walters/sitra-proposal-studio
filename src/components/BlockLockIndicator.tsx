import { useEffect, useState, useCallback, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { BlockLock } from '@/hooks/useBlockLocking';
import { Lock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface BlockLockIndicatorProps {
  editor: Editor | null;
  blockLocks: Map<string, BlockLock>;
  containerRef: React.RefObject<HTMLDivElement>;
}

interface LockPosition {
  lock: BlockLock;
  top: number;
  height: number;
}

export function BlockLockIndicator({ editor, blockLocks, containerRef }: BlockLockIndicatorProps) {
  const [lockPositions, setLockPositions] = useState<LockPosition[]>([]);
  const rafRef = useRef<number>();

  const updatePositions = useCallback(() => {
    if (!editor || !containerRef.current || blockLocks.size === 0) {
      setLockPositions([]);
      return;
    }

    const positions: LockPosition[] = [];
    const containerRect = containerRef.current.getBoundingClientRect();

    blockLocks.forEach((lock) => {
      // Parse the block ID to get the start position
      const [startPosStr] = lock.blockId.split('-');
      const startPos = parseInt(startPosStr, 10);

      if (isNaN(startPos)) return;

      try {
        // Get the DOM coordinates for this position
        const coords = editor.view.coordsAtPos(startPos);
        if (!coords) return;

        // Find the end of this block
        const $pos = editor.state.doc.resolve(startPos);
        let depth = $pos.depth;
        while (depth > 1) depth--;
        
        if (depth < 1) return;
        
        const node = $pos.node(depth);
        const endPos = startPos + node.nodeSize;
        const endCoords = editor.view.coordsAtPos(Math.min(endPos, editor.state.doc.content.size));

        const top = coords.top - containerRect.top;
        const height = Math.max((endCoords?.bottom || coords.bottom) - coords.top, 24);

        positions.push({
          lock,
          top,
          height,
        });
      } catch {
        // Position may be invalid, skip
      }
    });

    setLockPositions(positions);
  }, [editor, blockLocks, containerRef]);

  // Update positions on editor changes and scroll
  useEffect(() => {
    if (!editor) return;

    const scheduleUpdate = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePositions);
    };

    // Listen to editor updates
    editor.on('update', scheduleUpdate);
    editor.on('selectionUpdate', scheduleUpdate);

    // Listen to scroll events
    const container = containerRef.current?.closest('.overflow-auto');
    container?.addEventListener('scroll', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);

    // Initial update
    scheduleUpdate();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      editor.off('update', scheduleUpdate);
      editor.off('selectionUpdate', scheduleUpdate);
      container?.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [editor, updatePositions, containerRef]);

  // Also update when locks change
  useEffect(() => {
    updatePositions();
  }, [blockLocks, updatePositions]);

  if (lockPositions.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {lockPositions.map(({ lock, top, height }) => (
        <div
          key={lock.blockId}
          className="absolute left-0 right-0 pointer-events-auto"
          style={{
            top: `${top}px`,
            height: `${height}px`,
          }}
        >
          {/* Left border indicator */}
          <div
            className="absolute left-0 w-1 h-full rounded-r animate-pulse"
            style={{ backgroundColor: lock.userColor }}
          />
          
          {/* Lock icon with tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center cursor-default shadow-sm"
                style={{ backgroundColor: lock.userColor }}
              >
                <Lock className="w-3 h-3 text-white" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              <span className="font-medium">{lock.userName}</span> is editing this {lock.blockType}
            </TooltipContent>
          </Tooltip>

          {/* Semi-transparent overlay */}
          <div
            className="absolute inset-0 rounded opacity-10"
            style={{ backgroundColor: lock.userColor }}
          />
        </div>
      ))}
    </div>
  );
}
