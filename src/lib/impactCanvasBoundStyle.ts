/**
 * Style model for bound Impact Canvas boxes (stored in
 * impact_canvas_elements.style jsonb). All keys optional — when unset the
 * renderer falls back to the historical look (muted background, border
 * token, 1px, black text) so pre-styled proposals render unchanged.
 */
export interface BoundBoxStyle {
  fillColor?: string;      // hex
  outlineColor?: string;   // hex
  outlineWidth?: number;   // px (1..8 sensible)
  fontColor?: string;      // hex — base text colour (inline spans override)
}

export const BOUND_STYLE_DEFAULTS = {
  fillColor: 'hsl(var(--muted) / 0.3)',
  outlineColor: 'hsl(var(--border))',
  outlineWidth: 1,
  fontColor: '#000000',
} as const;

export function readBoundStyle(raw: unknown): BoundBoxStyle {
  if (!raw || typeof raw !== 'object') return {};
  const s = raw as Record<string, unknown>;
  const out: BoundBoxStyle = {};
  if (typeof s.fillColor === 'string') out.fillColor = s.fillColor;
  if (typeof s.outlineColor === 'string') out.outlineColor = s.outlineColor;
  if (typeof s.outlineWidth === 'number' && Number.isFinite(s.outlineWidth)) {
    out.outlineWidth = Math.max(0, Math.min(12, s.outlineWidth));
  }
  if (typeof s.fontColor === 'string') out.fontColor = s.fontColor;
  return out;
}

export function resolveBoundStyle(raw: unknown) {
  const s = readBoundStyle(raw);
  return {
    background: s.fillColor ?? BOUND_STYLE_DEFAULTS.fillColor,
    borderColor: s.outlineColor ?? BOUND_STYLE_DEFAULTS.outlineColor,
    borderWidth: s.outlineWidth ?? BOUND_STYLE_DEFAULTS.outlineWidth,
    color: s.fontColor ?? BOUND_STYLE_DEFAULTS.fontColor,
    raw: s,
  };
}
