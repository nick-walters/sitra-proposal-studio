import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { useImpactCanvasColumns, useImpactCanvasRows } from '@/hooks/useImpactCanvas';
import { IMPACT_CANVAS_VIEWPORT, IMPACT_CANVAS_HEADER_HEIGHT } from '@/lib/impactCanvasLayout';

interface Props {
  proposalId: string;
  canEdit: boolean;
  className?: string;
}

/**
 * Interactive freeform editor for the Impact Canvas figure page (Phase 2a-3).
 *
 * Mirrors the read-only ImpactCanvasFreeformRenderer layout math (same
 * 1000×600 logical viewport, same aspect-ratio wrapper), and adds:
 *   - single-select on click
 *   - hand-rolled pointer drag to reposition bound boxes
 *   - 8 resize handles (corners + edges)
 *   - debounced optimistic persistence of x/y/w/h to impact_canvas_elements
 *
 * TEXT stays authoritative in impact_canvas_rows — bound boxes only carry
 * their mirrored cell HTML read-only. Free elements are untouched here.
 */

const CELL_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'span', 'svg', 'path'],
  ALLOWED_ATTR: [
    'class', 'style', 'contenteditable',
    'width', 'height', 'viewBox', 'xmlns', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linejoin',
  ],
  ALLOW_DATA_ATTR: true,
};
const sanitize = (html: string) => DOMPurify.sanitize(html || '', CELL_SANITIZE_CONFIG);

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
}

const EMPTY_ELS: CanvasElement[] = [];
const ELS_KEY = (pid: string) => ['impact-canvas-elements', pid];

const MIN_W = 60;
const MIN_H = 40;

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type DragMode = { kind: 'move' } | { kind: 'resize'; handle: Handle };

interface DragState {
  id: string;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startBox: { x: number; y: number; w: number; h: number };
  wrapperRect: DOMRect;
}

export function ImpactCanvasFreeformEditor({ proposalId, canEdit, className }: Props) {
  const qc = useQueryClient();
  const { columns, isLoading: colsLoading } = useImpactCanvasColumns(proposalId);
  const { rows, isLoading: rowsLoading } = useImpactCanvasRows(proposalId);

  const { data: fetched = EMPTY_ELS, isLoading: elsLoading } = useQuery({
    queryKey: ELS_KEY(proposalId),
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('impact_canvas_elements')
        .select('id, kind, bound_row_id, bound_col_key, x, y, w, h, z')
        .eq('proposal_id', proposalId)
        .order('z');
      if (error) throw error;
      return (data ?? []) as CanvasElement[];
    },
  });

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Optimistic overrides for coords in-flight (per element id). */
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const pendingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Deselect on outside pointerdown — but keep clicks inside the wrapper,
  // toolbar, radix portals, and dialogs from clearing selection.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          '[data-impact-canvas-editor-surface],[data-impact-canvas-toolbar],[data-radix-popper-content-wrapper],[role="menu"],[role="dialog"]',
        )
      ) {
        return;
      }
      setSelectedId(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  const persistDebounced = useCallback(
    (id: string, box: { x: number; y: number; w: number; h: number }) => {
      const existing = pendingTimers.current[id];
      if (existing) clearTimeout(existing);
      pendingTimers.current[id] = setTimeout(async () => {
        delete pendingTimers.current[id];
        const { error } = await supabase
          .from('impact_canvas_elements')
          .update({ x: box.x, y: box.y, w: box.w, h: box.h })
          .eq('id', id);
        if (error) {
          // Rollback and refetch on failure.
          setOverrides((o) => {
            const n = { ...o };
            delete n[id];
            return n;
          });
          qc.invalidateQueries({ queryKey: ELS_KEY(proposalId) });
        } else {
          // Fold the override into the cache and clear it.
          qc.setQueryData<CanvasElement[]>(ELS_KEY(proposalId), (old) =>
            (old || []).map((e) => (e.id === id ? { ...e, ...box } : e)),
          );
          setOverrides((o) => {
            const n = { ...o };
            delete n[id];
            return n;
          });
        }
      }, 250);
    },
    [proposalId, qc],
  );

  useEffect(() => {
    return () => {
      Object.values(pendingTimers.current).forEach(clearTimeout);
      pendingTimers.current = {};
    };
  }, []);

  const beginDrag = (e: React.PointerEvent, id: string, mode: DragMode, current: { x: number; y: number; w: number; h: number }) => {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSelectedId(id);
    setDrag({
      id,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBox: current,
      wrapperRect: wrapper.getBoundingClientRect(),
    });
  };

  useEffect(() => {
    if (!drag) return;
    const { width: VW, height: VH } = IMPACT_CANVAS_VIEWPORT;

    const onMove = (ev: PointerEvent) => {
      const rect = drag.wrapperRect;
      const pxPerUnitX = rect.width / VW;
      const pxPerUnitY = rect.height / VH;
      const dx = (ev.clientX - drag.startClientX) / pxPerUnitX;
      const dy = (ev.clientY - drag.startClientY) / pxPerUnitY;

      let { x, y, w, h } = drag.startBox;
      if (drag.mode.kind === 'move') {
        x = drag.startBox.x + dx;
        y = drag.startBox.y + dy;
      } else {
        const handle = drag.mode.handle;
        if (handle.includes('e')) w = drag.startBox.w + dx;
        if (handle.includes('s')) h = drag.startBox.h + dy;
        if (handle.includes('w')) {
          w = drag.startBox.w - dx;
          x = drag.startBox.x + dx;
        }
        if (handle.includes('n')) {
          h = drag.startBox.h - dy;
          y = drag.startBox.y + dy;
        }
        // Min-size guard, preserving anchor edges for w/n handles.
        if (w < MIN_W) {
          if (handle.includes('w')) x -= MIN_W - w;
          w = MIN_W;
        }
        if (h < MIN_H) {
          if (handle.includes('n')) y -= MIN_H - h;
          h = MIN_H;
        }
      }
      // Clamp inside viewport.
      w = Math.min(w, VW);
      h = Math.min(h, VH);
      x = Math.max(0, Math.min(x, VW - w));
      y = Math.max(0, Math.min(y, VH - h));

      setOverrides((o) => ({ ...o, [drag.id]: { x, y, w, h } }));
    };
    const onUp = () => {
      const finalBox = overridesRef.current[drag.id];
      if (finalBox) persistDebounced(drag.id, finalBox);
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, persistDebounced]);

  // Ref mirror so pointerup handler sees latest overrides without re-binding.
  const overridesRef = useRef(overrides);
  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  const columnOrder = useMemo(
    () => columns.slice().sort((a, b) => a.order_index - b.order_index),
    [columns],
  );
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const boundEls = useMemo(
    () => fetched.filter((e) => e.kind === 'bound' && e.bound_row_id && e.bound_col_key),
    [fetched],
  );

  if (colsLoading || rowsLoading || elsLoading) {
    return <div className={className ?? 'p-4 text-xs text-muted-foreground'}>Loading impact canvas…</div>;
  }
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

  const { width: VW, height: VH } = IMPACT_CANVAS_VIEWPORT;
  const pctX = (x: number) => `${(x / VW) * 100}%`;
  const pctY = (y: number) => `${(y / VH) * 100}%`;
  const paddingPct = `${(VH / VW) * 100}%`;

  const colW = VW / columnOrder.length;

  return (
    <div
      ref={wrapperRef}
      className={className}
      data-impact-canvas-editor-surface
      data-impact-canvas-graphic="true"
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        fontFamily: '"Times New Roman", Times, serif',
        userSelect: drag ? 'none' : undefined,
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        // Empty-canvas click clears selection.
        if (e.target === e.currentTarget) setSelectedId(null);
      }}
    >
      <div style={{ paddingBottom: paddingPct }} />

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
            pointerEvents: 'none',
          }}
        >
          {c.heading}
        </div>
      ))}

      {boundEls.map((el) => {
        const row = rowById.get(el.bound_row_id!);
        const html = (row?.content?.[el.bound_col_key!] as string) || '';
        const ov = overrides[el.id];
        const box = ov ?? { x: el.x, y: el.y, w: el.w, h: el.h };
        const selected = selectedId === el.id;
        return (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              left: pctX(box.x),
              top: pctY(box.y),
              width: pctX(box.w),
              height: pctY(box.h),
              zIndex: el.z + (selected ? 1000 : 0),
              padding: '2pt',
              boxSizing: 'border-box',
              cursor: canEdit ? (drag?.id === el.id && drag.mode.kind === 'move' ? 'grabbing' : 'grab') : 'default',
            }}
            onPointerDown={(e) => beginDrag(e, el.id, { kind: 'move' }, box)}
          >
            <div
              className="prose prose-sm max-w-none"
              style={{
                width: '100%',
                height: '100%',
                border: selected ? '2px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
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
                pointerEvents: 'none',
              }}
            >
              <div
                style={{ width: '100%' }}
                dangerouslySetInnerHTML={{ __html: sanitize(html) }}
              />
            </div>

            {selected && canEdit && HANDLES.map((h) => (
              <div
                key={h}
                onPointerDown={(e) => beginDrag(e, el.id, { kind: 'resize', handle: h }, box)}
                style={{
                  position: 'absolute',
                  width: 10,
                  height: 10,
                  background: 'hsl(var(--primary))',
                  border: '1px solid white',
                  borderRadius: 2,
                  zIndex: 2,
                  cursor: HANDLE_CURSOR[h],
                  ...handleStyle(h),
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
};

function handleStyle(h: Handle): React.CSSProperties {
  const off = -5;
  const mid = 'calc(50% - 5px)';
  switch (h) {
    case 'nw': return { left: off, top: off };
    case 'n':  return { left: mid, top: off };
    case 'ne': return { right: off, top: off };
    case 'e':  return { right: off, top: mid };
    case 'se': return { right: off, bottom: off };
    case 's':  return { left: mid, bottom: off };
    case 'sw': return { left: off, bottom: off };
    case 'w':  return { left: off, top: mid };
  }
}
