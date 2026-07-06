import type { CSSProperties, ReactNode } from 'react';
import { resolveBoundStyle } from '@/lib/impactCanvasBoundStyle';

/**
 * Free "shape" element geometry. Shapes reuse the BoundBoxStyle model
 * (fill / outline colour + width / font colour) so the same styling controls
 * apply. The four kinds:
 *   - rect          → plain rectangle (div + border)
 *   - roundedRect   → rectangle with rounded corners
 *   - circle        → ellipse filling the element box (border-radius: 50%)
 *   - triangle      → isosceles, apex centred at top, base along the bottom
 *                     (SVG polygon, non-scaling stroke)
 *
 * The component is a shared visual — it renders the shape backdrop and
 * a centred content slot (children). The editor passes an in-place TipTap
 * for editing; the read-only renderer passes a sanitised HTML div. Both
 * see the same geometry / style => four-context parity.
 */
export type ShapeKind = 'rect' | 'roundedRect' | 'circle' | 'triangle';
export const SHAPE_KINDS: ShapeKind[] = ['rect', 'roundedRect', 'circle', 'triangle'];

interface Props {
  shape: ShapeKind;
  styleRaw: unknown;
  children?: ReactNode;
  /** Editor selection ring — swaps stroke to primary + bumps its width. */
  selected?: boolean;
}

export function ImpactCanvasShape({ shape, styleRaw, children, selected }: Props) {
  const bs = resolveBoundStyle(styleRaw);
  const strokeColor = selected ? 'hsl(var(--primary))' : bs.borderColor;
  const strokeWidth = selected ? Math.max(1.5, bs.borderWidth || 0) : bs.borderWidth;

  const boxBase: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: bs.background,
    borderStyle: 'solid',
    borderColor: strokeColor,
    borderWidth: strokeWidth ? `${strokeWidth}pt` : 0,
    boxSizing: 'border-box',
    pointerEvents: 'none',
  };

  let backdrop: ReactNode = null;
  if (shape === 'rect') {
    backdrop = <div style={boxBase} />;
  } else if (shape === 'roundedRect') {
    backdrop = <div style={{ ...boxBase, borderRadius: 10 }} />;
  } else if (shape === 'circle') {
    backdrop = <div style={{ ...boxBase, borderRadius: '50%' }} />;
  } else {
    // triangle — SVG polygon, non-scaling stroke so line width stays constant.
    backdrop = (
      <svg
        aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polygon
          points="50,2 98,98 2,98"
          fill={bs.background === 'transparent' ? 'none' : bs.background}
          stroke={strokeWidth ? strokeColor : 'none'}
          style={{ strokeWidth: strokeWidth ? `${strokeWidth}pt` : 0 }}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="miter"
        />
      </svg>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        color: bs.color,
        fontFamily: '"Times New Roman", Times, serif',
      }}
    >
      {backdrop}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4pt',
          boxSizing: 'border-box',
          textAlign: 'center',
          fontSize: '1.8cqw',
          lineHeight: 1.3,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
