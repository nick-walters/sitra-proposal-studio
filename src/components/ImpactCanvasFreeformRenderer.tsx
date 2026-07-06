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

      {/* Free line elements — shared SVG overlay used by editor + B2.1 + PDF + PNG. */}
      <ImpactCanvasLinesOverlay VW={VW} VH={VH} elements={elements as unknown as LineElement[]} />
    </div>
  );
}

// ─── Line element rendering ──────────────────────────────────────────────
// Shared by the editor + read-only renderer (used in B2.1/PDF/PNG). Stage 1:
// read-only. No selection/drag yet — that is Stage 2.

export interface LinePoint { x: number; y: number }
export interface LineContent {
  routing: 'straight' | 'elbow';
  arrow: 'none' | 'end' | 'both';
  from: LinePoint;
  to: LinePoint;
  elbow?: { axis: 'h' | 'v'; at: number };
}
export interface LineStyle {
  outlineColor?: string;
  outlineWidth?: number; // pt
}
export interface LineElement {
  id: string;
  kind: string;
  x: number; y: number; w: number; h: number; z: number;
  content: LineContent;
  style: LineStyle;
}

/** Retract an endpoint toward the segment origin by `size` along `dir`. */
export function retractPoint(endpoint: LinePoint, dir: LinePoint, size: number): LinePoint {
  const len = Math.hypot(dir.x, dir.y) || 1;
  return { x: endpoint.x - (dir.x / len) * size, y: endpoint.y - (dir.y / len) * size };
}

/** Points-string for an arrowhead polygon whose TIP is `tip`, oriented along `dir`. */
export function arrowPolyPoints(tip: LinePoint, dir: LinePoint, size: number): string {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  const px = -uy;
  const py = ux;
  const baseX = tip.x - ux * size;
  const baseY = tip.y - uy * size;
  const half = size * 0.55;
  return `${tip.x},${tip.y} ${baseX + px * half},${baseY + py * half} ${baseX - px * half},${baseY - py * half}`;
}

/** Compute the elbow bend point for an L-shaped connector.
 *  HV routing (first leg horizontal) when |dx| >= |dy|, else VH. */
export function computeElbowBend(
  from: LinePoint,
  to: LinePoint,
  override?: { axis: 'h' | 'v'; at: number },
): { bend: LinePoint; legDir: LinePoint } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const axis: 'h' | 'v' = override?.axis ?? (Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v');
  if (axis === 'h') {
    const at = override?.at ?? from.x + dx / 2;
    const bend = { x: at, y: from.y };
    // Path: from → (at, from.y) → (at, to.y) → to. Final leg is (at,to.y)→to (horizontal).
    // But traditional HV routing goes: from → (at, from.y) → (at, to.y) → to would have
    // TWO bends. Single-bend HV = from → (to.x, from.y) → to; final leg vertical.
    return { bend: { x: to.x, y: from.y }, legDir: { x: 0, y: to.y - from.y } };
  }
  // VH single-bend: from → (from.x, to.y) → to; final leg horizontal.
  return { bend: { x: from.x, y: to.y }, legDir: { x: to.x - from.x, y: 0 } };
}

/** Axis-aligned bounding box of a line's endpoints (with minimum footprint). */
export function computeLineBBox(from: LinePoint, to: LinePoint): { x: number; y: number; w: number; h: number } {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const w = Math.max(0.1, Math.abs(to.x - from.x));
  const h = Math.max(0.1, Math.abs(to.y - from.y));
  return { x, y, w, h };
}

const PT_PER_CM = 28.3465;

export function ImpactCanvasLinesOverlay({
  VW,
  VH,
  elements,
}: {
  VW: number;
  VH: number;
  elements: ReadonlyArray<LineElement>;
}) {
  const lines = elements.filter((e) => e.kind === 'line');
  if (lines.length === 0) return null;
  return (
    <svg
      data-impact-canvas-lines
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        // Above bound/text/shape stacking (which use el.z, typically < 1000).
        zIndex: 900,
      }}
    >
      {lines.map((el) => (
        <LineShape key={el.id} el={el} />
      ))}
    </svg>
  );
}

function LineShape({ el }: { el: LineElement }) {
  const c = el.content ?? ({} as LineContent);
  const from = c.from ?? { x: 0, y: 0 };
  const to = c.to ?? { x: 0, y: 0 };
  const routing = c.routing ?? 'straight';
  const arrow = c.arrow ?? 'none';
  const color = el.style?.outlineColor ?? '#000';
  const widthPt = el.style?.outlineWidth ?? 1.5;
  const widthCm = widthPt / PT_PER_CM;
  const headSize = Math.max(0.15, widthCm * 4);

  // Determine the segment directions at each end for arrowheads + retract.
  let endDir: LinePoint;
  let startDir: LinePoint;
  let bendPoint: LinePoint | null = null;
  if (routing === 'elbow') {
    const { bend, legDir } = computeElbowBend(from, to, c.elbow);
    bendPoint = bend;
    endDir = legDir;
    // Start-side direction = first leg vector (from → bend).
    startDir = { x: from.x - bend.x, y: from.y - bend.y };
  } else {
    endDir = { x: to.x - from.x, y: to.y - from.y };
    startDir = { x: from.x - to.x, y: from.y - to.y };
  }

  const hasEndHead = arrow === 'end' || arrow === 'both';
  const hasStartHead = arrow === 'both';
  const endTip = to;
  const startTip = from;
  const endDraw = hasEndHead ? retractPoint(to, endDir, headSize) : to;
  const startDraw = hasStartHead ? retractPoint(from, startDir, headSize) : from;

  const d = routing === 'elbow' && bendPoint
    ? `M ${startDraw.x} ${startDraw.y} L ${bendPoint.x} ${bendPoint.y} L ${endDraw.x} ${endDraw.y}`
    : `M ${startDraw.x} ${startDraw.y} L ${endDraw.x} ${endDraw.y}`;

  const strokeVisible = color && color !== 'none';
  return (
    <g>
      {strokeVisible && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={widthCm}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
      )}
      {strokeVisible && hasEndHead && (
        <polygon points={arrowPolyPoints(endTip, endDir, headSize)} fill={color} stroke="none" />
      )}
      {strokeVisible && hasStartHead && (
        <polygon points={arrowPolyPoints(startTip, startDir, headSize)} fill={color} stroke="none" />
      )}
    </g>
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
