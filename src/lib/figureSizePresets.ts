/**
 * Shared figure size presets — six fixed page-fraction sizes reused by the
 * Figure Canvas figure type (Stage C), uploaded images, and AI-generated
 * images. Each preset is a fixed physical width × height in centimetres
 * (never adaptive) so the same preset always renders at the same aspect
 * ratio across editor / B2.1 mirror / PDF / Word / PNG.
 *
 * For uploaded/AI image figures the preset dimensions define a BOUNDING
 * BOX; the image is scaled to fit inside preserving aspect ratio (contain,
 * whole image visible, no crop or stretch, no letterbox padding — the
 * figure occupies the fitted image's dimensions only).
 */
export type FigureSizePresetId =
  | 'full'
  | 'half'
  | 'third'
  | 'quarter'
  | 'eighth-landscape'
  | 'eighth-portrait';

export interface FigureSizePreset {
  id: FigureSizePresetId;
  label: string;
  widthCm: number;
  heightCm: number;
  orientation?: 'landscape' | 'portrait';
}

export const FIGURE_SIZE_PRESETS: readonly FigureSizePreset[] = [
  { id: 'full', label: 'Full page', widthCm: 18, heightCm: 25.5, orientation: 'portrait' },
  { id: 'half', label: 'Half page', widthCm: 18, heightCm: 13.5, orientation: 'landscape' },
  { id: 'third', label: 'Third page', widthCm: 18, heightCm: 8.5, orientation: 'landscape' },
  { id: 'quarter', label: 'Quarter page', widthCm: 9, heightCm: 13.5, orientation: 'portrait' },
  { id: 'eighth-landscape', label: 'Eighth page (landscape)', widthCm: 9, heightCm: 6.5, orientation: 'landscape' },
  { id: 'eighth-portrait', label: 'Eighth page (portrait)', widthCm: 6.5, heightCm: 9, orientation: 'portrait' },
] as const;

export const DEFAULT_FIGURE_SIZE_PRESET_ID: FigureSizePresetId = 'half';

// Custom width/height bounds (cm). Match the full-page maxima.
export const FIGURE_CUSTOM_MAX_WIDTH_CM = 18;
export const FIGURE_CUSTOM_MAX_HEIGHT_CM = 25.5;
export const FIGURE_CUSTOM_MIN_CM = 1;
export const FIGURE_CUSTOM_DEFAULT_WIDTH_CM = 18;
export const FIGURE_CUSTOM_DEFAULT_HEIGHT_CM = 25.5;

export function clampFigureDim(v: number, max: number): number {
  if (!Number.isFinite(v) || v <= 0) return FIGURE_CUSTOM_MIN_CM;
  return Math.min(Math.max(v, FIGURE_CUSTOM_MIN_CM), max);
}

export function getFigureSizePreset(id: string | null | undefined): FigureSizePreset {
  return (
    FIGURE_SIZE_PRESETS.find((p) => p.id === id) ??
    FIGURE_SIZE_PRESETS.find((p) => p.id === DEFAULT_FIGURE_SIZE_PRESET_ID)!
  );
}

/** Full text-column width used for inline figures. */
export const FIGURE_COLUMN_WIDTH_CM = 18;

export interface FigureSizeContent {
  presetId?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
}

function getFigureEffectiveWidthCm(content: FigureSizeContent | null | undefined): number | null {
  if (!content) return null;
  if (Number.isFinite(content.widthCm) && content.widthCm! > 0) {
    return content.widthCm!;
  }
  if (content.presetId) {
    const preset = FIGURE_SIZE_PRESETS.find((p) => p.id === content.presetId);
    if (preset) return preset.widthCm;
  }
  return null;
}

/**
 * Returns true when a figure's effective width is narrower than the full
 * text-column width. Full-width presets (full/half/third) and unsized figures
 * are not narrow; quarter/eighth presets and custom widths < 18 cm are.
 */
export function isNarrowFigure(content: FigureSizeContent | null | undefined): boolean {
  const width = getFigureEffectiveWidthCm(content);
  if (width == null) return false;
  return width > 0 && width < FIGURE_COLUMN_WIDTH_CM;
}

/**
 * Returns the width (in cm) that a narrow figure's caption box should match.
 * For non-narrow or unsized figures, returns undefined so the existing
 * full-width caption behaviour is preserved.
 */
export function getFigureCaptionWidthCm(
  content: FigureSizeContent | null | undefined
): number | undefined {
  if (!isNarrowFigure(content)) return undefined;
  const width = getFigureEffectiveWidthCm(content);
  return width ?? undefined;
}
