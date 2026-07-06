/**
 * Style model for bound Impact Canvas boxes (stored in
 * impact_canvas_elements.style jsonb). All keys optional — when unset the
 * renderer falls back to the historical look (muted background, border
 * token, 1pt, black text) so pre-styled proposals render unchanged.
 *
 * "No fill" / "No outline" sentinels:
 *   - fillColor === 'none'    → transparent background
 *   - outlineColor === 'none' → no border (also outlineWidth 0 works)
 */
export interface BoundBoxStyle {
  fillColor?: string;      // hex or 'none'
  outlineColor?: string;   // hex or 'none'
  outlineWidth?: number;   // pt — one of the preset weights
  fontColor?: string;      // hex — base text colour (inline spans override)
  /** When true, the stored `h` is auto-grown by the editor to fit the box's
   *  rendered text content (default width 2 cm). Set to false on any manual
   *  resize (drag handles or cm H field) — the user then owns the height. */
  autoFitH?: boolean;
}


/** Predefined outline widths (pt) matching Office's line-weight menu. */
export const OUTLINE_WIDTH_PRESETS: { value: number; label: string }[] = [
  { value: 0.25, label: '¼ pt' },
  { value: 0.5,  label: '½ pt' },
  { value: 0.75, label: '¾ pt' },
  { value: 1,    label: '1 pt' },
  { value: 1.5,  label: '1½ pt' },
  { value: 2.25, label: '2¼ pt' },
  { value: 3,    label: '3 pt' },
  { value: 4.5,  label: '4½ pt' },
  { value: 6,    label: '6 pt' },
];

export const BOUND_STYLE_DEFAULTS = {
  fillColor: 'hsl(var(--muted) / 0.3)',
  outlineColor: 'none',
  outlineWidth: 1, // pt
  fontColor: '#000000',
} as const;

const HEX_OR_NONE = /^(#[0-9a-fA-F]{6}|none)$/;

export function readBoundStyle(raw: unknown): BoundBoxStyle {
  if (!raw || typeof raw !== 'object') return {};
  const s = raw as Record<string, unknown>;
  const out: BoundBoxStyle = {};
  if (typeof s.fillColor === 'string' && (HEX_OR_NONE.test(s.fillColor) || s.fillColor.startsWith('hsl'))) {
    out.fillColor = s.fillColor;
  }
  if (typeof s.outlineColor === 'string' && (HEX_OR_NONE.test(s.outlineColor) || s.outlineColor.startsWith('hsl'))) {
    out.outlineColor = s.outlineColor;
  }
  if (typeof s.outlineWidth === 'number' && Number.isFinite(s.outlineWidth)) {
    out.outlineWidth = Math.max(0, Math.min(12, s.outlineWidth));
  }
  if (typeof s.fontColor === 'string') out.fontColor = s.fontColor;
  if (typeof s.autoFitH === 'boolean') out.autoFitH = s.autoFitH;
  return out;
}


export function resolveBoundStyle(raw: unknown) {
  const s = readBoundStyle(raw);
  const fill = s.fillColor ?? BOUND_STYLE_DEFAULTS.fillColor;
  const outColor = s.outlineColor ?? BOUND_STYLE_DEFAULTS.outlineColor;
  const outWidth = s.outlineWidth ?? BOUND_STYLE_DEFAULTS.outlineWidth;
  const isNoFill = fill === 'none';
  const isNoOutline = outColor === 'none' || outWidth === 0;
  return {
    background: isNoFill ? 'transparent' : fill,
    borderColor: isNoOutline ? 'transparent' : outColor,
    /** pt — callers should render as `${borderWidth}pt`. */
    borderWidth: isNoOutline ? 0 : outWidth,
    color: s.fontColor ?? BOUND_STYLE_DEFAULTS.fontColor,
    raw: s,
  };
}
