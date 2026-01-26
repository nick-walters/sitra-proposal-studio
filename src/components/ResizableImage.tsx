import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useRef } from 'react';

function ResizableImageComponent({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, width, height, widthPercent, alignment } = node.attrs as { 
    src: string; 
    alt?: string; 
    width?: number | string; 
    height?: number | string;
    widthPercent?: number;
    alignment?: 'left' | 'center' | 'right';
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
      
      // When resizing with handles, switch to pixel mode
      updateAttributes({ 
        width: Math.round(newWidth), 
        height: Math.round(newHeight),
        widthPercent: null // Clear percentage when manually resizing
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

  // Use percentage width if set, otherwise use pixel dimensions
  const usePercentage = widthPercent && widthPercent > 0;
  const imgWidth = parseDimension(width);
  const imgHeight = parseDimension(height);

  // Determine wrapper alignment styles
  const getAlignmentStyles = () => {
    switch (alignment) {
      case 'left':
        return { justifyContent: 'flex-start' };
      case 'right':
        return { justifyContent: 'flex-end' };
      case 'center':
      default:
        return { justifyContent: 'center' };
    }
  };

  return (
    <NodeViewWrapper 
      className="resizable-image-wrapper w-full flex" 
      style={getAlignmentStyles()}
    >
      
      <div 
        className={`relative inline-block ${selected ? 'ring-2 ring-primary' : ''}`}
        style={{ 
          width: usePercentage ? `${widthPercent}%` : (imgWidth ? `${imgWidth}px` : 'auto'),
          height: usePercentage ? 'auto' : (imgHeight ? `${imgHeight}px` : 'auto'),
        }}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt || ''}
          className="max-w-full block"
          style={{ 
            width: '100%',
            height: 'auto',
          }}
          draggable={false}
        />
        
        {/* Resize handles - only show when selected and not using percentage */}
        {selected && !usePercentage && (
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
      widthPercent: {
        default: null,
      },
      alignment: {
        default: 'center',
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
    // Build inline styles for alignment and sizing
    const { widthPercent, width, height, alignment, ...rest } = HTMLAttributes;
    const styles: string[] = [];
    
    // Add alignment via display block + margin
    if (alignment === 'center') {
      styles.push('display: block', 'margin-left: auto', 'margin-right: auto');
    } else if (alignment === 'right') {
      styles.push('display: block', 'margin-left: auto', 'margin-right: 0');
    } else {
      styles.push('display: block', 'margin-left: 0', 'margin-right: auto');
    }
    
    // Add width/height
    if (widthPercent) {
      styles.push(`width: ${widthPercent}%`, 'height: auto');
    } else {
      if (width) styles.push(`width: ${width}px`);
      if (height) styles.push(`height: ${height}px`);
    }
    
    return ['img', mergeAttributes(rest, { style: styles.join('; ') })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

// Declare module augmentation for custom commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setImage: (options: { src: string; alt?: string; width?: number; height?: number; widthPercent?: number; alignment?: 'left' | 'center' | 'right' }) => ReturnType;
    };
  }
}
