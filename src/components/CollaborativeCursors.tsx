import { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import { CollaboratorCursor } from '@/hooks/useCollaborativeCursors';

interface CollaborativeCursorsProps {
  editor: Editor | null;
  collaborators: CollaboratorCursor[];
  containerRef: React.RefObject<HTMLDivElement>;
}

interface CursorOverlay {
  id: string;
  name: string;
  color: string;
  top: number;
  left: number;
  height: number;
  visible: boolean;
  selectionRects?: { top: number; left: number; width: number; height: number }[];
}

export function CollaborativeCursors({ editor, collaborators, containerRef }: CollaborativeCursorsProps) {
  const [cursors, setCursors] = useState<CursorOverlay[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!editor || !containerRef.current) return;

    const updateCursorPositions = () => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const newCursors: CursorOverlay[] = collaborators
        .filter(c => c.cursorPosition !== null || c.selectionRange !== null)
        .map(collaborator => {
          let top = 0;
          let left = 0;
          let height = 20;
          let visible = false;
          let selectionRects: { top: number; left: number; width: number; height: number }[] = [];

          try {
            // Get cursor position from document position
            if (collaborator.cursorPosition && typeof collaborator.cursorPosition.ch === 'number') {
              const pos = collaborator.cursorPosition.ch;
              if (pos >= 0 && pos <= editor.state.doc.content.size) {
                const coords = editor.view.coordsAtPos(pos);
                top = coords.top - containerRect.top;
                left = coords.left - containerRect.left;
                height = coords.bottom - coords.top;
                visible = true;
              }
            }

            // Get selection highlight if present
            if (collaborator.selectionRange) {
              const { from, to } = collaborator.selectionRange;
              if (from >= 0 && to <= editor.state.doc.content.size && from < to) {
                // Get all rectangles that make up the selection
                const fromCoords = editor.view.coordsAtPos(from);
                const toCoords = editor.view.coordsAtPos(to);
                
                // Simple single-line selection
                if (Math.abs(fromCoords.top - toCoords.top) < 5) {
                  selectionRects.push({
                    top: fromCoords.top - containerRect.top,
                    left: fromCoords.left - containerRect.left,
                    width: toCoords.left - fromCoords.left,
                    height: fromCoords.bottom - fromCoords.top,
                  });
                } else {
                  // Multi-line selection - simplified to just show start and end
                  selectionRects.push({
                    top: fromCoords.top - containerRect.top,
                    left: fromCoords.left - containerRect.left,
                    width: containerRect.width - (fromCoords.left - containerRect.left) - 50,
                    height: fromCoords.bottom - fromCoords.top,
                  });
                  selectionRects.push({
                    top: toCoords.top - containerRect.top,
                    left: 20,
                    width: toCoords.left - containerRect.left - 20,
                    height: toCoords.bottom - toCoords.top,
                  });
                }

                // Use selection end as cursor position
                top = toCoords.top - containerRect.top;
                left = toCoords.left - containerRect.left;
                height = toCoords.bottom - toCoords.top;
                visible = true;
              }
            }
          } catch (e) {
            // Position might be invalid, hide cursor
            visible = false;
          }

          return {
            id: collaborator.id,
            name: collaborator.name,
            color: collaborator.color,
            top,
            left,
            height,
            visible,
            selectionRects,
          };
        });

      setCursors(newCursors);
    };

    // Update on transaction (content/selection changes)
    const handleUpdate = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(updateCursorPositions);
    };

    // Initial update and subscribe to changes
    updateCursorPositions();
    editor.on('transaction', handleUpdate);

    // Also update when window scrolls or resizes
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      editor.off('transaction', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [editor, collaborators, containerRef]);

  // Re-render when collaborators change
  useEffect(() => {
    if (!editor) return;
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    // Trigger position update
    const updatePositions = () => {
      const newCursors: CursorOverlay[] = collaborators
        .filter(c => c.cursorPosition !== null || c.selectionRange !== null)
        .map(collaborator => {
          let top = 0;
          let left = 0;
          let height = 20;
          let visible = false;
          let selectionRects: { top: number; left: number; width: number; height: number }[] = [];

          try {
            if (collaborator.cursorPosition && typeof collaborator.cursorPosition.ch === 'number') {
              const pos = collaborator.cursorPosition.ch;
              if (pos >= 0 && pos <= editor.state.doc.content.size) {
                const coords = editor.view.coordsAtPos(pos);
                top = coords.top - containerRect.top;
                left = coords.left - containerRect.left;
                height = coords.bottom - coords.top;
                visible = true;
              }
            }

            if (collaborator.selectionRange) {
              const { from, to } = collaborator.selectionRange;
              if (from >= 0 && to <= editor.state.doc.content.size && from < to) {
                const toCoords = editor.view.coordsAtPos(to);
                top = toCoords.top - containerRect.top;
                left = toCoords.left - containerRect.left;
                height = toCoords.bottom - toCoords.top;
                visible = true;
              }
            }
          } catch (e) {
            visible = false;
          }

          return {
            id: collaborator.id,
            name: collaborator.name,
            color: collaborator.color,
            top,
            left,
            height,
            visible,
            selectionRects,
          };
        });

      setCursors(newCursors);
    };

    updatePositions();
  }, [collaborators, editor, containerRef]);

  return (
    <>
      {cursors.map(cursor => cursor.visible && (
        <div key={cursor.id}>
          {/* Selection highlight */}
          {cursor.selectionRects?.map((rect, i) => (
            <div
              key={`${cursor.id}-selection-${i}`}
              className="absolute pointer-events-none transition-all duration-75"
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                backgroundColor: cursor.color,
                opacity: 0.2,
              }}
            />
          ))}
          
          {/* Cursor line */}
          <div
            className="absolute pointer-events-none z-50 animate-pulse"
            style={{
              top: cursor.top,
              left: cursor.left,
              width: 2,
              height: cursor.height || 20,
              backgroundColor: cursor.color,
              transition: 'top 75ms, left 75ms',
            }}
          />
          
          {/* Name label */}
          <div
            className="absolute pointer-events-none z-50 px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap shadow-sm"
            style={{
              top: cursor.top - 18,
              left: cursor.left,
              backgroundColor: cursor.color,
              transition: 'top 75ms, left 75ms',
            }}
          >
            {cursor.name}
          </div>
        </div>
      ))}
    </>
  );
}
