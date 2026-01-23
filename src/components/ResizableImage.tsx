import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useRef } from 'react';

function ResizableImageComponent({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, width, height } = node.attrs as { 
    src: string; 
    alt?: string; 
    width?: number | string; 
    height?: number | string; 
  };
  const [isResizing, setIsResizing] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const startPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const img = imageRef.current;
    if (!img) return;

    setIsResizing(true);
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      width: img.offsetWidth,
      height: img.offsetHeight,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startPos.current.x;
      const deltaY = moveEvent.clientY - startPos.current.y;
      
      let newWidth = startPos.current.width;
      let newHeight = startPos.current.height;
      
      // Maintain aspect ratio
      const aspectRatio = startPos.current.width / startPos.current.height;
      
      if (corner.includes('e')) {
        newWidth = Math.max(50, startPos.current.width + deltaX);
        newHeight = newWidth / aspectRatio;
      }
      if (corner.includes('w')) {
        newWidth = Math.max(50, startPos.current.width - deltaX);
        newHeight = newWidth / aspectRatio;
      }
      if (corner.includes('s')) {
        newHeight = Math.max(50, startPos.current.height + deltaY);
        newWidth = newHeight * aspectRatio;
      }
      if (corner.includes('n')) {
        newHeight = Math.max(50, startPos.current.height - deltaY);
        newWidth = newHeight * aspectRatio;
      }
      
      updateAttributes({ 
        width: Math.round(newWidth), 
        height: Math.round(newHeight) 
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [updateAttributes]);

  const parseDimension = (value: number | string | undefined): number | undefined => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  };

  const imgWidth = parseDimension(width);
  const imgHeight = parseDimension(height);

  return (
    <NodeViewWrapper className="resizable-image-wrapper inline-block relative">
      <div 
        className={`relative inline-block ${selected ? 'ring-2 ring-primary' : ''}`}
        style={{ 
          width: imgWidth ? `${imgWidth}px` : 'auto',
          height: imgHeight ? `${imgHeight}px` : 'auto',
        }}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt || ''}
          className="max-w-full block"
          style={{ 
            width: imgWidth ? `${imgWidth}px` : 'auto',
            height: imgHeight ? `${imgHeight}px` : 'auto',
          }}
          draggable={false}
        />
        
        {/* Resize handles - only show when selected */}
        {selected && (
          <>
            {/* Corner handles */}
            <div
              className="absolute -top-1 -left-1 w-3 h-3 bg-primary border border-background cursor-nw-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 'nw')}
            />
            <div
              className="absolute -top-1 -right-1 w-3 h-3 bg-primary border border-background cursor-ne-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 'ne')}
            />
            <div
              className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary border border-background cursor-sw-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 'sw')}
            />
            <div
              className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary border border-background cursor-se-resize rounded-sm"
              onMouseDown={(e) => handleMouseDown(e, 'se')}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// Custom resizable image extension
export const ResizableImage = Node.create({
  name: 'image',
  
  group: 'block',
  
  atom: true,
  
  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      width: {
        default: null,
      },
      height: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

// Declare module augmentation for custom commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setImage: (options: { src: string; alt?: string; width?: number; height?: number }) => ReturnType;
    };
  }
}
