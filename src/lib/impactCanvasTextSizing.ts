/**
 * Impact Canvas text sizing — pt as a proportion of the physical canvas.
 *
 * The canvas has a KNOWN physical width in cm (18cm for the impact canvas).
 * Any pt size is converted to a `cqw` fraction of that physical width, so
 * text renders as a genuine, consistent point size on the final page
 * regardless of the on-screen / responsive canvas width, and irrespective
 * of the render context (editor, B2.1 mirror, PDF, PNG).
 *
 * Each canvas wrapper sets `container-type: inline-size` (and is 100% wide
 * of its parent), so `cqw` resolves against the canvas's rendered width.
 * `ptFont(pt)` returns the css string; `ptToCqw(pt)` the raw number.
 *
 * Generalises to future canvas sizes: change `CANVAS_WIDTH_CM` (or thread
 * it through) and pt sizes stay physically correct.
 */
export const CANVAS_WIDTH_CM = 18;
const PT_PER_CM = 72 / 2.54; // 28.3465
const CANVAS_WIDTH_PT = CANVAS_WIDTH_CM * PT_PER_CM;

export function ptToCqw(pt: number, canvasWidthCm: number = CANVAS_WIDTH_CM): number {
  const widthPt = canvasWidthCm * PT_PER_CM;
  return (pt * 100) / widthPt;
}

export function ptFont(pt: number, canvasWidthCm: number = CANVAS_WIDTH_CM): string {
  return `${ptToCqw(pt, canvasWidthCm).toFixed(4)}cqw`;
}

/** Default body pt size for canvas text. */
export const DEFAULT_PT = 11;
/** Header (Arial Black) default pt size. */
export const HEADER_PT = 11;
/** Font size dropdown options — locked to Office-like whole points. */
export const FONT_SIZE_OPTIONS = [9, 10, 11, 12, 13, 14] as const;
export type CanvasFontPt = typeof FONT_SIZE_OPTIONS[number];

export const FONT_FAMILY_REGULAR = 'Arial, sans-serif';
export const FONT_FAMILY_HEADER = '"Arial Black", Arial, sans-serif';
export const DEFAULT_TEXT_COLOR = '#000000';

// Silence unused warnings if consumers import selectively.
export { CANVAS_WIDTH_PT, PT_PER_CM };
