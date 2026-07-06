import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { useImpactCanvasColumns, useImpactCanvasRows } from '@/hooks/useImpactCanvas';
import { IMPACT_CANVAS_VIEWPORT, IMPACT_CANVAS_HEADER_HEIGHT } from '@/lib/impactCanvasLayout';

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

  // Fallback: pre-backfill proposals with no bound elements fall back to
  // a legacy CSS grid layout so the canvas is never blank.
  if (boundEls.length === 0 && textEls.length === 0 && fallback === 'grid') {
    return <LegacyGridFallback proposalId={proposalId} className={className} />;
  }


  const rowById = new Map(rows.map((r) => [r.id, r]));
  const { width: VW, height: VH } = IMPACT_CANVAS_VIEWPORT;
  const pctX = (x: number) => `${(x / VW) * 100}%`;
  const pctY = (y: number) => `${(y / VH) * 100}%`;
  const paddingPct = `${(600 / 1000) * 100}%`; // aspect-ratio spacer

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
            height: pctY(IMPACT_CANVAS_HEADER_HEIGHT),
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
                border: '1px solid hsl(var(--border))',
                borderRadius: 6,
                background: 'hsl(var(--muted) / 0.3)',
                padding: '2pt',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                overflow: 'hidden',
                fontSize: 12,
                lineHeight: 1.3,
                color: '#000',
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
    </div>
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
