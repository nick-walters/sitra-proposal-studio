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
 * existing coords are never disturbed, unless layout = 'fullWidth').
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

/** Full-width layout: columns share the whole canvas width with a small gap. */
export const FULL_WIDTH_HGAP_CM = 0.3;
export const FULL_WIDTH_MARGIN_CM = 0;

export type BoundLayout = 'compact' | 'fullWidth';

/** Vertical gap between two stacked column bands (cm). */
export const BAND_GAP_CM = 0.6;
/** Vertical gap between the header band / rows inside a band (cm). */
export const BAND_ROW_GAP_CM = 0.3;
/** Impact Canvas: three columns per band (six columns do not fit side by
 *  side on an A4 portrait page, so they stack as two 3-column bands). */
export const IMPACT_COLUMNS_PER_BAND = 3;

export interface BoundLayoutOptions {
  layout?: BoundLayout;
  /** Canvas width in cm; defaults to CANVAS_WIDTH_CM. */
  canvasWidthCm?: number;
  /** Horizontal gap between columns in cm. */
  hgapCm?: number;
  /** Left/right margin in cm. */
  marginCm?: number;
  /** When set (> 0), columns wrap into stacked bands of this many columns.
   *  Band n+1 is positioned below the tallest content of band n. */
  columnsPerBand?: number;
}

/** Map a column's global order_index to its band and in-band column index. */
export function columnSlot(
  orderIndex: number,
  options?: BoundLayoutOptions,
): { band: number; col: number } {
  const cpb = options?.columnsPerBand ?? 0;
  if (!cpb || cpb <= 0) return { band: 0, col: orderIndex };
  return { band: Math.floor(orderIndex / cpb), col: orderIndex % cpb };
}


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

function computeColumnGeometry(nCols: number, options?: BoundLayoutOptions) {
  const layout = options?.layout ?? 'compact';
  const canvasWidth = options?.canvasWidthCm ?? CANVAS_WIDTH_CM;
  if (layout === 'compact') {
    return {
      w: DEFAULT_BOUND_W_CM,
      gap: DEFAULT_BOUND_HGAP_CM,
      startX: DEFAULT_BOUND_START_X_CM,
    };
  }
  const margin = options?.marginCm ?? FULL_WIDTH_MARGIN_CM;
  const gap = options?.hgapCm ?? FULL_WIDTH_HGAP_CM;
  const cpb = options?.columnsPerBand ?? 0;
  // With banded wrapping, the width is set by the widest band (= columnsPerBand),
  // not by the total column count.
  const perRow = cpb && cpb > 0 ? Math.min(Math.max(1, nCols), cpb) : nCols;
  const usable = canvasWidth - 2 * margin;
  const totalGap = Math.max(0, perRow - 1) * gap;
  const w = Math.max(MIN_ELEMENT_W_CM, (usable - totalGap) / Math.max(1, perRow));
  const startX = margin;
  return { w, gap, startX };
}

/**
 * Full-width column boxes with MANUAL WIDTH PRESERVATION.
 *
 * Columns the user has resized (any bound/header box in that column carrying
 * style.manualW) keep their width; the remaining space of the band is shared
 * evenly between the untouched columns. x is laid out cumulatively per band so
 * columns never overlap, regardless of the manual widths.
 */
export function computeFullWidthColumnBoxes(
  cols: ReadonlyArray<{ key: string; order_index: number }>,
  manualWidths: ReadonlyMap<string, number>,
  options?: BoundLayoutOptions,
): Map<string, { x: number; w: number }> {
  const canvasWidth = options?.canvasWidthCm ?? CANVAS_WIDTH_CM;
  const margin = options?.marginCm ?? FULL_WIDTH_MARGIN_CM;
  const gap = options?.hgapCm ?? FULL_WIDTH_HGAP_CM;
  const cpb = options?.columnsPerBand ?? 0;
  const out = new Map<string, { x: number; w: number }>();
  const sorted = [...cols].sort((a, b) => a.order_index - b.order_index);

  const bands = new Map<number, typeof sorted>();
  for (const c of sorted) {
    const band = columnSlot(c.order_index, options).band;
    const list = bands.get(band) ?? [];
    list.push(c);
    bands.set(band, list);
  }
  // Slots per band: with banded wrapping every band is laid out on the same
  // grid width (columnsPerBand), so a short last band keeps column alignment.
  const slots = cpb && cpb > 0 ? cpb : Math.max(1, sorted.length);

  for (const list of bands.values()) {
    const usable = canvasWidth - 2 * margin;
    const totalGap = Math.max(0, slots - 1) * gap;
    let manualSum = 0;
    let autoCount = 0;
    for (const c of list) {
      const mw = manualWidths.get(c.key);
      if (mw && mw > 0) manualSum += mw;
      else autoCount++;
    }
    // Empty slots in a short band still consume their even share.
    autoCount += Math.max(0, slots - list.length);
    const remaining = usable - totalGap - manualSum;
    const autoW = autoCount > 0 ? Math.max(MIN_ELEMENT_W_CM, remaining / autoCount) : 0;
    let x = margin;
    for (const c of list) {
      const mw = manualWidths.get(c.key);
      const w = mw && mw > 0 ? mw : autoW;
      out.set(c.key, { x, w });
      x += w + gap;
    }
  }
  return out;
}



/**
 * Return {x,y,w,h} in cm for a NEW bound cell.
 *   - compact (default): width = 2 cm, gap = 1.2 cm, start x = 0.
 *   - fullWidth: columns share the canvas width evenly with a small gap.
 *   - height = DEFAULT_BOUND_H_CM (0.8 cm) as a starting min — the editor
 *     auto-grows h to fit rendered text until the user manually resizes.
 *   - y steps by (default h + vgap) below the header band.
 */
export function computeDefaultBoundPosition(
  rowIndex: number,
  colIndex: number,
  nCols?: number,
  options?: BoundLayoutOptions,
): BoundPosition {
  const { w, gap, startX } = computeColumnGeometry(nCols ?? 1, options);
  const h = DEFAULT_BOUND_H_CM;
  const x = startX + colIndex * (w + gap);
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
export interface CanvasHeightBounds {
  minCm?: number;
  maxCm?: number;
  headerCm?: number;
  /** When false, returns maxCm regardless of element bottoms (fixed-size). */
  adaptive?: boolean;
}

export function computeCanvasHeightCm(
  elements: ReadonlyArray<{ y: number; h: number }>,
  bounds?: CanvasHeightBounds,
): number {
  const minCm = bounds?.minCm ?? CANVAS_MIN_HEIGHT_CM;
  const maxCm = bounds?.maxCm ?? CANVAS_MAX_HEIGHT_CM;
  const headerCm = bounds?.headerCm ?? HEADER_HEIGHT_CM;
  const adaptive = bounds?.adaptive ?? true;
  if (!adaptive) return maxCm;
  let bottom = headerCm;
  for (const el of elements) {
    const b = (el.y ?? 0) + (el.h ?? 0);
    if (b > bottom) bottom = b;
  }
  const desired = bottom + CANVAS_BOTTOM_PAD_CM;
  return Math.min(maxCm, Math.max(minCm, desired));
}


/**
 * Banded vertical layout — the "two stacked canvases, no divider" model.
 *
 * Columns wrap into bands of `options.columnsPerBand`. Band 0 sits at the top;
 * every following band is placed BELOW the tallest content of the band above
 * it, so growing the top half automatically pushes the bottom half down.
 *
 * Pure + deterministic: given the same element heights it always returns the
 * same y for every header / bound / band-backdrop element. Returns only the
 * elements whose y must change (caller decides how to apply / persist).
 */
export interface BandLayoutElement {
  id: string;
  kind: string;
  bound_col_key: string | null;
  bound_row_id: string | null;
  y: number;
  h: number;
  style?: unknown;
}

export function computeBandedYs(params: {
  elements: ReadonlyArray<BandLayoutElement>;
  columnOrder: ReadonlyArray<{ key: string; order_index: number }>;
  rowOrder: ReadonlyArray<string>;
  options?: BoundLayoutOptions;
}): Map<string, number> {
  const { elements, columnOrder, rowOrder, options } = params;
  const cpb = options?.columnsPerBand ?? 0;
  const out = new Map<string, number>();
  if (!cpb || cpb <= 0 || columnOrder.length === 0) return out;

  const bandOfKey = new Map<string, number>();
  for (const c of columnOrder) bandOfKey.set(c.key, columnSlot(c.order_index, options).band);
  const nBands = Math.max(1, ...Array.from(bandOfKey.values()).map((b) => b + 1));

  const backdropBand = (el: BandLayoutElement): number | null => {
    const s = (el.style ?? {}) as Record<string, unknown>;
    return typeof s.bandBackdrop === 'number' ? s.bandBackdrop : null;
  };

  let top = 0;
  for (let band = 0; band < nBands; band++) {
    let headerBottom = top;
    for (const el of elements) {
      if (el.kind === 'header' && el.bound_col_key && bandOfKey.get(el.bound_col_key) === band) {
        out.set(el.id, top);
        headerBottom = Math.max(headerBottom, top + (el.h ?? 0));
      } else if (backdropBand(el) === band) {
        out.set(el.id, top);
        headerBottom = Math.max(headerBottom, top + (el.h ?? 0));
      }
    }
    let cursor = headerBottom + BAND_ROW_GAP_CM;
    for (const rowId of rowOrder) {
      let rowBottom = cursor;
      let any = false;
      for (const el of elements) {
        if (
          el.kind === 'bound' &&
          el.bound_row_id === rowId &&
          el.bound_col_key &&
          bandOfKey.get(el.bound_col_key) === band
        ) {
          out.set(el.id, cursor);
          rowBottom = Math.max(rowBottom, cursor + (el.h ?? 0));
          any = true;
        }
      }
      if (any) cursor = rowBottom + BAND_ROW_GAP_CM;
    }
    top = cursor - BAND_ROW_GAP_CM + BAND_GAP_CM;
  }
  return out;
}

/**
 * Additive-only sync helper. Ensures there is exactly one 'bound' element per

 * existing (row × column) for the given proposal, WITHOUT clobbering existing
 * coords/z/style and WITHOUT touching free elements (bound_row_id IS NULL).
 *
 * When `options.layout === 'fullWidth'`, existing bound/header x/w are
 * recalculated so the columns always span the full canvas width. y/h/z/style
 * are still preserved so user resizing is not lost.
 */
export async function syncBoundElements(
  proposalId: string,
  figureId?: string | null,
  options?: BoundLayoutOptions,
): Promise<void> {
  const fid = figureId ?? null;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const scope = (q: any): any => (fid ? q.eq('figure_id', fid) : q.is('figure_id', null));
  const [colsRes, rowsRes, existingRes] = await Promise.all([
    scope(supabase
      .from('impact_canvas_columns')
      .select('key, order_index')
      .eq('proposal_id', proposalId)).order('order_index'),
    scope(supabase
      .from('impact_canvas_rows')
      .select('id, order_index')
      .eq('proposal_id', proposalId)).order('order_index'),
    // Scoped to ONE canvas: figure_id IS NULL = the Impact Canvas singleton;
    // a non-null figure_id = a table-backed canvas figure (e.g. the B1.1
    // project overview canvas).
    scope(supabase
      .from('impact_canvas_elements')
      .select('id, bound_row_id, bound_col_key, kind, x, y, w, h')
      .eq('proposal_id', proposalId)).in('kind', ['bound', 'header']),


  ]);
  if (colsRes.error) throw colsRes.error;
  if (rowsRes.error) throw rowsRes.error;
  if (existingRes.error) throw existingRes.error;

  const cols = colsRes.data ?? [];
  const rows = rowsRes.data ?? [];
  const existingRows = existingRes.data ?? [];
  const existingBound = new Set(
    existingRows
      .filter((e) => e.kind === 'bound' && e.bound_row_id && e.bound_col_key)
      .map((e) => `${e.bound_row_id}::${e.bound_col_key}`),
  );
  const existingHeader = new Set(
    existingRows
      .filter((e) => e.kind === 'header' && e.bound_col_key)
      .map((e) => e.bound_col_key as string),
  );

  const validColKeys = new Set(cols.map((c) => c.key));
  const orphanKeys = Array.from(
    new Set(
      existingRows
        .map((e) => e.bound_col_key)
        .filter((k): k is string => !!k && !validColKeys.has(k)),
    ),
  );
  if (orphanKeys.length > 0) {
    const { error } = await scope(supabase
      .from('impact_canvas_elements')
      .delete()
      .eq('proposal_id', proposalId))
      .in('kind', ['bound', 'header'])
      .in('bound_col_key', orphanKeys);

    if (error) throw error;
  }

  const colGeom = computeColumnGeometry(cols.length, options);

  const toInsert: Array<{
    proposal_id: string;
    figure_id: string | null;
    kind: 'bound' | 'header';
    bound_row_id: string | null;
    bound_col_key: string;
    x: number;
    y: number;
    w: number;
    h: number;
    style: Record<string, unknown>;
  }> = [];

  // Header elements — one per column, top row.
  for (const c of cols) {
    if (existingHeader.has(c.key)) continue;
    toInsert.push({
      proposal_id: proposalId,
      figure_id: fid,
      kind: 'header',
      bound_row_id: null,
      bound_col_key: c.key,
      x: colGeom.startX + columnSlot(c.order_index, options).col * (colGeom.w + colGeom.gap),
      y: 0,
      w: colGeom.w,
      h: 1,
      style: { fillColor: '#000000', fontColor: '#FFFFFF', outlineColor: 'none' },
    });
  }

  // Bound cell elements — one per (row × column).
  // Vertical position rule: a NEW row sits 0.4cm below the LOWEST edge
  // (max y+h, including auto-fit growth) of the row DIRECTLY ABOVE it. For
  // the first content row, the "row above" is the header band. Existing
  // rows keep their coords untouched (additive-only).
  const NEW_ROW_GAP_CM = 0.4;

  // Compute the current bottom (max y+h) of each existing row, and of headers.
  const rowBottoms = new Map<string, number>();
  let headerBottom = HEADER_HEIGHT_CM;
  for (const e of existingRows) {
    const bottom = (e.y ?? 0) + (e.h ?? 0);
    if (e.kind === 'header') {
      if (bottom > headerBottom) headerBottom = bottom;
    } else if (e.kind === 'bound' && e.bound_row_id) {
      const cur = rowBottoms.get(e.bound_row_id) ?? 0;
      if (bottom > cur) rowBottoms.set(e.bound_row_id, bottom);
    }
  }

  const sortedRows = [...rows].sort((a, b) => a.order_index - b.order_index);
  for (let i = 0; i < sortedRows.length; i++) {
    const r = sortedRows[i];
    // Row already has bound elements? Skip position computation; only fill
    // missing columns at their existing row y (rare case: partial row).
    const rowHasExisting = rowBottoms.has(r.id);
    let newRowY: number | null = null;
    if (!rowHasExisting) {
      const prev = i > 0 ? sortedRows[i - 1] : null;
      const baseline = prev ? (rowBottoms.get(prev.id) ?? headerBottom) : headerBottom;
      newRowY = baseline + NEW_ROW_GAP_CM;
    }
    for (const c of cols) {
      const key = `${r.id}::${c.key}`;
      if (existingBound.has(key)) continue;
      const x = colGeom.startX + columnSlot(c.order_index, options).col * (colGeom.w + colGeom.gap);
      const w = colGeom.w;
      const h = DEFAULT_BOUND_H_CM;
      // If this row already has some existing boxes, align new missing
      // boxes to that row's top (existing row y is not selected explicitly;
      // approximate via bottom - default h). Otherwise use computed newRowY.
      const y = newRowY ?? Math.max(HEADER_HEIGHT_CM, (rowBottoms.get(r.id) ?? HEADER_HEIGHT_CM) - h);
      toInsert.push({
        proposal_id: proposalId,
        figure_id: fid,
        kind: 'bound',
        bound_row_id: r.id,
        bound_col_key: c.key,
        x,
        y,
        w,
        h,
        style: { autoFitH: true, outlineColor: 'none', fillColor: '#ADB5BD' },
      });
      // Track this row's bottom so subsequent new rows stack below it.
      const bottom = y + h;
      const cur = rowBottoms.get(r.id) ?? 0;
      if (bottom > cur) rowBottoms.set(r.id, bottom);
    }
  }


  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('impact_canvas_elements')
      .insert(toInsert as never);
    if (error) throw error;
  }

  // For full-width canvases, keep existing bound/header boxes aligned with the
  // current column count/order by updating x/w. y/h/z/style/content are left
  // untouched so user resizing is preserved.
  if (options?.layout === 'fullWidth' && existingRows.length > 0) {
    const colByKey = new Map<string, { key: string; order_index: number }>(
      cols.map((c: { key: string; order_index: number }) => [c.key, c]),
    );
    const updates: Array<{ id: string; x: number; w: number }> = [];
    for (const e of existingRows) {
      const colKey = e.bound_col_key;
      if (!colKey) continue;
      const col = colByKey.get(colKey);
      if (!col) continue;
      const targetX = colGeom.startX + columnSlot(col.order_index, options).col * (colGeom.w + colGeom.gap);
      const targetW = colGeom.w;
      if (Math.abs((e.x ?? 0) - targetX) > 0.001 || Math.abs((e.w ?? 0) - targetW) > 0.001) {
        updates.push({ id: e.id, x: targetX, w: targetW });
      }
    }
    if (updates.length > 0) {
      for (const u of updates) {
        const { error } = await supabase
          .from('impact_canvas_elements')
          .update({ x: u.x, w: u.w })
          .eq('id', u.id)
          .eq('proposal_id', proposalId);
        if (error) throw error;
      }
    }
  }

  // Header-bar backdrop — a black 18×1cm rounded rectangle behind the header
  // boxes. Only auto-created at INITIAL canvas setup: guarded by
  // "no existing bound/header elements before this sync". After the user
  // deletes it, subsequent syncs (add column/row) will find existing headers
  // and skip re-adding — the shape stays deleted. It is a normal shape
  // element: repositionable, resizable, restylable, deletable.
  if (existingRows.length === 0 && cols.length > 0) {
    const { error } = await supabase.from('impact_canvas_elements').insert({
      proposal_id: proposalId,
      figure_id: fid,
      kind: 'shape',
      x: 0,
      y: 0,
      w: CANVAS_WIDTH_CM,
      h: 1,
      z: -1000, // behind headers (which default to z=0)
      content: { shape: 'roundedRect', html: '' },
      style: { fillColor: '#000000', outlineColor: 'none' },
    } as never);
    if (error) throw error;
  }

  // Banded canvases: one header backdrop per band. Band 0 adopts the legacy
  // untagged backdrop (so existing canvases are not duplicated); further bands
  // get their own tagged shape. If the user deleted every backdrop, none are
  // recreated. Vertical placement is handled by the banded reflow.
  const cpb = options?.columnsPerBand ?? 0;
  if (cpb > 0 && cols.length > 0) {
    const canvasWidth = options?.canvasWidthCm ?? CANVAS_WIDTH_CM;
    const nBands = Math.max(1, Math.ceil(cols.length / cpb));
    const { data: shapes, error: shapeErr } = await scope(
      supabase
        .from('impact_canvas_elements')
        .select('id, x, y, w, h, z, style')
        .eq('proposal_id', proposalId)
        .eq('kind', 'shape'),
    );
    if (shapeErr) throw shapeErr;
    const shapeRows = (shapes ?? []) as Array<{ id: string; y: number; w: number; z: number; style: unknown }>;
    const tagged = new Map<number, string>();
    for (const s of shapeRows) {
      const st = (s.style ?? {}) as Record<string, unknown>;
      if (typeof st.bandBackdrop === 'number') tagged.set(st.bandBackdrop, s.id);
    }
    let legacy: (typeof shapeRows)[number] | undefined;
    if (!tagged.has(0)) {
      legacy = shapeRows.find((s) => {
        const st = (s.style ?? {}) as Record<string, unknown>;
        return (
          typeof st.bandBackdrop !== 'number' &&
          Math.abs((s.w ?? 0) - canvasWidth) < 0.5 &&
          String(st.fillColor ?? '').toLowerCase() === '#000000'
        );
      });
      if (legacy) {
        const st = { ...((legacy.style ?? {}) as Record<string, unknown>), bandBackdrop: 0 };
        const { error } = await supabase
          .from('impact_canvas_elements')
          .update({ style: st } as never)
          .eq('id', legacy.id);
        if (error) throw error;
        tagged.set(0, legacy.id);
      }
    }
    if (tagged.size > 0) {
      const template = shapeRows.find((s) => s.id === tagged.get(0)) ?? legacy;
      for (let band = 1; band < nBands; band++) {
        if (tagged.has(band)) continue;
        const baseStyle = { ...((template?.style ?? {}) as Record<string, unknown>) };
        const { error } = await supabase.from('impact_canvas_elements').insert({
          proposal_id: proposalId,
          figure_id: fid,
          kind: 'shape',
          x: 0,
          y: 0,
          w: canvasWidth,
          h: 1,
          z: template?.z ?? -1000,
          content: { shape: 'roundedRect', html: '' },
          style: { fillColor: '#000000', outlineColor: 'none', ...baseStyle, bandBackdrop: band },
        } as never);
        if (error) throw error;
      }
    }
  }
}



