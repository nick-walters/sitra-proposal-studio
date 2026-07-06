import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { PaintBucket, Trash2, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useImpactCanvasColumns, useImpactCanvasRows } from '@/hooks/useImpactCanvas';
import {
  CANVAS_WIDTH_CM,
  HEADER_HEIGHT_CM,
  MIN_ELEMENT_W_CM,
  MIN_ELEMENT_H_CM,
  computeCanvasHeightCm,
} from '@/lib/impactCanvasLayout';
import { WPColorPicker } from './WPColorPicker';
import { BOUND_STYLE_DEFAULTS, readBoundStyle, resolveBoundStyle } from '@/lib/impactCanvasBoundStyle';
import type { BoundBoxStyle } from '@/lib/impactCanvasBoundStyle';
import { ImpactCanvasTextBox } from './ImpactCanvasTextBox';
import { ImpactCanvasOutlinePicker } from './ImpactCanvasOutlinePicker';

interface Props {
  proposalId: string;
  canEdit: boolean;
  className?: string;
}

/**
 * Interactive freeform editor for the Impact Canvas figure page
 * (Phase 2a-3 bound boxes + Phase 2b-1 free text boxes).
 *
 * Bound boxes: drag/resize only (text is table-authoritative).
 * Free text boxes (kind='text'): add/edit(minimal TipTap)/drag/resize/delete.
 *
 * Focus/outside-click coordination — the document-level pointerdown handler
 * ignores clicks that land inside the canvas surface, radix portals, or the
 * active text-box editor (data-impact-canvas-textbox-editor). Clicking on
 * another element on the surface commits the currently-editing text box
 * (its editor blurs -> onCommit fires) but keeps canvas selection alive.
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
  content: unknown;
  style: unknown;
}

const EMPTY_ELS: CanvasElement[] = [];
const ELS_KEY = (pid: string) => ['impact-canvas-elements', pid];

const MIN_W = MIN_ELEMENT_W_CM;
const MIN_H = MIN_ELEMENT_H_CM;

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
        .select('id, kind, bound_row_id, bound_col_key, x, y, w, h, z, content, style')
        .eq('proposal_id', proposalId)
        .order('z');
      if (error) throw error;
      return (data ?? []) as CanvasElement[];
    },
  });

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Optimistic overrides for coords in-flight (per element id). */
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  /** Optimistic overrides for text content (per element id). */
  const [contentOverrides, setContentOverrides] = useState<Record<string, string>>({});
  const pendingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingContentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingStyleTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /** Optimistic overrides for style (per element id). */
  const [styleOverrides, setStyleOverrides] = useState<Record<string, BoundBoxStyle>>({});

  // Deselect on outside pointerdown — but keep clicks inside the surface,
  // toolbar, radix portals, dialogs, and the ACTIVE text-box editor from
  // clearing selection / interrupting edit mode.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          '[data-impact-canvas-editor-surface],[data-impact-canvas-toolbar],[data-impact-canvas-textbox-editor],[data-radix-popper-content-wrapper],[role="menu"],[role="dialog"]',
        )
      ) {
        return;
      }
      setSelectedId(null);
      setEditingId(null);
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
          setOverrides((o) => {
            const n = { ...o };
            delete n[id];
            return n;
          });
          qc.invalidateQueries({ queryKey: ELS_KEY(proposalId) });
        } else {
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

  const persistContentDebounced = useCallback(
    (id: string, html: string) => {
      const existing = pendingContentTimers.current[id];
      if (existing) clearTimeout(existing);
      pendingContentTimers.current[id] = setTimeout(async () => {
        delete pendingContentTimers.current[id];
        const { error } = await supabase
          .from('impact_canvas_elements')
          .update({ content: { html } })
          .eq('id', id);
        if (error) {
          setContentOverrides((o) => {
            const n = { ...o };
            delete n[id];
            return n;
          });
          qc.invalidateQueries({ queryKey: ELS_KEY(proposalId) });
        } else {
          qc.setQueryData<CanvasElement[]>(ELS_KEY(proposalId), (old) =>
            (old || []).map((e) => (e.id === id ? { ...e, content: { html } } : e)),
          );
          setContentOverrides((o) => {
            const n = { ...o };
            delete n[id];
            return n;
          });
        }
      }, 300);
    },
    [proposalId, qc],
  );

  const persistStyleDebounced = useCallback(
    (id: string, style: BoundBoxStyle) => {
      const existing = pendingStyleTimers.current[id];
      if (existing) clearTimeout(existing);
      pendingStyleTimers.current[id] = setTimeout(async () => {
        delete pendingStyleTimers.current[id];
        const { error } = await supabase
          .from('impact_canvas_elements')
          .update({ style: style as never })
          .eq('id', id);
        if (error) {
          setStyleOverrides((o) => {
            const n = { ...o };
            delete n[id];
            return n;
          });
          qc.invalidateQueries({ queryKey: ELS_KEY(proposalId) });
        } else {
          qc.setQueryData<CanvasElement[]>(ELS_KEY(proposalId), (old) =>
            (old || []).map((e) => (e.id === id ? { ...e, style } : e)),
          );
          setStyleOverrides((o) => {
            const n = { ...o };
            delete n[id];
            return n;
          });
        }
      }, 250);
    },
    [proposalId, qc],
  );

  const updateBoundStyle = useCallback(
    (id: string, patch: Partial<BoundBoxStyle>) => {
      if (!canEdit) return;
      const el = fetched.find((e) => e.id === id);
      const current = { ...readBoundStyle(el?.style), ...(styleOverrides[id] ?? {}) };
      const next = { ...current, ...patch };
      setStyleOverrides((o) => ({ ...o, [id]: next }));
      persistStyleDebounced(id, next);
    },
    [canEdit, fetched, styleOverrides, persistStyleDebounced],
  );

  useEffect(() => {
    return () => {
      Object.values(pendingTimers.current).forEach(clearTimeout);
      Object.values(pendingContentTimers.current).forEach(clearTimeout);
      Object.values(pendingStyleTimers.current).forEach(clearTimeout);
      pendingTimers.current = {};
      pendingContentTimers.current = {};
      pendingStyleTimers.current = {};
    };
  }, []);

  const beginDrag = (
    e: React.PointerEvent,
    id: string,
    mode: DragMode,
    current: { x: number; y: number; w: number; h: number },
  ) => {
    if (!canEdit) return;
    if (editingId === id) return; // never drag while editing text
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
        if (w < MIN_W) {
          if (handle.includes('w')) x -= MIN_W - w;
          w = MIN_W;
        }
        if (h < MIN_H) {
          if (handle.includes('n')) y -= MIN_H - h;
          h = MIN_H;
        }
      }
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
  const textEls = useMemo(() => fetched.filter((e) => e.kind === 'text'), [fetched]);
  const maxZ = useMemo(
    () => fetched.reduce((m, e) => (e.z > m ? e.z : m), 0),
    [fetched],
  );

  const addTextBox = useCallback(async () => {
    if (!canEdit) return;
    const { width: VW, height: VH } = IMPACT_CANVAS_VIEWPORT;
    const w = 220;
    const h = 60;
    const insertBox = {
      proposal_id: proposalId,
      kind: 'text',
      x: Math.round((VW - w) / 2),
      y: Math.round((VH - h) / 2),
      w,
      h,
      z: maxZ + 1,
      content: { html: '' },
      style: {},
    };
    const { data, error } = await supabase
      .from('impact_canvas_elements')
      .insert(insertBox)
      .select('id, kind, bound_row_id, bound_col_key, x, y, w, h, z, content, style')
      .single();
    if (error || !data) {
      qc.invalidateQueries({ queryKey: ELS_KEY(proposalId) });
      return;
    }
    qc.setQueryData<CanvasElement[]>(ELS_KEY(proposalId), (old) => [
      ...(old || []),
      data as CanvasElement,
    ]);
    setSelectedId(data.id);
    setEditingId(data.id);
  }, [canEdit, maxZ, proposalId, qc]);

  const deleteElement = useCallback(
    async (id: string) => {
      if (!canEdit) return;
      // Optimistic removal
      const prev = qc.getQueryData<CanvasElement[]>(ELS_KEY(proposalId));
      qc.setQueryData<CanvasElement[]>(ELS_KEY(proposalId), (old) =>
        (old || []).filter((e) => e.id !== id),
      );
      setSelectedId((s) => (s === id ? null : s));
      setEditingId((s) => (s === id ? null : s));
      const { error } = await supabase.from('impact_canvas_elements').delete().eq('id', id);
      if (error) {
        if (prev) qc.setQueryData(ELS_KEY(proposalId), prev);
      }
    },
    [canEdit, proposalId, qc],
  );

  // Keyboard: Delete/Backspace on selected free text box removes it.
  useEffect(() => {
    if (!selectedId || editingId) return;
    const el = fetched.find((e) => e.id === selectedId);
    if (!el || el.kind !== 'text') return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA'].includes(t.tagName))) return;
      ev.preventDefault();
      void deleteElement(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, editingId, fetched, deleteElement]);

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
    <div className="space-y-2">
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Bound-box style controls appear FIRST when a bound box is selected. */}
          {selectedId && boundEls.some((b) => b.id === selectedId) && (
            <BoundStyleToolbar
              proposalId={proposalId}
              canEdit={canEdit}
              style={{
                ...readBoundStyle(boundEls.find((b) => b.id === selectedId)?.style),
                ...(styleOverrides[selectedId] ?? {}),
              }}
              onChange={(patch) => updateBoundStyle(selectedId, patch)}
            />
          )}

          {/*
            Element-adding cluster.
            Reserved order (left→right): shapes, lines/arrows, text box.
            Only the text-box button exists for now — placed at the end of the
            cluster so future shape/line/arrow buttons slot in cleanly before it.
          */}
          <div className="flex items-center gap-1" data-impact-canvas-adders>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTextBox}
              className="h-8 px-2 py-1"
              data-impact-canvas-toolbar
            >
              <Type className="w-4 h-4 mr-1" /> Text box
            </Button>
          </div>

          {selectedId && textEls.some((t) => t.id === selectedId) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-8 px-2"
              onClick={() => void deleteElement(selectedId)}
              data-impact-canvas-toolbar
            >
              <Trash2 className="w-4 h-4 mr-1" /> Delete text box
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            Double-click a text box to edit. Delete / Backspace removes the selected box.
          </span>
        </div>
      )}

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
          const target = e.target as HTMLElement | null;
          // Clicking anywhere on the surface that is NOT inside the currently-
          // editing text box's editor commits (exits edit mode). This coexists
          // with the document-level outside-click clear: that handler ignores
          // clicks inside the surface, so we handle intra-surface commits here.
          if (editingId && target && !target.closest('[data-impact-canvas-textbox-editor]')) {
            setEditingId(null);
          }
          if (e.target === e.currentTarget) {
            setSelectedId(null);
            setEditingId(null);
          }
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
          const styleSrc = styleOverrides[el.id] ?? el.style;
          const bs = resolveBoundStyle(styleSrc);
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
                  borderStyle: 'solid',
                  borderColor: selected ? 'hsl(var(--primary))' : bs.borderColor,
                  borderWidth: selected
                    ? `${Math.max(1.5, bs.borderWidth)}pt`
                    : bs.borderWidth ? `${bs.borderWidth}pt` : 0,
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
                  pointerEvents: 'none',
                }}
              >
                <div style={{ width: '100%' }} dangerouslySetInnerHTML={{ __html: sanitize(html) }} />
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

        {textEls.map((el) => {
          const ov = overrides[el.id];
          const box = ov ?? { x: el.x, y: el.y, w: el.w, h: el.h };
          const selected = selectedId === el.id;
          const editing = editingId === el.id;
          const raw = (el.content ?? {}) as { html?: string };
          const html = contentOverrides[el.id] ?? (raw.html || '');
          const style = (el.style ?? {}) as { fontSize?: number; textAlign?: 'left' | 'center' | 'right' | 'justify' };
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
                cursor: canEdit
                  ? editing
                    ? 'text'
                    : drag?.id === el.id && drag.mode.kind === 'move'
                    ? 'grabbing'
                    : 'grab'
                  : 'default',
              }}
              onPointerDown={(e) => {
                if (editing) return;
                beginDrag(e, el.id, { kind: 'move' }, box);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!canEdit) return;
                if (selectedId !== el.id) {
                  setSelectedId(el.id);
                  return;
                }
                if (!editing) setEditingId(el.id);
              }}
              onDoubleClick={(e) => {
                if (!canEdit) return;
                e.stopPropagation();
                setSelectedId(el.id);
                setEditingId(el.id);
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  border: editing
                    ? '2px dashed hsl(var(--primary))'
                    : selected
                    ? '2px solid hsl(var(--primary))'
                    : '1px dashed hsl(var(--border))',
                  borderRadius: 4,
                  background: editing ? 'hsl(var(--background))' : 'transparent',
                  padding: '2pt',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  fontSize: style.fontSize ?? 12,
                  lineHeight: 1.3,
                  color: '#000',
                  textAlign: style.textAlign ?? 'left',
                }}
              >
                {editing ? (
                  <ImpactCanvasTextBox
                    html={html}
                    editing
                    autoFocus
                    onChange={(next) => {
                      setContentOverrides((o) => ({ ...o, [el.id]: next }));
                      persistContentDebounced(el.id, next);
                    }}
                    onCommit={() => {
                      setEditingId((cur) => (cur === el.id ? null : cur));
                    }}
                  />
                ) : (
                  <div
                    className="prose prose-sm max-w-none"
                    style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
                    dangerouslySetInnerHTML={{ __html: sanitize(html) }}
                  />
                )}
              </div>

              {selected && !editing && canEdit && HANDLES.map((h) => (
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
    </div>
  );
}

interface BoundStyleToolbarProps {
  proposalId: string;
  canEdit: boolean;
  style: BoundBoxStyle;
  onChange: (patch: Partial<BoundBoxStyle>) => void;
}

/**
 * MS-Office-style style toolbar: paint-bucket Fill (with "No fill"),
 * combined Outline dropdown (colour + preset widths, with "No outline"),
 * and an "A"-with-underline Font colour picker.
 */
function BoundStyleToolbar({ proposalId, canEdit, style, onChange }: BoundStyleToolbarProps) {
  const width = style.outlineWidth ?? BOUND_STYLE_DEFAULTS.outlineWidth;
  const fill = style.fillColor ?? '#F5F5F5';
  const outline = style.outlineColor ?? '#CCCCCC';
  const font = style.fontColor ?? BOUND_STYLE_DEFAULTS.fontColor;

  const fillIsNone = fill === 'none';
  const fillIndicator = fillIsNone ? 'transparent' : fill;

  return (
    <div className="flex items-center gap-1 pr-2 border-r" data-impact-canvas-toolbar>
      {/* Fill — paint bucket icon + current-fill indicator */}
      <WPColorPicker
        color={fillIsNone ? '#FFFFFF' : fill}
        onChange={(c) => onChange({ fillColor: c })}
        disabled={!canEdit}
        proposalId={proposalId}
        canManageCustom={canEdit}
        label="Fill colour"
        onRemove={() => onChange({ fillColor: 'none' })}
        removeLabel="No fill"
        trigger={
          <button
            type="button"
            disabled={!canEdit}
            className="inline-flex flex-col items-center justify-center h-8 w-9 rounded-md border bg-background hover:bg-accent transition-colors disabled:opacity-50"
            title="Fill"
            aria-label="Fill colour"
          >
            <PaintBucket className="w-4 h-4 -mb-0.5" strokeWidth={1.75} />
            <div
              className="mt-[2px] rounded-sm"
              style={{
                height: 3,
                width: 16,
                background: fillIndicator,
                boxShadow: fillIsNone ? 'inset 0 0 0 1px rgba(0,0,0,0.4)' : undefined,
                backgroundImage: fillIsNone
                  ? 'linear-gradient(to top right, transparent 45%, #E11D48 45%, #E11D48 55%, transparent 55%)'
                  : undefined,
              }}
            />
          </button>
        }
      />

      {/* Outline — combined colour + width dropdown */}
      <ImpactCanvasOutlinePicker
        color={outline}
        width={width}
        proposalId={proposalId}
        disabled={!canEdit}
        onColorChange={(c) => onChange({ outlineColor: c })}
        onWidthChange={(w) => onChange({ outlineWidth: w })}
      />

      {/* Font colour — "A" with coloured underline */}
      <WPColorPicker
        color={font}
        onChange={(c) => onChange({ fontColor: c })}
        disabled={!canEdit}
        proposalId={proposalId}
        canManageCustom={canEdit}
        label="Font colour"
        trigger={
          <button
            type="button"
            disabled={!canEdit}
            className="inline-flex flex-col items-center justify-center h-8 w-9 rounded-md border bg-background hover:bg-accent transition-colors disabled:opacity-50"
            title="Font colour"
            aria-label="Font colour"
          >
            <span
              className="text-[15px] font-semibold leading-none"
              style={{ fontFamily: 'Georgia, serif', color: '#111' }}
            >
              A
            </span>
            <div className="mt-[2px] rounded-sm" style={{ height: 3, width: 16, background: font }} />
          </button>
        }
      />
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
