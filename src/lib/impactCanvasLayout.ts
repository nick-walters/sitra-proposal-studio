import { supabase } from '@/integrations/supabase/client';

/**
 * Impact Canvas — cm coordinate model.
 *
 * All element coordinates (x, y, w, h) in `impact_canvas_elements` are stored
 * in centimetres. Width is fixed at 18 cm; height adapts to content and is
 * capped at 25.5 cm. The shared `computeCanvasHeightCm` function is used
 * IDENTICALLY by the editor and the read-only renderer (B2.1/PDF/PNG) so all
 * four contexts render at the same aspect ratio for the same elements.
 *
 * Legacy migration: element coords were previously stored in unitless
 * 1000 × 600 logical units. A one-shot SQL migration multiplies old x/y/w/h
 * by 0.018 (18 cm / 1000 units) — uniform on both axes so aspect is
 * preserved. The migration is idempotent (guarded per proposal by whether
 * max coord > 30, which is impossible in the cm model where max = 25.5).
 */

export const CANVAS_WIDTH_CM = 18;
export const CANVAS_MAX_HEIGHT_CM = 25.5;
/** Minimum canvas height — matches the legacy 600-unit viewport
 *  (600 * 0.018 cm/unit ≈ 10.8 cm) so pre-migration layouts don't shrink. */
export const CANVAS_MIN_HEIGHT_CM = 10.8;
/** Small padding beneath the lowest element bottom before clamping. */
export const CANVAS_BOTTOM_PAD_CM = 0.3;
/** Header band height (was 60 units → 60 * 0.018 = 1.08 cm). */
export const HEADER_HEIGHT_CM = 1.08;
/** Legacy unit → cm factor (both axes). Exported for the SQL migration + tests. */
export const CM_PER_LEGACY_UNIT = 0.018;

/** Minimum element footprint (cm) used when resizing / creating boxes. */
export const MIN_ELEMENT_W_CM = 1;
export const MIN_ELEMENT_H_CM = 0.5;

/**
 * Default bound-box layout (applied to NEW bound elements only —
 * existing coords are never disturbed).
 *   - Width fixed at 2 cm.
 *   - Horizontal gap between adjacent columns = 1.2 cm (step 3.2 cm).
 *   - Starting x = 0 (left origin of the 18 cm canvas).
 *   - Default height = 0.8 cm (a single 12pt line) as a MIN — the editor
 *     grows it via ResizeObserver until the user manually resizes
 *     (drag / cm-field), which sets style.autoFitH=false.
 *   - Vertical gap between rows = 0.3 cm.
 */
export const DEFAULT_BOUND_W_CM = 2;
export const DEFAULT_BOUND_H_CM = 0.8;
export const DEFAULT_BOUND_HGAP_CM = 1.2;
export const DEFAULT_BOUND_VGAP_CM = 0.3;
export const DEFAULT_BOUND_START_X_CM = 0;


/**
 * Back-compat shim. Some callers still import IMPACT_CANVAS_VIEWPORT /
 * IMPACT_CANVAS_HEADER_HEIGHT — they now receive the cm equivalents so any
 * `pct = value / VW * 100` math still yields correct percentages.
 */
export const IMPACT_CANVAS_VIEWPORT = {
  width: CANVAS_WIDTH_CM,
  height: CANVAS_MAX_HEIGHT_CM,
} as const;
export const IMPACT_CANVAS_HEADER_HEIGHT = HEADER_HEIGHT_CM;

export interface BoundPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Return {x,y,w,h} in cm for a NEW bound cell using the compact defaults:
 *   - width = DEFAULT_BOUND_W_CM (2 cm) fixed
 *   - height = DEFAULT_BOUND_H_CM (0.8 cm) as a starting min — the editor
 *     auto-grows h to fit rendered text until the user manually resizes.
 *   - x steps by (w + hgap) starting at DEFAULT_BOUND_START_X_CM (0).
 *   - y steps by (default h + vgap) below the header band.
 *
 * `nCols`/`nRows` are accepted for backward compatibility with earlier
 * callers but no longer influence the returned coords — layout is now
 * driven purely by the fixed 2 cm / 1.2 cm cadence.
 */
export function computeDefaultBoundPosition(
  rowIndex: number,
  colIndex: number,
  _nCols?: number,
  _nRows?: number,
): BoundPosition {
  void _nCols;
  void _nRows;
  const w = DEFAULT_BOUND_W_CM;
  const h = DEFAULT_BOUND_H_CM;
  const x = DEFAULT_BOUND_START_X_CM + colIndex * (w + DEFAULT_BOUND_HGAP_CM);
  const y = HEADER_HEIGHT_CM + rowIndex * (h + DEFAULT_BOUND_VGAP_CM);
  return { x, y, w, h };
}


/**
 * Shared deterministic height function — the parity linchpin.
 *
 * Height = lowest element bottom + CANVAS_BOTTOM_PAD_CM,
 *          clamped to [CANVAS_MIN_HEIGHT_CM, CANVAS_MAX_HEIGHT_CM].
 *
 * Editor + read-only renderer both call this over the SAME element set so
 * they produce identical wrapper heights (and therefore identical aspect
 * ratios) for the same content.
 */
export function computeCanvasHeightCm(
  elements: ReadonlyArray<{ y: number; h: number }>,
): number {
  let bottom = HEADER_HEIGHT_CM;
  for (const el of elements) {
    const b = (el.y ?? 0) + (el.h ?? 0);
    if (b > bottom) bottom = b;
  }
  const desired = bottom + CANVAS_BOTTOM_PAD_CM;
  return Math.min(CANVAS_MAX_HEIGHT_CM, Math.max(CANVAS_MIN_HEIGHT_CM, desired));
}

/**
 * Additive-only sync helper. Ensures there is exactly one 'bound' element per
 * existing (row × column) for the given proposal, WITHOUT clobbering existing
 * coords/z/style and WITHOUT touching free elements (bound_row_id IS NULL).
 */
export async function syncBoundElements(proposalId: string): Promise<void> {
  const [colsRes, rowsRes, existingRes] = await Promise.all([
    supabase
      .from('impact_canvas_columns')
      .select('key, order_index')
      .eq('proposal_id', proposalId)
      .order('order_index'),
    supabase
      .from('impact_canvas_rows')
      .select('id, order_index')
      .eq('proposal_id', proposalId)
      .order('order_index'),
    supabase
      .from('impact_canvas_elements')
      .select('bound_row_id, bound_col_key')
      .eq('proposal_id', proposalId)
      .eq('kind', 'bound'),
  ]);
  if (colsRes.error) throw colsRes.error;
  if (rowsRes.error) throw rowsRes.error;
  if (existingRes.error) throw existingRes.error;

  const cols = colsRes.data ?? [];
  const rows = rowsRes.data ?? [];
  const existing = new Set(
    (existingRes.data ?? [])
      .filter((e) => e.bound_row_id && e.bound_col_key)
      .map((e) => `${e.bound_row_id}::${e.bound_col_key}`),
  );

  const validColKeys = new Set(cols.map((c) => c.key));
  const orphanKeys = Array.from(
    new Set(
      (existingRes.data ?? [])
        .map((e) => e.bound_col_key)
        .filter((k): k is string => !!k && !validColKeys.has(k)),
    ),
  );
  if (orphanKeys.length > 0) {
    const { error } = await supabase
      .from('impact_canvas_elements')
      .delete()
      .eq('proposal_id', proposalId)
      .eq('kind', 'bound')
      .in('bound_col_key', orphanKeys);
    if (error) throw error;
  }

  const toInsert: Array<{
    proposal_id: string;
    kind: 'bound';
    bound_row_id: string;
    bound_col_key: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];
  for (const r of rows) {
    for (const c of cols) {
      const key = `${r.id}::${c.key}`;
      if (existing.has(key)) continue;
      const pos = computeDefaultBoundPosition(
        r.order_index,
        c.order_index,
        cols.length,
        rows.length,
      );
      toInsert.push({
        proposal_id: proposalId,
        kind: 'bound',
        bound_row_id: r.id,
        bound_col_key: c.key,
        ...pos,
      });
    }
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from('impact_canvas_elements').insert(toInsert);
    if (error) throw error;
  }
}
