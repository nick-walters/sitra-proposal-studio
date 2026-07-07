import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  CANVAS_WIDTH_CM,
  CANVAS_MIN_HEIGHT_CM,
  CANVAS_MAX_HEIGHT_CM,
  HEADER_HEIGHT_CM,
} from '@/lib/impactCanvasLayout';
import { ptFont } from '@/lib/impactCanvasTextSizing';

/**
 * CanvasSize — physical canvas dimensions (Stage A of the freeform-figure
 * generalisation). Consumed by the canvas renderer / editor / shape /
 * text-box so sizing math (aspect wrapper, height computation, pt text,
 * %-positioning) is context-driven instead of hardcoded to the impact
 * canvas's 18/10.8/25.5/1.08 constants.
 *
 * The Impact Canvas mount supplies its current values (IMPACT_CANVAS_SIZE)
 * → zero visual/behavioural/export change. Future generic figures will
 * supply their own dimensions.
 */
export interface CanvasSize {
  /** Physical canvas width (cm). Drives %-positioning + pt→cqw scaling. */
  widthCm: number;
  /** Lower bound on adaptive canvas height (cm). */
  minHeightCm: number;
  /** Upper bound on adaptive canvas height (cm) — also the element
   *  y-clamp for editing. Fixed-size (adaptive=false) uses this as THE height. */
  maxHeightCm: number;
  /** Header-band height (cm) — impact-canvas only; generic figures pass 0. */
  headerHeightCm: number;
  /** true = height adapts to content between min/max; false = fixed at max. */
  adaptive: boolean;
}

export const IMPACT_CANVAS_SIZE: CanvasSize = {
  widthCm: CANVAS_WIDTH_CM,
  minHeightCm: CANVAS_MIN_HEIGHT_CM,
  maxHeightCm: CANVAS_MAX_HEIGHT_CM,
  headerHeightCm: HEADER_HEIGHT_CM,
  adaptive: true,
};

const CanvasSizeContext = createContext<CanvasSize>(IMPACT_CANVAS_SIZE);

interface ProviderProps {
  value?: Partial<CanvasSize>;
  children: ReactNode;
}

/** Provider — merges partial overrides over IMPACT_CANVAS_SIZE defaults. */
export function CanvasSizeProvider({ value, children }: ProviderProps) {
  const merged = useMemo<CanvasSize>(
    () => ({ ...IMPACT_CANVAS_SIZE, ...(value ?? {}) }),
    [value],
  );
  return <CanvasSizeContext.Provider value={merged}>{children}</CanvasSizeContext.Provider>;
}

/** Read current canvas size. Defaults to IMPACT_CANVAS_SIZE if no provider. */
export function useCanvasSize(): CanvasSize {
  return useContext(CanvasSizeContext);
}

/**
 * Context-aware `ptFont` helper — resolves pt as a proportion of the
 * current canvas's physical width. Callers use this instead of importing
 * `ptFont` directly so they never hardcode 18 cm.
 */
export function useCanvasPtFont(): (pt: number) => string {
  const { widthCm } = useCanvasSize();
  return useMemo(() => (pt: number) => ptFont(pt, widthCm), [widthCm]);
}
