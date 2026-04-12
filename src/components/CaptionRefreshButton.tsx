import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { updateCaptionForTableAtCursor, renumberCaptionsInEditor } from '@/lib/renumberCaptionsInEditor';

interface Props {
  editor: Editor | null;
  containerRef: React.RefObject<HTMLDivElement>;
  sectionNumber?: string;
  tableOffset?: number;
}

/**
 * Shows a small refresh icon in the right margin when the cursor is inside
 * a table-caption or figure-caption paragraph. Clicking it renumbers the caption.
 */
export function CaptionRefreshButton({ editor, containerRef, sectionNumber, tableOffset = 0 }: Props) {
  const [visible, setVisible] = useState(false);
  const [top, setTop] = useState(0);
  const rafRef = useRef(0);
  const isFigureRef = useRef(false);

  const update = useCallback(() => {
    if (!editor || !containerRef.current) {
      setVisible(false);
      return;
    }

    const { $from } = editor.state.selection;
    // Walk up to find paragraph
    let paragraphNode: any = null;
    let paragraphDepth = -1;
    for (let d = $from.depth; d >= 0; d--) {
      const n = $from.node(d);
      if (n.type.name === 'paragraph') {
        paragraphNode = n;
        paragraphDepth = d;
        break;
      }
    }

    if (!paragraphNode || paragraphDepth < 0) {
      setVisible(false);
      return;
    }

    const cls = (paragraphNode.attrs?.class || '') as string;
    const isCaption = cls.includes('table-caption') || cls.includes('figure-caption');
    if (!isCaption) {
      setVisible(false);
      return;
    }

    isFigureRef.current = cls.includes('figure-caption');

    // Get the DOM element for positioning
    const pos = $from.before(paragraphDepth);
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) {
      setVisible(false);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const domRect = dom.getBoundingClientRect();
    setTop(domRect.top - containerRect.top + domRect.height / 2 - 8);
    setVisible(true);
  }, [editor, containerRef]);

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };
    editor.on('selectionUpdate', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('selectionUpdate', handler);
      editor.off('transaction', handler);
      cancelAnimationFrame(rafRef.current);
    };
  }, [editor, update]);

  const handleClick = useCallback(() => {
    if (!editor || !sectionNumber) return;

    if (isFigureRef.current) {
      // For figures, just renumber all captions
      renumberCaptionsInEditor(editor, sectionNumber, tableOffset);
    } else {
      // For tables, use the per-table updater then renumber all
      updateCaptionForTableAtCursor(editor, sectionNumber, tableOffset);
      renumberCaptionsInEditor(editor, sectionNumber, tableOffset);
    }
  }, [editor, sectionNumber, tableOffset]);

  if (!visible) return null;

  return (
    <button
      type="button"
      title="Refresh caption number"
      className="absolute z-10 p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
      style={{
        right: '-28px',
        top: `${top}px`,
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleClick();
      }}
    >
      <RefreshCw className="h-3.5 w-3.5" />
    </button>
  );
}