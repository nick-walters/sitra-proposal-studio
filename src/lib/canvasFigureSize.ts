import {
  getFigureSizePreset,
  type FigureSizePresetId,
} from '@/lib/figureSizePresets';
import { CANVAS_MAX_HEIGHT_CM, HEADER_HEIGHT_CM } from '@/lib/impactCanvasLayout';
import type { CanvasSize } from '@/lib/canvasSize';

/**
 * Size resolution for the two TABLE-BACKED canvases (the B2.1 Impact
 * Canvas and the B1.1 project overview canvas).
 *
 * Both used to be hardcoded to the impact-canvas geometry. They now carry
 * a size on `figures.content` (presetId / widthCm / heightCm) exactly like
 * every other figure, editable from the size card at the bottom of the
 * figure page. Defaults when nothing is stored:
 *   - impact-canvas   → full page   (18 × 25.5 cm)
 *   - overview-canvas → third page  (18 × 8.5 cm)
 *
 * The chosen height is the canvas FRAME height. It is applied as the
 * minimum height with adaptive growth kept on, so boxes that extend past
 * the frame are never clipped (no risk to existing content).
 */

export const TABLE_CANVAS_TYPES = ['impact-canvas', 'overview-canvas'] as const;

export function isTableCanvasFigureType(figureType?: string | null): boolean {
  return figureType === 'impact-canvas' || figureType === 'overview-canvas';
}

export function defaultTableCanvasPresetId(figureType?: string | null): FigureSizePresetId {
  return figureType === 'overview-canvas' ? 'third' : 'full';
}

export interface TableCanvasSize {
  presetId: FigureSizePresetId | 'custom';
  widthCm: number;
  heightCm: number;
}

export function resolveTableCanvasSize(
  figureType: string | null | undefined,
  content: { presetId?: string | null; widthCm?: number | null; heightCm?: number | null } | null | undefined,
): TableCanvasSize {
  const fallback = getFigureSizePreset(defaultTableCanvasPresetId(figureType));
  const w = Number(content?.widthCm);
  const h = Number(content?.heightCm);
  const hasSize = Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0;
  return {
    presetId: (content?.presetId as TableCanvasSize['presetId']) || (hasSize ? 'custom' : fallback.id),
    widthCm: hasSize ? w : fallback.widthCm,
    heightCm: hasSize ? h : fallback.heightCm,
  };
}

/** Map a resolved table-canvas size onto the CanvasSize context value. */
export function tableCanvasToCanvasSize(size: { widthCm: number; heightCm: number }): Partial<CanvasSize> {
  return {
    widthCm: size.widthCm,
    minHeightCm: size.heightCm,
    maxHeightCm: Math.max(size.heightCm, CANVAS_MAX_HEIGHT_CM),
    headerHeightCm: HEADER_HEIGHT_CM,
    adaptive: true,
  };
}
