import { supabase } from '@/integrations/supabase/client';

/**
 * Impact Canvas — logical viewport for the freeform layout (Phase 2a-1).
 *
 * All element coordinates are stored in these logical units and mapped to
 * screen pixels by the (future) renderer via aspect-ratio scaling.
 */
export const IMPACT_CANVAS_VIEWPORT = { width: 1000, height: 600 } as const;
export const IMPACT_CANVAS_HEADER_HEIGHT = 60;

export interface BoundPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Return {x,y,w,h} in viewport units for a bound cell, replicating the
 * current CSS-grid layout used by ImpactCanvasGraphic:
 *   - a single header row (IMPACT_CANVAS_HEADER_HEIGHT units tall)
 *   - equal-width columns filling the viewport width
 *   - equal-height body rows filling the remaining viewport height
 */
export function computeDefaultBoundPosition(
  rowIndex: number,
  colIndex: number,
  nCols: number,
  nRows: number,
): BoundPosition {
  const safeCols = Math.max(1, nCols);
  const safeRows = Math.max(1, nRows);
  const colW = IMPACT_CANVAS_VIEWPORT.width / safeCols;
  const rowH = (IMPACT_CANVAS_VIEWPORT.height - IMPACT_CANVAS_HEADER_HEIGHT) / safeRows;
  return {
    x: colIndex * colW,
    y: IMPACT_CANVAS_HEADER_HEIGHT + rowIndex * rowH,
    w: colW,
    h: rowH,
  };
}

/**
 * Additive-only sync helper. Ensures there is exactly one 'bound' element per
 * existing (row × column) for the given proposal, WITHOUT clobbering existing
 * coords/z/style and WITHOUT touching free elements (bound_row_id IS NULL).
 *
 * Called after row/column add or column delete (row delete is handled by the
 * ON DELETE CASCADE on bound_row_id).
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

  // Delete bound elements whose column key no longer exists (column deletion).
  // Row deletions are handled by the FK ON DELETE CASCADE.
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

  // Insert any missing (row × column) bound elements at grid-matching defaults.
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
    const { error } = await supabase
      .from('impact_canvas_elements')
      .insert(toInsert);
    if (error) throw error;
  }
}
