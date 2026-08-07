import { ImpactCanvasFreeformRenderer } from './ImpactCanvasFreeformRenderer';
import { resolveTableCanvasSize, tableCanvasToCanvasSize } from '@/lib/canvasFigureSize';

interface Props {
  proposalId: string;
  /** Wrapper class override (e.g. remove Card chrome for B2.1 mirror). */
  className?: string;
  /** The impact-canvas figure's stored size (figures.content). */
  content?: { presetId?: string | null; widthCm?: number | null; heightCm?: number | null } | null;
}

/**
 * ImpactCanvasGraphic — thin compatibility wrapper.
 *
 * As of Phase 2a-2 all rendering (editor preview, B2.1 mirror, PDF mount,
 * PNG capture) goes through ImpactCanvasFreeformRenderer, an absolute-
 * positioned freeform renderer driven by impact_canvas_elements. This
 * wrapper is preserved so existing imports keep working; the shared
 * data-impact-canvas-graphic="true" attribute is emitted by the renderer
 * itself so the Word swap continues to target it.
 */
export function ImpactCanvasGraphic({ proposalId, className, content }: Props) {
  return (
    <ImpactCanvasFreeformRenderer
      proposalId={proposalId}
      className={className}
      canvasSize={tableCanvasToCanvasSize(resolveTableCanvasSize('impact-canvas', content))}
    />
  );
}
