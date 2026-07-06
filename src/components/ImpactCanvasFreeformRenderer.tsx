import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { useImpactCanvasColumns, useImpactCanvasRows } from '@/hooks/useImpactCanvas';
import { CANVAS_WIDTH_CM, HEADER_HEIGHT_CM, computeCanvasHeightCm } from '@/lib/impactCanvasLayout';
import { ImpactCanvasShape, type ShapeKind } from './ImpactCanvasShape';
import { resolveBoundStyle } from '@/lib/impactCanvasBoundStyle';

interface Props {
  proposalId: string;
  className?: string;
  /** When true, render the current grid look via bound elements (default).
   *  If no bound elements exist, we fall back to a legacy CSS grid so the
   *  canvas never appears empty for pre-backfill proposals. */
  fallback?: 'grid' | 'empty';
}

/**
 * Cell HTML sanitiser — preserves cross-reference badge markup produced
 * by the WP/Case/Inline TipTap nodes (data-* attrs, inline styles,
 * contenteditable="false", SVG pentagon for deliverable badges).
 * Shared with the legacy grid renderer.
 */
const CELL_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'span', 'svg', 'path'],
  ALLOWED_ATTR: [
    'class', 'style', 'contenteditable',
    'width', 'height', 'viewBox', 'xmlns', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linejoin',
  ],
  ALLOW_DATA_ATTR: true,
};

function sanitize(html: string) {
  return DOMPurify.sanitize(html || '', CELL_SANITIZE_CONFIG);
}

interface CanvasElement {
  id: string;
  kind: string;
  bound_row_id: string | null;
  bound_col_key: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  content: unknown;
  style: unknown;
}

const EMPTY_ELS: CanvasElement[] = [];

function useImpactCanvasElements(proposalId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['impact-canvas-elements', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('impact_canvas_elements')
        .select('id, kind, bound_row_id, bound_col_key, x, y, w, h, z, content, style')
        .eq('proposal_id', proposalId)
        .order('z');
      if (error) throw error;
      return (data ?? []) as CanvasElement[];
    },
  });


  // Refresh when upstream reference data changes (badges baked into cells).
  useEffect(() => {
    if (!proposalId) return;
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['impact-canvas-elements', proposalId] });
    };
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [proposalId, qc]);

  return { elements: q.data ?? EMPTY_ELS, isLoading: q.isLoading };
}

/**
 * ImpactCanvasFreeformRenderer — read-only freeform renderer (Phase 2a-2).
 *
 * Layout model:
 *   - A relative wrapper with an aspect-ratio spacer keeps a fixed
 *     logical viewport (IMPACT_CANVAS_VIEWPORT) regardless of parent width.
 *   - overflow:hidden so out-of-bounds elements can't inflate the box.
 *   - Every element is absolutely positioned as a % of the viewport, so
 *     the layout scales identically on screen, in PDF, and in PNG capture.
 *
 * Header model: column headers occupy the top IMPACT_CANVAS_HEADER_HEIGHT
 * band of the viewport at equal widths — matching the default-position
 * helper so bound elements line up under their headers.
 *
 * Word export is UNCHANGED: swapImpactCanvasForWord targets the wrapper
 * via data-impact-canvas-graphic="true" and rebuilds a semantic <table>
 * from columns + rows (layout ignored).
 */
export function ImpactCanvasFreeformRenderer({ proposalId, className, fallback = 'grid' }: Props) {
  const { columns, isLoading: colsLoading } = useImpactCanvasColumns(proposalId);
  const { rows, isLoading: rowsLoading } = useImpactCanvasRows(proposalId);
  const { elements, isLoading: elsLoading } = useImpactCanvasElements(proposalId);

  if (colsLoading || rowsLoading || elsLoading) {
    return <div className={className ?? 'p-4 text-xs text-muted-foreground'}>Loading impact canvas…</div>;
  }

  const columnOrder = columns.slice().sort((a, b) => a.order_index - b.order_index);

  if (columnOrder.length === 0) {
    return (
      <p className={`${className ?? ''} text-xs text-muted-foreground italic py-6 text-center`}>
        No columns defined.
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className={`${className ?? ''} text-xs text-muted-foreground italic py-6 text-center`}>
        No rows yet.
      </p>
    );
  }

  const boundEls = elements.filter(
    (e) => e.kind === 'bound' && e.bound_row_id && e.bound_col_key,
  );
  const textEls = elements.filter((e) => e.kind === 'text');
  const shapeEls = elements.filter((e) => e.kind === 'shape');

  // Fallback: pre-backfill proposals with no bound elements fall back to
  // a legacy CSS grid layout so the canvas is never blank.
  if (boundEls.length === 0 && textEls.length === 0 && shapeEls.length === 0 && fallback === 'grid') {
    return <LegacyGridFallback proposalId={proposalId} className={className} />;
  }


  const rowById = new Map(rows.map((r) => [r.id, r]));
  const VW = CANVAS_WIDTH_CM;
  const VH = computeCanvasHeightCm([...boundEls, ...textEls, ...shapeEls]);
  const pctX = (x: number) => `${(x / VW) * 100}%`;
  const pctY = (y: number) => `${(y / VH) * 100}%`;
  const paddingPct = `${(VH / VW) * 100}%`;

  const colW = VW / columnOrder.length;

  return (
    <div
      className={className}
      data-impact-canvas-graphic="true"
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        fontFamily: '"Times New Roman", Times, serif',
      }}
    >
      {/* aspect-ratio spacer (60% == 600/1000) */}
      <div style={{ paddingBottom: paddingPct }} />

      {/* Column headers — fixed top band */}
      {columnOrder.map((c, ci) => (
        <div
          key={`h-${c.id}`}
          style={{
            position: 'absolute',
            left: pctX(ci * colW),
            top: pctY(0),
            width: pctX(colW),
            height: pctY(HEADER_HEIGHT_CM),
            padding: '0 4px 4px 0',
            display: 'flex',
            alignItems: 'center',
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: 11,
            fontWeight: 700,
            color: '#000',
            whiteSpace: 'pre-line',
            textAlign: 'left',
            lineHeight: 1.15,
          }}
        >
          {c.heading}
        </div>
      ))}

      {/* Bound elements */}
      {boundEls.map((el) => {
        const row = rowById.get(el.bound_row_id!);
        const html = (row?.content?.[el.bound_col_key!] as string) || '';
        const bs = resolveBoundStyle(el.style);
        return (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              left: pctX(el.x),
              top: pctY(el.y),
              width: pctX(el.w),
              height: pctY(el.h),
              zIndex: el.z,
              padding: '2pt',
              boxSizing: 'border-box',
            }}
          >
            <div
              className="prose prose-sm max-w-none"
              style={{
                width: '100%',
                height: '100%',
                borderStyle: 'solid',
                borderColor: bs.borderColor,
                borderWidth: bs.borderWidth ? `${bs.borderWidth}pt` : 0,
                borderRadius: 6,
                background: bs.background,
                padding: '2pt',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                overflow: 'hidden',
                fontSize: 12,
                lineHeight: 1.3,
                color: bs.color,
              }}
            >
              <div
                style={{ width: '100%' }}
                dangerouslySetInnerHTML={{ __html: sanitize(html) }}
              />
            </div>
          </div>
        );
      })}

      {/* Free text-box elements — read-only rendering. */}
      {textEls.map((el) => {
        const content = (el.content ?? {}) as { html?: string };
        const style = (el.style ?? {}) as {
          fontSize?: number;
          textAlign?: 'left' | 'center' | 'right' | 'justify';
        };
        return (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              left: pctX(el.x),
              top: pctY(el.y),
              width: pctX(el.w),
              height: pctY(el.h),
              zIndex: el.z,
              padding: '2pt',
              boxSizing: 'border-box',
              fontSize: style.fontSize ?? 12,
              lineHeight: 1.3,
              color: '#000',
              textAlign: style.textAlign ?? 'left',
              overflow: 'hidden',
            }}
          >
            <div
              className="prose prose-sm max-w-none"
              style={{ width: '100%', height: '100%' }}
              dangerouslySetInnerHTML={{ __html: sanitize(content.html || '') }}
            />
          </div>
        );
      })}

      {/* Free shape elements — read-only rendering. */}
      {shapeEls.map((el) => {
        const content = (el.content ?? {}) as { shape?: ShapeKind; html?: string };
        const shape: ShapeKind = content.shape ?? 'rect';
        return (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              left: pctX(el.x),
              top: pctY(el.y),
              width: pctX(el.w),
              height: pctY(el.h),
              zIndex: el.z,
            }}
          >
            <ImpactCanvasShape shape={shape} styleRaw={el.style}>
              <div
                className="prose prose-sm max-w-none"
                style={{ width: '100%', textAlign: 'center' }}
                dangerouslySetInnerHTML={{ __html: sanitize(content.html || '') }}
              />
            </ImpactCanvasShape>
          </div>
        );
      })}

      {/* ── SPIKE (throwaway): verify SVG polygon arrowheads across editor / PDF / PNG.
          Remove this block + <LinesSpike/> below once verified. */}
      <LinesSpike VW={VW} VH={VH} />
    </div>
  );
}

/**
 * Throwaway spike — renders two test lines with computed polygon arrowheads
 * (NOT <marker>) so we can eyeball rendering parity across editor screen,
 * PDF export (freezeInteractiveElements) and PNG export (html2canvas).
 *
 * Two stroke-width approaches side-by-side:
 *   BLUE straight   → cm-scaled stroke-width (1.5pt → cm)
 *   RED  elbow      → vector-effect="non-scaling-stroke" + px width (1.5px)
 *
 * Delete this component + its call site after verification.
 */
export function LinesSpike({ VW, VH }: { VW: number; VH: number }) {
  // Coords in cm. Positioned in the top band so they render even on short
  // canvases; kept well away from bound headers/cells.
  const straight = { from: { x: 0.6, y: 1.6 }, to: { x: 8.4, y: 3.2 } };
  const elbow = {
    from: { x: 9.6, y: 1.6 },
    to: { x: 17.4, y: 4.6 },
  };
  // Auto bend: HV routing when |dx| >= |dy|, else VH. Bend at mid of long axis.
  const dxE = elbow.to.x - elbow.from.x;
  const dyE = elbow.to.y - elbow.from.y;
  const bend =
    Math.abs(dxE) >= Math.abs(dyE)
      ? { x: elbow.from.x + dxE / 2, y: elbow.from.y }
      : { x: elbow.from.x, y: elbow.from.y + dyE / 2 };
  const elbowMid = { x: elbow.to.x, y: bend.y };
  // Second leg direction (for arrowhead orientation): from bend to `to`.
  const legEnd = Math.abs(dxE) >= Math.abs(dyE) ? { x: elbow.to.x, y: bend.y } : bend;
  const elbowPath = `M ${elbow.from.x} ${elbow.from.y} L ${bend.x} ${bend.y} L ${elbowMid.x} ${elbowMid.y} L ${elbow.to.x} ${elbow.to.y}`;

  // Stroke widths.
  const STROKE_PT = 1.5;
  const strokeCm = STROKE_PT / 28.3465; // ≈ 0.053 cm — used by BLUE path

  // Arrowhead polygon (in cm) — isosceles triangle at tip, base perpendicular
  // to segment direction. Size scaled to a visible ~4× stroke, min 0.15 cm.
  const headSize = Math.max(0.15, strokeCm * 4);
  const arrowPoly = (
    tip: { x: number; y: number },
    dir: { x: number; y: number },
    size: number,
  ) => {
    const len = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / len;
    const uy = dir.y / len;
    const px = -uy;
    const py = ux;
    const baseX = tip.x - ux * size;
    const baseY = tip.y - uy * size;
    const half = size * 0.55;
    const a = { x: baseX + px * half, y: baseY + py * half };
    const b = { x: baseX - px * half, y: baseY - py * half };
    return `${tip.x},${tip.y} ${a.x},${a.y} ${b.x},${b.y}`;
  };

  const straightDir = { x: straight.to.x - straight.from.x, y: straight.to.y - straight.from.y };
  const elbowDir =
    Math.abs(dxE) >= Math.abs(dyE)
      ? { x: 0, y: elbow.to.y - bend.y } // final leg is vertical in HV routing
      : { x: elbow.to.x - bend.x, y: 0 }; // final leg is horizontal in VH routing

  return (
    <svg
      data-impact-canvas-lines-spike
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 999 }}
    >
      {/* BLUE — straight, cm-scaled stroke */}
      <line
        x1={straight.from.x}
        y1={straight.from.y}
        x2={straight.to.x}
        y2={straight.to.y}
        stroke="#1D4ED8"
        strokeWidth={strokeCm}
        strokeLinecap="butt"
      />
      <polygon
        points={arrowPoly(straight.to, straightDir, headSize)}
        fill="#1D4ED8"
        stroke="none"
      />
      {/* Also drop a two-way head at the start of the straight line */}
      <polygon
        points={arrowPoly(
          straight.from,
          { x: -straightDir.x, y: -straightDir.y },
          headSize,
        )}
        fill="#1D4ED8"
        stroke="none"
      />

      {/* RED — elbow, non-scaling-stroke px width */}
      <path
        d={elbowPath}
        fill="none"
        stroke="#DC2626"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
      <polygon
        points={arrowPoly(elbow.to, elbowDir, headSize)}
        fill="#DC2626"
        stroke="none"
      />

      {/* Tiny legend text (cm coords) so PDF/PNG capture is self-labelling */}
      <text x={0.6} y={0.8} fontSize={0.35} fill="#1D4ED8" fontFamily="Arial, sans-serif">
        spike: BLUE straight (cm stroke)
      </text>
      <text x={9.6} y={0.8} fontSize={0.35} fill="#DC2626" fontFamily="Arial, sans-serif">
        spike: RED elbow (px non-scaling)
      </text>
    </svg>
  );
}



/**
 * Legacy CSS-grid renderer used as a safety fallback when a proposal has
 * no bound elements (pre-backfill). Kept in-file so callers only import
 * one component. Retains data-impact-canvas-graphic so Word swap works.
 */
function LegacyGridFallback({ proposalId, className }: { proposalId: string; className?: string }) {
  const { columns } = useImpactCanvasColumns(proposalId);
  const { rows } = useImpactCanvasRows(proposalId);
  const columnOrder = columns.slice().sort((a, b) => a.order_index - b.order_index);

  return (
    <div
      className={`${className ?? ''} grid gap-2 font-['Times_New_Roman',Times,serif]`}
      style={{ gridTemplateColumns: `repeat(${columnOrder.length}, minmax(0, 1fr))` }}
      data-impact-canvas-graphic="true"
    >
      {columnOrder.map((c) => (
        <div
          key={`h-${c.id}`}
          className="text-[11px] font-bold text-black text-left pb-1 whitespace-pre-line flex items-center"
          style={{ fontFamily: '"Arial Black", Arial, sans-serif' }}
        >
          {c.heading}
        </div>
      ))}
      {rows.map((row) =>
        columnOrder.map((c) => (
          <div
            key={`${row.id}-${c.id}`}
            className="border border-border rounded-md bg-muted/30 min-h-[80px] text-xs flex items-center"
            style={{ padding: '2pt' }}
          >
            <div
              className="prose prose-sm max-w-none w-full"
              dangerouslySetInnerHTML={{ __html: sanitize(row.content[c.key] || '') }}
            />
          </div>
        )),
      )}
    </div>
  );
}
