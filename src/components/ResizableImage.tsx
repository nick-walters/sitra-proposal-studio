import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useRef } from 'react';
import { useStorageUrl } from '@/hooks/useStorageUrl';
import { FIGURE_COLUMN_WIDTH_CM } from '@/lib/figureSizePresets';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';


export type ImageFloat = 'none' | 'left' | 'right';

/**
 * True when the image is sized by a figure size preset (cm bounding box).
 * Such images are "contained" at their preset size and must not be turned
 * into free pixel-sized images by drag handles or the px/% toolbar inputs.
 */
export function isBoundingBoxAttrs(attrs: Record<string, any> | null | undefined): boolean {
  if (!attrs) return false;
  const w = attrs.maxWidthCm;
  const h = attrs.maxHeightCm;
  return (typeof w === 'number' && w > 0) || (typeof h === 'number' && h > 0);
}

/**
 * Float is only meaningful for NARROW figures (bounding-box width set and
 * smaller than the 18cm text column). Full-width / unsized figures always
 * render as centred blocks, whatever the stored attribute says.
 */
export function resolveImageFloat(
  float: unknown,
  maxWidthCm: number | null | undefined,
): Exclude<ImageFloat, 'none'> | null {
  if (float !== 'left' && float !== 'right') return null;
  const narrow =
    typeof maxWidthCm === 'number' &&
    maxWidthCm > 0 &&
    maxWidthCm < FIGURE_COLUMN_WIDTH_CM;
  return narrow ? float : null;
}

function ResizableImageComponent({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const { src: rawSrc, alt, width, height, widthPercent, alignment, maxWidthCm, maxHeightCm, float } = node.attrs as {
    src: string;
    alt?: string;
    width?: number | string;
    height?: number | string;
    widthPercent?: number;
    alignment?: 'left' | 'center' | 'right';
    maxWidthCm?: number | null;
    maxHeightCm?: number | null;
    float?: ImageFloat;
  };
  const activeFloat = resolveImageFloat(float, maxWidthCm);
  const src = useStorageUrl(rawSrc) || rawSrc;
  const [, setIsResizing] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const startPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Bounding-box (figure size preset) images are sized by the figure size
    // picker, never by free dragging — dragging would convert them to pixel
    // mode and silently discard maxWidthCm/maxHeightCm.
    if (isBoundingBoxAttrs(node.attrs)) return;

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
      
      // When resizing with handles, always switch to pixel mode
      updateAttributes({ 
        width: Math.round(newWidth), 
        height: Math.round(newHeight),
        widthPercent: 0 // Use 0 (not null) to explicitly clear percentage mode
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [updateAttributes, node.attrs]);

  const parseDimension = (value: number | string | undefined): number | undefined => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  };

  // Bounding-box (contain) mode: figure sizing preset assigned on the
  // figure record. The image scales inside a max-width/max-height box
  // preserving aspect ratio — no crop, no stretch, no letterbox padding
  // (the img itself takes the fitted dimensions).
  const hasBoundingBox =
    (typeof maxWidthCm === 'number' && maxWidthCm > 0) ||
    (typeof maxHeightCm === 'number' && maxHeightCm > 0);

  // Use percentage width if set and positive, otherwise use pixel dimensions
  const usePercentage = !hasBoundingBox && typeof widthPercent === 'number' && widthPercent > 0;
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

  const boxStyle: React.CSSProperties = hasBoundingBox
    ? { display: 'inline-block' }
    : {
        width: usePercentage ? `${widthPercent}%` : (imgWidth ? `${imgWidth}px` : 'auto'),
        height: usePercentage ? 'auto' : (imgHeight ? `${imgHeight}px` : 'auto'),
      };

  const imgStyle: React.CSSProperties = hasBoundingBox
    ? {
        maxWidth: typeof maxWidthCm === 'number' && maxWidthCm > 0 ? `${maxWidthCm}cm` : 'none',
        maxHeight: typeof maxHeightCm === 'number' && maxHeightCm > 0 ? `${maxHeightCm}cm` : 'none',
        width: 'auto',
        height: 'auto',
        display: 'block',
      }
    : { width: '100%', height: 'auto' };

  const floatWrapperStyle: React.CSSProperties | null = activeFloat
    ? {
        float: activeFloat,
        display: 'block',
        width: `${maxWidthCm}cm`,
        maxWidth: '100%',
        margin:
          activeFloat === 'left'
            ? '0 1em 0.3em 0'
            : '0 0 0.3em 1em',
        textAlign: 'left',
      }
    : null;

  return (
    <NodeViewWrapper
      className={
        activeFloat
          ? 'resizable-image-wrapper is-floated'
          : 'resizable-image-wrapper w-full flex'
      }
      data-float={activeFloat || 'none'}
      style={floatWrapperStyle || getAlignmentStyles()}
    >

      <div
        className={`relative inline-block ${selected ? 'ring-2 ring-primary' : ''}`}
        style={boxStyle}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt || ''}
          className="max-w-full block"
          style={imgStyle}
          draggable={false}
        />

        
        {/* Resize handles — only for free-size images. Figures with a cm
            bounding box are sized via the figure size picker. */}
        {selected && !hasBoundingBox && (
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
      src: { default: null },
      alt: { default: null },
      width: {
        default: null,
        parseHTML: (element) => {
          const style = element.getAttribute('style') || '';
          const match = style.match(/width:\s*(\d+)px/);
          return match ? parseInt(match[1], 10) : element.getAttribute('width') ? parseInt(element.getAttribute('width')!, 10) : null;
        },
        renderHTML: () => ({}),
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const style = element.getAttribute('style') || '';
          const match = style.match(/height:\s*(\d+)px/);
          return match ? parseInt(match[1], 10) : element.getAttribute('height') ? parseInt(element.getAttribute('height')!, 10) : null;
        },
        renderHTML: () => ({}),
      },
      widthPercent: {
        default: 0,
        parseHTML: (element) => {
          const style = element.getAttribute('style') || '';
          const match = style.match(/width:\s*(\d+)%/);
          return match ? parseInt(match[1], 10) : 0;
        },
        renderHTML: () => ({}),
      },
      alignment: {
        default: 'center',
        parseHTML: (element) => {
          const style = element.getAttribute('style') || '';
          if (style.includes('margin-right: 0') || style.includes('margin-right:0')) return 'right';
          if (style.includes('margin-left: 0') || style.includes('margin-left:0')) return 'left';
          return 'center';
        },
        renderHTML: () => ({}),
      },
      // Figure size preset — bounding box in cm. When either is > 0 the
      // image renders with max-width / max-height (contain: aspect kept,
      // image fits inside, no crop or stretch). Overrides widthPercent.
      maxWidthCm: {
        default: null,
        parseHTML: (element) => {
          const style = element.getAttribute('style') || '';
          const m = style.match(/max-width:\s*([\d.]+)cm/);
          return m ? parseFloat(m[1]) : null;
        },
        renderHTML: () => ({}),
      },
      maxHeightCm: {
        default: null,
        parseHTML: (element) => {
          const style = element.getAttribute('style') || '';
          const m = style.match(/max-height:\s*([\d.]+)cm/);
          return m ? parseFloat(m[1]) : null;
        },
        renderHTML: () => ({}),
      },
      // Text-wrap float for NARROW figures ('none' | 'left' | 'right').
      // Round-trips via the inline style (float: left/right).
      float: {
        default: 'none',
        parseHTML: (element) => {
          const style = element.getAttribute('style') || '';
          const m = style.match(/(?:^|[;\s])float:\s*(left|right)/);
          if (m) return m[1];
          const attr = element.getAttribute('data-float');
          return attr === 'left' || attr === 'right' ? attr : 'none';
        },
        renderHTML: () => ({}),
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

  renderHTML({ node }) {
    const { widthPercent, width, height, alignment, src, alt, maxWidthCm, maxHeightCm, float } = node.attrs;
    const styles: string[] = [];
    const activeFloat = resolveImageFloat(float, maxWidthCm);

    if (activeFloat) {
      // Floated narrow figure: text wraps on the open side.
      styles.push(
        'display: block',
        `float: ${activeFloat}`,
        activeFloat === 'left'
          ? 'margin: 0 1em 0.3em 0'
          : 'margin: 0 0 0.3em 1em',
      );
    } else if (alignment === 'center') {
      styles.push('display: block', 'margin-left: auto', 'margin-right: auto');
    } else if (alignment === 'right') {
      styles.push('display: block', 'margin-left: auto', 'margin-right: 0');
    } else {
      styles.push('display: block', 'margin-left: 0', 'margin-right: auto');
    }

    const hasBoundingBox =
      (typeof maxWidthCm === 'number' && maxWidthCm > 0) ||
      (typeof maxHeightCm === 'number' && maxHeightCm > 0);

    if (hasBoundingBox) {
      // Contain inside a bounding box (cm). Aspect ratio preserved by
      // width/height:auto — the img takes its fitted intrinsic size.
      if (typeof maxWidthCm === 'number' && maxWidthCm > 0) {
        styles.push(`max-width: ${maxWidthCm}cm`);
      }
      if (typeof maxHeightCm === 'number' && maxHeightCm > 0) {
        styles.push(`max-height: ${maxHeightCm}cm`);
      }
      styles.push('width: auto', 'height: auto');
    } else if (typeof widthPercent === 'number' && widthPercent > 0) {
      styles.push(`width: ${widthPercent}%`, 'height: auto');
    } else {
      if (width) styles.push(`width: ${width}px`);
      if (height) styles.push(`height: ${height}px`);
    }

    const attrs: Record<string, any> = { style: styles.join('; ') };
    if (activeFloat) attrs['data-float'] = activeFloat;
    if (src) attrs.src = src;
    if (alt) attrs.alt = alt;
    return ['img', attrs];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

// Declare module augmentation for custom commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setImage: (options: { src: string; alt?: string; width?: number; height?: number; widthPercent?: number; alignment?: 'left' | 'center' | 'right'; maxWidthCm?: number | null; maxHeightCm?: number | null; float?: ImageFloat }) => ReturnType;
    };
  }
}
