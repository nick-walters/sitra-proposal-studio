/**
 * Shared figure size presets — six fixed page-fraction sizes reused by the
 * Figure Canvas figure type (Stage C) and later by uploaded / AI-generated
 * figures. Each preset is a fixed physical width × height in centimetres
 * (never adaptive) so the same preset always renders at the same aspect
 * ratio across editor / B2.1 mirror / PDF / Word / PNG.
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

export function getFigureSizePreset(id: string | null | undefined): FigureSizePreset {
  return (
    FIGURE_SIZE_PRESETS.find((p) => p.id === id) ??
    FIGURE_SIZE_PRESETS.find((p) => p.id === DEFAULT_FIGURE_SIZE_PRESET_ID)!
  );
}
