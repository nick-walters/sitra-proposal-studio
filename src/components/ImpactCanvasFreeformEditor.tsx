import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { ChevronDown, Grid3x3, Magnet, MoveRight, PaintBucket, Redo2, Trash2, Type, Undo2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { supabase } from '@/integrations/supabase/client';
import { useImpactCanvasColumns, useImpactCanvasRows } from '@/hooks/useImpactCanvas';
import {
  CANVAS_WIDTH_CM,
  CANVAS_MAX_HEIGHT_CM,
  
  MIN_ELEMENT_W_CM,
  MIN_ELEMENT_H_CM,
  DEFAULT_BOUND_H_CM,
  computeCanvasHeightCm,
} from '@/lib/impactCanvasLayout';

import { WPColorPicker } from './WPColorPicker';
import { BOUND_STYLE_DEFAULTS, readBoundStyle, resolveBoundStyle } from '@/lib/impactCanvasBoundStyle';
import type { BoundBoxStyle } from '@/lib/impactCanvasBoundStyle';
import { ImpactCanvasTextBox } from './ImpactCanvasTextBox';
import { ImpactCanvasOutlinePicker } from './ImpactCanvasOutlinePicker';
import { ImpactCanvasShape, type ShapeKind } from './ImpactCanvasShape';
import {
  ImpactCanvasLinesOverlay,
  computeLineBBox,
  computeElbowBend,
  type LineElement,
  type LineContent,
  type LinePoint,
} from './ImpactCanvasFreeformRenderer';

import { Circle as CircleIcon, Square, Squircle, Triangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';


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
type DragMode =
  | { kind: 'move' }
  | { kind: 'resize'; handle: Handle }
  | { kind: 'line-move' }
  | { kind: 'endpoint'; which: 'from' | 'to' };

interface DragState {
  id: string;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startBox: { x: number; y: number; w: number; h: number };
  /** Only for line drags — snapshot of endpoints at pointerdown so onMove
   *  can compute new absolute positions from delta without accumulating
   *  round-off. */
  startFrom?: LinePoint;
  startTo?: LinePoint;
  wrapperRect: DOMRect;
  canvasHeightCm: number;
}


/** Snap-to-grid step (matches the MINOR grid line spacing). */
const SNAP_STEP_CM = 0.2;

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
  // Editor preferences (grid overlay + snap-to-grid) — persisted in
  // localStorage so they survive reloads on the same device. Defaults: OFF
  // for both (subtle first-run: an empty canvas with no grid, snap opt-in).
  const [showGrid, setShowGrid] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('impact-canvas-show-grid') === '1';
  });
  const [snap, setSnap] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('impact-canvas-snap') === '1';
  });
  useEffect(() => {
    try { window.localStorage.setItem('impact-canvas-show-grid', showGrid ? '1' : '0'); } catch { /* ignore */ }
  }, [showGrid]);
  useEffect(() => {
    try { window.localStorage.setItem('impact-canvas-snap', snap ? '1' : '0'); } catch { /* ignore */ }
  }, [snap]);
  const snapRef = useRef(snap);
  useEffect(() => { snapRef.current = snap; }, [snap]);
  /** Optimistic overrides for coords in-flight (per element id). */
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  /** Optimistic overrides for line endpoints in-flight (per element id). */
  const [lineOverrides, setLineOverrides] = useState<Record<string, { from: LinePoint; to: LinePoint }>>({});
  const lineOverridesRef = useRef(lineOverrides);
  useEffect(() => { lineOverridesRef.current = lineOverrides; }, [lineOverrides]);

  /** Optimistic overrides for text content (per element id). */
  const [contentOverrides, setContentOverrides] = useState<Record<string, string>>({});
  const pendingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingContentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingStyleTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingBoxAbortControllers = useRef<Record<string, AbortController>>({});
  /** Optimistic overrides for style (per element id). */
  const [styleOverrides, setStyleOverrides] = useState<Record<string, BoundBoxStyle>>({});
  /** Refs to per-bound-el hidden probes used to measure natural content
   *  height for auto-fit bound boxes. */
  const probeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  /** Bumped when the wrapper resizes so the auto-fit effect re-measures. */
  const [wrapperTick, setWrapperTick] = useState(0);
  /** Monotonic guard for debounced bbox writes (drag/resize/auto-fit/lines).
   *  Incrementing it invalidates any timer or in-flight write for that element,
   *  preventing stale auto-fit completions from clearing a live drag override. */
  const pendingBoxWriteSeqRef = useRef<Record<string, number>>({});

  // ── Canvas-level UNDO/REDO (session-only, in-memory) ──────────────────
  // Per-element before/after snapshots. Add/delete carry the full element
  // (so we can re-insert with the same id on undo/redo). Update entries
  // for the same element within the same 600 ms coalesce group are merged
  // (drag / style click / cm-field typing / etc.) — one gesture = one step.
  // History resets on reload; text-editor (TipTap) keystrokes are NOT
  // captured here — a committed text change (edit exit) pushes ONE step.
  type ElementSnapshot = {
    x: number; y: number; w: number; h: number;
    z?: number;
    content: unknown; style: unknown;
  };
  type HistoryEntry =
    | { kind: 'update'; id: string; before: ElementSnapshot; after: ElementSnapshot; group?: string; ts: number }
    | { kind: 'add'; element: CanvasElement }
    | { kind: 'delete'; element: CanvasElement };
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const suppressHistoryRef = useRef(false);
  const [, setHistoryTick] = useState(0);
  const bumpHistory = () => setHistoryTick((t) => t + 1);
  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  /** Snapshot captured at drag start so onUp can build the update entry. */
  const dragBeforeRef = useRef<{ id: string; snap: ElementSnapshot } | null>(null);
  /** Snapshot captured when a text/shape enters edit mode; on commit we
   *  compare and push ONE update entry if the html actually changed. */
  const textEditBeforeRef = useRef<{ id: string; snap: ElementSnapshot } | null>(null);

  // Build a snapshot of an element's current visible state (fetched values
  // overlaid with any pending optimistic overrides).
  const snapshotOfElRef = useRef<(el: CanvasElement) => ElementSnapshot>(() => ({
    x: 0, y: 0, w: 0, h: 0, content: null, style: null,
  }));
  const snapshotOfEl = useCallback(
    (el: CanvasElement): ElementSnapshot => snapshotOfElRef.current(el),
    [],
  );

  const pushHistory = useCallback((entry: HistoryEntry, group?: string) => {
    if (suppressHistoryRef.current) return;
    const stack = undoStackRef.current;
    const last = stack[stack.length - 1];
    const now = Date.now();
    if (
      entry.kind === 'update' &&
      last?.kind === 'update' &&
      group &&
      last.group === group &&
      last.id === entry.id &&
      now - last.ts < 600
    ) {
      last.after = entry.after;
      last.ts = now;
    } else {
      if (entry.kind === 'update') {
        entry.ts = now;
        entry.group = group;
      }
      stack.push(entry);
      if (stack.length > 200) stack.shift();
    }
    redoStackRef.current = [];
    bumpHistory();
  }, []);




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
      const seq = (pendingBoxWriteSeqRef.current[id] ?? 0) + 1;
      pendingBoxWriteSeqRef.current[id] = seq;
      pendingTimers.current[id] = setTimeout(async () => {
        delete pendingTimers.current[id];
        pendingBoxAbortControllers.current[id]?.abort();
        const controller = new AbortController();
        pendingBoxAbortControllers.current[id] = controller;
        const { error } = await supabase
          .from('impact_canvas_elements')
          .update({ x: box.x, y: box.y, w: box.w, h: box.h })
          .eq('id', id)
          .abortSignal(controller.signal);
        if (pendingBoxAbortControllers.current[id] === controller) {
          delete pendingBoxAbortControllers.current[id];
        }
        if (pendingBoxWriteSeqRef.current[id] !== seq || controller.signal.aborted) return;
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

  /** Persist a line drag: writes both bbox (x/y/w/h) and content
   *  (merged with existing content — preserves routing/arrow/elbow) in
   *  a single supabase update. Used by endpoint + line-move drags. */
  const persistLineDebounced = useCallback(
    (id: string, box: { x: number; y: number; w: number; h: number }, endpoints: { from: LinePoint; to: LinePoint }) => {
      const existing = pendingTimers.current[id];
      if (existing) clearTimeout(existing);
      const seq = (pendingBoxWriteSeqRef.current[id] ?? 0) + 1;
      pendingBoxWriteSeqRef.current[id] = seq;
      pendingTimers.current[id] = setTimeout(async () => {
        delete pendingTimers.current[id];
        pendingBoxAbortControllers.current[id]?.abort();
        const controller = new AbortController();
        pendingBoxAbortControllers.current[id] = controller;
        const current = qc.getQueryData<CanvasElement[]>(ELS_KEY(proposalId)) || [];
        const el = current.find((e) => e.id === id);
        const prevContent = (el?.content ?? {}) as Record<string, unknown>;
        const nextContent = { ...prevContent, from: endpoints.from, to: endpoints.to };
        const { error } = await supabase
          .from('impact_canvas_elements')
          .update({ x: box.x, y: box.y, w: box.w, h: box.h, content: nextContent as never })
          .eq('id', id)
          .abortSignal(controller.signal);
        if (pendingBoxAbortControllers.current[id] === controller) {
          delete pendingBoxAbortControllers.current[id];
        }
        if (pendingBoxWriteSeqRef.current[id] !== seq || controller.signal.aborted) return;
        if (error) {
          setOverrides((o) => { const n = { ...o }; delete n[id]; return n; });
          setLineOverrides((o) => { const n = { ...o }; delete n[id]; return n; });
          qc.invalidateQueries({ queryKey: ELS_KEY(proposalId) });
        } else {
          qc.setQueryData<CanvasElement[]>(ELS_KEY(proposalId), (old) =>
            (old || []).map((e) => (e.id === id ? { ...e, ...box, content: nextContent } : e)),
          );
          setOverrides((o) => { const n = { ...o }; delete n[id]; return n; });
          setLineOverrides((o) => { const n = { ...o }; delete n[id]; return n; });
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
        // Preserve any existing content fields (notably `shape` for shape elements)
        // by merging into the current cached content instead of replacing it.
        const current = qc.getQueryData<CanvasElement[]>(ELS_KEY(proposalId)) || [];
        const el = current.find((e) => e.id === id);
        const prevContent = (el?.content ?? {}) as Record<string, unknown>;
        const nextContent = { ...prevContent, html };
        const { error } = await supabase
          .from('impact_canvas_elements')
          .update({ content: nextContent as never })
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
            (old || []).map((e) => (e.id === id ? { ...e, content: nextContent } : e)),
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
      if (!el) return;
      const before = snapshotOfEl(el);
      const current = { ...readBoundStyle(el.style), ...(styleOverrides[id] ?? {}) };
      const next = { ...current, ...patch };
      setStyleOverrides((o) => ({ ...o, [id]: next }));
      persistStyleDebounced(id, next);
      const after: ElementSnapshot = { ...before, style: next };
      pushHistory({ kind: 'update', id, before, after, ts: Date.now() }, `style:${id}`);
    },
    [canEdit, fetched, styleOverrides, persistStyleDebounced, snapshotOfEl, pushHistory],
  );


  useEffect(() => {
    return () => {
      Object.values(pendingTimers.current).forEach(clearTimeout);
      Object.values(pendingContentTimers.current).forEach(clearTimeout);
      Object.values(pendingStyleTimers.current).forEach(clearTimeout);
      Object.values(pendingBoxAbortControllers.current).forEach((controller) => controller.abort());
      pendingTimers.current = {};
      pendingContentTimers.current = {};
      pendingStyleTimers.current = {};
      pendingBoxAbortControllers.current = {};
    };
  }, []);

  // Keep the snapshot builder ref up-to-date with current overrides so the
  // forward-declared snapshotOfEl (used by mutations declared above) always
  // sees the latest optimistic state.
  snapshotOfElRef.current = (el: CanvasElement): ElementSnapshot => {
    const ov = overrides[el.id];
    const so = styleOverrides[el.id];
    const co = contentOverrides[el.id];
    const contentBase = (el.content ?? {}) as Record<string, unknown>;
    const content = co !== undefined ? { ...contentBase, html: co } : el.content;
    const styleBase = readBoundStyle(el.style);
    const style = so !== undefined ? { ...styleBase, ...so } : el.style;
    return {
      x: ov?.x ?? el.x,
      y: ov?.y ?? el.y,
      w: ov?.w ?? el.w,
      h: ov?.h ?? el.h,
      z: el.z,
      content,
      style,
    };
  };


  const writeSnapshot = useCallback(
    async (id: string, snap: ElementSnapshot) => {
      setOverrides((o) => { if (!(id in o)) return o; const n = { ...o }; delete n[id]; return n; });
      setStyleOverrides((o) => { if (!(id in o)) return o; const n = { ...o }; delete n[id]; return n; });
      setContentOverrides((o) => { if (!(id in o)) return o; const n = { ...o }; delete n[id]; return n; });
      qc.setQueryData<CanvasElement[]>(ELS_KEY(proposalId), (old) =>
        (old || []).map((e) =>
          e.id === id
            ? { ...e, x: snap.x, y: snap.y, w: snap.w, h: snap.h, z: snap.z ?? e.z, content: snap.content, style: snap.style }
            : e,
        ),
      );
      const { error } = await supabase
        .from('impact_canvas_elements')
        .update({
          x: snap.x, y: snap.y, w: snap.w, h: snap.h,
          ...(snap.z !== undefined ? { z: snap.z } : {}),
          content: snap.content as never, style: snap.style as never,
        })
        .eq('id', id);
      if (error) qc.invalidateQueries({ queryKey: ELS_KEY(proposalId) });
    },
    [proposalId, qc],
  );

  const reinsertElement = useCallback(
    async (el: CanvasElement) => {
      qc.setQueryData<CanvasElement[]>(ELS_KEY(proposalId), (old) => {
        const list = old || [];
        if (list.some((e) => e.id === el.id)) return list;
        return [...list, el];
      });
      const { error } = await supabase.from('impact_canvas_elements').insert({
        id: el.id,
        proposal_id: proposalId,
        kind: el.kind,
        bound_row_id: el.bound_row_id,
        bound_col_key: el.bound_col_key,
        x: el.x, y: el.y, w: el.w, h: el.h, z: el.z,
        content: el.content as never,
        style: el.style as never,
      });
      if (error) qc.invalidateQueries({ queryKey: ELS_KEY(proposalId) });
    },
    [proposalId, qc],
  );

  const removeElementById = useCallback(
    async (id: string) => {
      qc.setQueryData<CanvasElement[]>(ELS_KEY(proposalId), (old) =>
        (old || []).filter((e) => e.id !== id),
      );
      setSelectedId((s) => (s === id ? null : s));
      setEditingId((s) => (s === id ? null : s));
      const { error } = await supabase.from('impact_canvas_elements').delete().eq('id', id);
      if (error) qc.invalidateQueries({ queryKey: ELS_KEY(proposalId) });
    },
    [proposalId, qc],
  );

  const undo = useCallback(async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    redoStackRef.current.push(entry);
    bumpHistory();
    suppressHistoryRef.current = true;
    try {
      if (entry.kind === 'update') await writeSnapshot(entry.id, entry.before);
      else if (entry.kind === 'add') await removeElementById(entry.element.id);
      else if (entry.kind === 'delete') await reinsertElement(entry.element);
    } finally {
      suppressHistoryRef.current = false;
    }
  }, [writeSnapshot, removeElementById, reinsertElement]);

  const redo = useCallback(async () => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    undoStackRef.current.push(entry);
    bumpHistory();
    suppressHistoryRef.current = true;
    try {
      if (entry.kind === 'update') await writeSnapshot(entry.id, entry.after);
      else if (entry.kind === 'add') await reinsertElement(entry.element);
      else if (entry.kind === 'delete') await removeElementById(entry.element.id);
    } finally {
      suppressHistoryRef.current = false;
    }
  }, [writeSnapshot, removeElementById, reinsertElement]);

  // Keyboard: Ctrl/Cmd+Z / Shift+Z / Ctrl+Y for canvas undo/redo — but only
  // when focus is NOT inside a text editor / input / textarea, so TipTap's
  // own text undo keeps handling typing keystrokes.
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA'].includes(t.tagName))) return;
      if (!(ev.metaKey || ev.ctrlKey)) return;
      const key = ev.key.toLowerCase();
      if (key === 'z' && !ev.shiftKey) { ev.preventDefault(); void undo(); }
      else if ((key === 'z' && ev.shiftKey) || key === 'y') { ev.preventDefault(); void redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, undo, redo]);


  const canvasHeightCmRef = useRef(CANVAS_MAX_HEIGHT_CM);

  // Refs for values referenced inside the drag lifecycle so that listeners
  // attached synchronously in beginDrag always see fresh values without
  // depending on effect deps / re-attachment.
  const fetchedRef = useRef(fetched);
  useEffect(() => { fetchedRef.current = fetched; }, [fetched]);
  const styleOverridesRef = useRef(styleOverrides);
  useEffect(() => { styleOverridesRef.current = styleOverrides; }, [styleOverrides]);
  const persistDebouncedRef = useRef(persistDebounced);
  useEffect(() => { persistDebouncedRef.current = persistDebounced; }, [persistDebounced]);
  const persistLineDebouncedRef = useRef(persistLineDebounced);
  useEffect(() => { persistLineDebouncedRef.current = persistLineDebounced; }, [persistLineDebounced]);
  const persistStyleDebouncedRef = useRef(persistStyleDebounced);
  useEffect(() => { persistStyleDebouncedRef.current = persistStyleDebounced; }, [persistStyleDebounced]);
  const pushHistoryRef = useRef(pushHistory);
  useEffect(() => { pushHistoryRef.current = pushHistory; }, [pushHistory]);

  /** Suppress the next React synthetic click on this element id — set when a
   *  drag was activated so the trailing click doesn't toggle text-edit mode
   *  on shapes/textboxes. */
  const suppressNextClickRef = useRef<string | null>(null);

  /** Minimum pointer travel (CSS px) before a press converts into a drag.
   *  Below the threshold, pointerup is treated as a click → select only. */
  const DRAG_THRESHOLD_PX = 4;

  const beginDrag = (
    e: React.PointerEvent,
    id: string,
    mode: DragMode,
    current: { x: number; y: number; w: number; h: number },
    lineStart?: { from: LinePoint; to: LinePoint },
  ) => {
    if (!canEdit) return;
    if (editingId === id) return; // never drag while editing text
    if (e.button !== 0) return;
    e.stopPropagation();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Selection happens immediately on press — click alone must select.
    setSelectedId(id);
    if (editingId && editingId !== id) setEditingId(null);

    const target = e.currentTarget as Element;
    const pointerId = e.pointerId;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const wrapperRect = wrapper.getBoundingClientRect();
    const canvasHeightCm = canvasHeightCmRef.current;

    // Activation state. We attach the window listeners RIGHT NOW so that
    // even the immediate pointerup of a bare click is caught. The drag is
    // only "activated" (setDrag, snapshot for undo, cancel pending auto-fit
    // writes, capture pointer) once movement exceeds the threshold.
    let activated = false;
    let localDrag: DragState | null = null;
    let latestBox: { x: number; y: number; w: number; h: number } | null = null;
    let latestLine: { from: LinePoint; to: LinePoint } | null = null;

    const activate = () => {
      if (activated) return;
      activated = true;
      // Cancel/invalidate any in-flight auto-fit write for this id — see the
      // pendingBoxWriteSeqRef guard elsewhere in this component.
      const existingTimer = pendingTimers.current[id];
      if (existingTimer) {
        clearTimeout(existingTimer);
        delete pendingTimers.current[id];
      }
      pendingBoxAbortControllers.current[id]?.abort();
      delete pendingBoxAbortControllers.current[id];
      pendingBoxWriteSeqRef.current[id] = (pendingBoxWriteSeqRef.current[id] ?? 0) + 1;

      // Capture on the stable outer draggable (never an inner element that
      // React might remount mid-gesture).
      try { target.setPointerCapture?.(pointerId); } catch { /* ignore */ }

      // Suppress native text selection for the duration of the drag/resize.
      // Without this the browser accumulates a text range under the pointer,
      // which flashes as highlighted canvas text on pointerup.
      try {
        document.body.style.userSelect = 'none';
        (document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = 'none';
      } catch { /* ignore */ }
      try { window.getSelection()?.removeAllRanges(); } catch { /* ignore */ }

      const el = fetchedRef.current.find((x) => x.id === id);
      if (el) dragBeforeRef.current = { id, snap: snapshotOfEl(el) };
      localDrag = {
        id,
        mode,
        startClientX,
        startClientY,
        startBox: current,
        startFrom: lineStart?.from,
        startTo: lineStart?.to,
        wrapperRect,
        canvasHeightCm,
      };
      setDrag(localDrag);
    };

    const VW = CANVAS_WIDTH_CM;
    const VH_CM = CANVAS_MAX_HEIGHT_CM;

    const runMove = (ev: PointerEvent) => {
      if (!localDrag) return;
      const rect = localDrag.wrapperRect;
      const pxPerCmX = rect.width / VW;
      const pxPerCmY = (rect.height || (rect.width * (localDrag.canvasHeightCm / VW))) / localDrag.canvasHeightCm;
      const dxRaw = (ev.clientX - localDrag.startClientX) / pxPerCmX;
      const dyRaw = (ev.clientY - localDrag.startClientY) / pxPerCmY;
      const snapTo = (v: number) => Math.round(v / SNAP_STEP_CM) * SNAP_STEP_CM;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

      if (localDrag.mode.kind === 'endpoint' || localDrag.mode.kind === 'line-move') {
        const startFrom = localDrag.startFrom!;
        const startTo = localDrag.startTo!;
        let newFrom = { ...startFrom };
        let newTo = { ...startTo };
        if (localDrag.mode.kind === 'endpoint') {
          if (localDrag.mode.which === 'from') {
            newFrom = { x: startFrom.x + dxRaw, y: startFrom.y + dyRaw };
            if (snapRef.current) { newFrom.x = snapTo(newFrom.x); newFrom.y = snapTo(newFrom.y); }
            newFrom.x = clamp(newFrom.x, 0, VW);
            newFrom.y = clamp(newFrom.y, 0, VH_CM);
          } else {
            newTo = { x: startTo.x + dxRaw, y: startTo.y + dyRaw };
            if (snapRef.current) { newTo.x = snapTo(newTo.x); newTo.y = snapTo(newTo.y); }
            newTo.x = clamp(newTo.x, 0, VW);
            newTo.y = clamp(newTo.y, 0, VH_CM);
          }
        } else {
          const minX = Math.min(startFrom.x, startTo.x);
          const maxX = Math.max(startFrom.x, startTo.x);
          const minY = Math.min(startFrom.y, startTo.y);
          const maxY = Math.max(startFrom.y, startTo.y);
          let tx = clamp(dxRaw, -minX, VW - maxX);
          let ty = clamp(dyRaw, -minY, VH_CM - maxY);
          if (snapRef.current) { tx = snapTo(tx); ty = snapTo(ty); }
          newFrom = { x: startFrom.x + tx, y: startFrom.y + ty };
          newTo = { x: startTo.x + tx, y: startTo.y + ty };
        }
        const bbox = computeLineBBox(newFrom, newTo);
        latestBox = bbox;
        latestLine = { from: newFrom, to: newTo };
        setLineOverrides((o) => ({ ...o, [localDrag!.id]: { from: newFrom, to: newTo } }));
        setOverrides((o) => ({ ...o, [localDrag!.id]: bbox }));
        return;
      }

      let { x, y, w, h } = localDrag.startBox;
      if (localDrag.mode.kind === 'move') {
        x = localDrag.startBox.x + dxRaw;
        y = localDrag.startBox.y + dyRaw;
      } else if (localDrag.mode.kind === 'resize') {
        const handle = localDrag.mode.handle;
        if (handle.includes('e')) w = localDrag.startBox.w + dxRaw;
        if (handle.includes('s')) h = localDrag.startBox.h + dyRaw;
        if (handle.includes('w')) { w = localDrag.startBox.w - dxRaw; x = localDrag.startBox.x + dxRaw; }
        if (handle.includes('n')) { h = localDrag.startBox.h - dyRaw; y = localDrag.startBox.y + dyRaw; }
        if (w < MIN_W) { if (handle.includes('w')) x -= MIN_W - w; w = MIN_W; }
        if (h < MIN_H) { if (handle.includes('n')) y -= MIN_H - h; h = MIN_H; }
      }

      if (snapRef.current) {
        if (localDrag.mode.kind === 'move') { x = snapTo(x); y = snapTo(y); }
        else if (localDrag.mode.kind === 'resize') {
          const handle = localDrag.mode.handle;
          if (handle.includes('e')) w = Math.max(MIN_W, snapTo(w));
          if (handle.includes('s')) h = Math.max(MIN_H, snapTo(h));
          if (handle.includes('w')) {
            const right = localDrag.startBox.x + localDrag.startBox.w;
            x = Math.min(right - MIN_W, snapTo(x));
            w = right - x;
          }
          if (handle.includes('n')) {
            const bottom = localDrag.startBox.y + localDrag.startBox.h;
            y = Math.min(bottom - MIN_H, snapTo(y));
            h = bottom - y;
          }
        }
      }
      w = Math.min(w, VW);
      h = Math.min(h, VH_CM);
      x = Math.max(0, Math.min(x, VW - w));
      y = Math.max(0, Math.min(y, VH_CM - h));
      latestBox = { x, y, w, h };
      setOverrides((o) => ({ ...o, [localDrag!.id]: { x, y, w, h } }));
    };

    const onMove = (ev: PointerEvent) => {
      if (!activated) {
        const dx = ev.clientX - startClientX;
        const dy = ev.clientY - startClientY;
        if ((dx * dx + dy * dy) < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        activate();
      }
      runMove(ev);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    const onUp = (_ev: PointerEvent) => {
      cleanup();
      try { target.releasePointerCapture?.(pointerId); } catch { /* ignore */ }
      if (activated) {
        // Restore text selection and clear any range the drag accumulated.
        try {
          document.body.style.userSelect = '';
          (document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = '';
        } catch { /* ignore */ }
        try { window.getSelection()?.removeAllRanges(); } catch { /* ignore */ }
      }
      if (!activated) {
        // Pure click — no movement. Selection was already applied at press.
        dragBeforeRef.current = null;
        setDrag(null);
        return;
      }
      // Suppress the trailing React synthetic click so it doesn't toggle
      // text-edit mode after a move.
      suppressNextClickRef.current = id;
      window.setTimeout(() => {
        if (suppressNextClickRef.current === id) suppressNextClickRef.current = null;
      }, 0);

      const dragId = localDrag!.id;
      const finalBox = latestBox ?? overridesRef.current[dragId];
      const finalLine = latestLine ?? lineOverridesRef.current[dragId];
      const isLineDrag = localDrag!.mode.kind === 'endpoint' || localDrag!.mode.kind === 'line-move';

      if (isLineDrag && finalBox && finalLine) {
        persistLineDebouncedRef.current(dragId, finalBox, finalLine);
      } else if (finalBox) {
        persistDebouncedRef.current(dragId, finalBox);
      }

      let styleAfter: BoundBoxStyle | null = null;
      if (
        localDrag!.mode.kind === 'resize' &&
        finalBox &&
        Math.abs(finalBox.h - localDrag!.startBox.h) > 1e-4
      ) {
        const el = fetchedRef.current.find((e) => e.id === dragId);
        if (el && el.kind === 'bound') {
          const cur = { ...readBoundStyle(el.style), ...(styleOverridesRef.current[dragId] ?? {}) };
          if (cur.autoFitH !== false) {
            const next = { ...cur, autoFitH: false };
            setStyleOverrides((o) => ({ ...o, [dragId]: next }));
            persistStyleDebouncedRef.current(dragId, next);
            styleAfter = next;
          }
        }
      }

      const beforeSnap = dragBeforeRef.current?.snap;
      const gestureId = dragBeforeRef.current?.id;
      dragBeforeRef.current = null;
      if (beforeSnap && gestureId === dragId && finalBox) {
        const boxChanged =
          Math.abs(beforeSnap.x - finalBox.x) > 1e-4 ||
          Math.abs(beforeSnap.y - finalBox.y) > 1e-4 ||
          Math.abs(beforeSnap.w - finalBox.w) > 1e-4 ||
          Math.abs(beforeSnap.h - finalBox.h) > 1e-4;
        const contentChanged =
          isLineDrag && finalLine
            ? JSON.stringify(((beforeSnap.content ?? {}) as LineContent).from) !== JSON.stringify(finalLine.from) ||
              JSON.stringify(((beforeSnap.content ?? {}) as LineContent).to) !== JSON.stringify(finalLine.to)
            : false;
        if (boxChanged || styleAfter || contentChanged) {
          const afterContent = isLineDrag && finalLine
            ? { ...(beforeSnap.content as LineContent), from: finalLine.from, to: finalLine.to }
            : beforeSnap.content;
          const after: ElementSnapshot = {
            ...beforeSnap,
            x: finalBox.x, y: finalBox.y, w: finalBox.w, h: finalBox.h,
            style: styleAfter ?? beforeSnap.style,
            content: afterContent,
          };
          pushHistoryRef.current({ kind: 'update', id: dragId, before: beforeSnap, after, ts: Date.now() });
        }
      }
      setDrag(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };


  const overridesRef = useRef(overrides);
  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  // Watch wrapper for size changes → re-run auto-fit measurement.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWrapperTick((t) => t + 1));
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);




  const columnOrder = useMemo(
    () => columns.slice().sort((a, b) => a.order_index - b.order_index),
    [columns],
  );
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const columnByKey = useMemo(() => new Map(columnOrder.map((c) => [c.key, c])), [columnOrder]);
  const boundEls = useMemo(
    () => fetched.filter((e) => e.kind === 'bound' && e.bound_row_id && e.bound_col_key),
    [fetched],
  );
  const headerEls = useMemo(
    () => fetched.filter((e) => e.kind === 'header' && e.bound_col_key),
    [fetched],
  );
  const textEls = useMemo(() => fetched.filter((e) => e.kind === 'text'), [fetched]);
  const shapeEls = useMemo(() => fetched.filter((e) => e.kind === 'shape'), [fetched]);
  const lineEls = useMemo(() => fetched.filter((e) => e.kind === 'line'), [fetched]);

  /** Line elements merged with any in-flight overrides (bbox + endpoints)
   *  so the shared overlay + interactive layer stay in sync during drag. */
  const lineElsMerged = useMemo(() => {
    return lineEls.map((el) => {
      const ov = overrides[el.id];
      const lov = lineOverrides[el.id];
      const contentBase = (el.content ?? {}) as LineContent;
      const content = lov ? { ...contentBase, from: lov.from, to: lov.to } : contentBase;
      const box = ov ?? { x: el.x, y: el.y, w: el.w, h: el.h };
      return { ...el, ...box, content } as CanvasElement;
    });
  }, [lineEls, overrides, lineOverrides]);


  // Auto-fit height: for every bound box with style.autoFitH !== false,
  // measure the natural content height from its hidden probe and grow the
  // stored h (never below DEFAULT_BOUND_H_CM). Manual resize / cm-H entry
  // sets autoFitH=false and skips this box.
  const autoFitSignature = boundEls
    .map((el) => {
      const bs = readBoundStyle(styleOverrides[el.id] ?? el.style);
      if (bs.autoFitH === false) return '';
      const row = rowById.get(el.bound_row_id!);
      const html = (row?.content?.[el.bound_col_key!] as string) || '';
      return `${el.id}:${el.w.toFixed(3)}:${html.length}:${html.slice(0, 80)}`;
    })
    .join('|');

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rectW = wrapper.getBoundingClientRect().width;
    if (!rectW) return;
    const pxPerCm = rectW / CANVAS_WIDTH_CM;
    // Approx vertical padding inside the visible box: 2pt outer + 2pt inner
    // per side ≈ 8pt total → ~0.28 cm.
    const V_PAD_CM = 8 / 28.3465;
    for (const el of boundEls) {
      // Suspend auto-fit for the element currently being dragged — writing a
      // new height mid-gesture would clobber the drag override and can also
      // trigger DOM churn that breaks pointer capture.
      if (drag?.id === el.id) continue;
      const bs = readBoundStyle(styleOverrides[el.id] ?? el.style);
      if (bs.autoFitH === false) continue;
      const probe = probeRefs.current[el.id];
      if (!probe) continue;
      const naturalPx = probe.offsetHeight;
      if (!naturalPx) continue;
      const targetH = Math.max(
        DEFAULT_BOUND_H_CM,
        Math.round(((naturalPx / pxPerCm) + V_PAD_CM) * 100) / 100,
      );
      const cur = overridesRef.current[el.id] ?? { x: el.x, y: el.y, w: el.w, h: el.h };
      if (Math.abs(targetH - cur.h) > 0.05) {
        const nextBox = { ...cur, h: targetH };
        setOverrides((o) => ({ ...o, [el.id]: nextBox }));
        persistDebounced(el.id, nextBox);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFitSignature, wrapperTick, boundEls, styleOverrides, persistDebounced, drag?.id]);


  const maxZ = useMemo(
    () => fetched.reduce((m, e) => (e.z > m ? e.z : m), 0),
    [fetched],
  );

  /**
   * Z-order actions (front/back/forward/backward) — single-element z updates.
   * Note: the SVG lines overlay renders on a fixed layer at zIndex 900 above
   * bound/text/shape/header elements — lines cannot interleave by z with
   * boxes. Within each layer, ordering is by z ascending (higher = on top).
   */
  const changeZOrder = useCallback(
    (id: string, action: 'front' | 'back' | 'forward' | 'backward') => {
      if (!canEdit) return;
      const el = fetched.find((e) => e.id === id);
      if (!el) return;
      const others = fetched.filter((e) => e.id !== id);
      if (others.length === 0) return;

      // Updates to apply: primary element (id → newZ) plus optionally a
      // neighbour element to swap with (breaks ties and guarantees a
      // visible restack when many elements share the same z).
      const updates: Array<{ id: string; before: number; after: number }> = [];

      if (action === 'front') {
        const newZ = Math.max(...others.map((e) => e.z)) + 1;
        if (newZ === el.z) return;
        updates.push({ id: el.id, before: el.z, after: newZ });
      } else if (action === 'back') {
        const newZ = Math.min(...others.map((e) => e.z)) - 1;
        if (newZ === el.z) return;
        updates.push({ id: el.id, before: el.z, after: newZ });
      } else if (action === 'forward') {
        // Find the immediate neighbour above: smallest z strictly greater
        // than ours, then swap. If everything above is tied at our z (12
        // headers+bounds all at 0), pick the first sibling at same z that
        // renders after us in the fetched list — DOM order tie-breaks.
        const strictlyHigher = others.filter((e) => e.z > el.z);
        let neighbour = strictlyHigher.length
          ? strictlyHigher.reduce((a, b) => (a.z <= b.z ? a : b))
          : null;
        if (!neighbour) {
          const selfIdx = fetched.findIndex((e) => e.id === el.id);
          neighbour = fetched.slice(selfIdx + 1).find((e) => e.z === el.z) ?? null;
        }
        if (!neighbour) return;
        if (neighbour.z === el.z) {
          // Ties: bump ours by +1 to overtake DOM-order neighbour.
          updates.push({ id: el.id, before: el.z, after: el.z + 1 });
        } else {
          updates.push({ id: el.id, before: el.z, after: neighbour.z });
          updates.push({ id: neighbour.id, before: neighbour.z, after: el.z });
        }
      } else if (action === 'backward') {
        const strictlyLower = others.filter((e) => e.z < el.z);
        let neighbour = strictlyLower.length
          ? strictlyLower.reduce((a, b) => (a.z >= b.z ? a : b))
          : null;
        if (!neighbour) {
          const selfIdx = fetched.findIndex((e) => e.id === el.id);
          neighbour = [...fetched.slice(0, selfIdx)].reverse().find((e) => e.z === el.z) ?? null;
        }
        if (!neighbour) return;
        if (neighbour.z === el.z) {
          updates.push({ id: el.id, before: el.z, after: el.z - 1 });
        } else {
          updates.push({ id: el.id, before: el.z, after: neighbour.z });
          updates.push({ id: neighbour.id, before: neighbour.z, after: el.z });
        }
      }

      if (updates.length === 0) return;

      // History: one step covering all (1 or 2) element z changes.
      const primary = updates[0];
      const before = snapshotOfEl(el);
      const after: ElementSnapshot = { ...before, z: primary.after };
      pushHistory({ kind: 'update', id: el.id, before, after, ts: Date.now() });

      qc.setQueryData<CanvasElement[]>(ELS_KEY(proposalId), (old) =>
        (old || []).map((e) => {
          const u = updates.find((x) => x.id === e.id);
          return u ? { ...e, z: u.after } : e;
        }),
      );

      void Promise.all(
        updates.map((u) =>
          supabase
            .from('impact_canvas_elements')
            .update({ z: u.after })
            .eq('id', u.id)
            .then(({ error }) => {
              if (error) {
                // eslint-disable-next-line no-console
                console.error('[impact-canvas] z-order update failed', { id: u.id, z: u.after, error });
                qc.invalidateQueries({ queryKey: ELS_KEY(proposalId) });
              }
            }),
        ),
      );
    },
    [canEdit, fetched, snapshotOfEl, pushHistory, qc, proposalId],
  );



  const addTextBox = useCallback(async () => {
    if (!canEdit) return;
    const VW = CANVAS_WIDTH_CM;
    const VH = canvasHeightCmRef.current;
    const w = 4;   // cm
    const h = 1.2; // cm
    const insertBox = {
      proposal_id: proposalId,
      kind: 'text',
      x: +((VW - w) / 2).toFixed(4),
      y: +((VH - h) / 2).toFixed(4),
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
    pushHistory({ kind: 'add', element: data as CanvasElement });
    setSelectedId(data.id);
    setEditingId(data.id);
  }, [canEdit, maxZ, proposalId, qc, pushHistory]);


  const addShape = useCallback(
    async (shape: ShapeKind) => {
      if (!canEdit) return;
      const VW = CANVAS_WIDTH_CM;
      const VH = canvasHeightCmRef.current;
      // Default sizes (cm) per shape kind.
      const size =
        shape === 'circle' ? { w: 3, h: 3 } :
        shape === 'triangle' ? { w: 3.5, h: 3 } :
        { w: 3, h: 2 };
      const insertBox = {
        proposal_id: proposalId,
        kind: 'shape',
        x: +((VW - size.w) / 2).toFixed(4),
        y: +((VH - size.h) / 2).toFixed(4),
        w: size.w,
        h: size.h,
        z: maxZ + 1,
        content: { shape, html: '' },
        style: { outlineColor: 'none', fillColor: '#ADB5BD' },
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
      pushHistory({ kind: 'add', element: data as CanvasElement });
      setSelectedId(data.id);
    },
    [canEdit, maxZ, proposalId, qc, pushHistory],
  );

  /** Add a new line element with the given routing + arrow variant.
   *  Default geometry: a ~4 cm horizontal segment centred on the canvas,
   *  snapped to 0.2 cm when snap is on. Starts selected. One undo step. */
  const addLine = useCallback(
    async (routing: 'straight' | 'elbow', arrow: 'none' | 'end' | 'both') => {
      if (!canEdit) return;
      const VW = CANVAS_WIDTH_CM;
      const VH = canvasHeightCmRef.current;
      const halfLen = 2; // cm — total 4 cm horizontal default
      const cy = +(VH / 2).toFixed(2);
      const cxL = +(VW / 2 - halfLen).toFixed(2);
      const cxR = +(VW / 2 + halfLen).toFixed(2);
      const snapTo = (v: number) => Math.round(v / SNAP_STEP_CM) * SNAP_STEP_CM;
      const from = snapRef.current
        ? { x: snapTo(cxL), y: snapTo(cy) }
        : { x: cxL, y: cy };
      const to = snapRef.current
        ? { x: snapTo(cxR), y: snapTo(cy) }
        : { x: cxR, y: cy };
      const bbox = computeLineBBox(from, to);
      const insertBox = {
        proposal_id: proposalId,
        kind: 'line',
        x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h,
        z: maxZ + 1,
        content: { routing, arrow, from, to },
        style: { outlineColor: '#000000', outlineWidth: 1.5 },
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
      pushHistory({ kind: 'add', element: data as CanvasElement });
      setSelectedId(data.id);
    },
    [canEdit, maxZ, proposalId, qc, pushHistory],
  );




  /** Directly set an element's box in cm (used by the size input fields).
   *  Optimistic + debounced via the same persist path as drag/resize. */
  const setElementBox = useCallback(
    (id: string, patch: Partial<{ x: number; y: number; w: number; h: number }>) => {
      if (!canEdit) return;
      const el = fetched.find((e) => e.id === id);
      if (!el) return;
      const before = snapshotOfEl(el);
      const current = overrides[id] ?? { x: el.x, y: el.y, w: el.w, h: el.h };
      let next = { ...current, ...patch };
      // Clamp: element must fit inside 18 cm × 25.5 cm.
      next.w = Math.max(MIN_W, Math.min(CANVAS_WIDTH_CM, next.w));
      next.h = Math.max(MIN_H, Math.min(CANVAS_MAX_HEIGHT_CM, next.h));
      next.x = Math.max(0, Math.min(CANVAS_WIDTH_CM - next.w, next.x));
      next.y = Math.max(0, Math.min(CANVAS_MAX_HEIGHT_CM - next.h, next.y));
      setOverrides((o) => ({ ...o, [id]: next }));
      persistDebounced(id, next);
      let styleAfter: unknown = before.style;
      // Manual H entry locks explicit height for bound boxes.
      if (patch.h !== undefined && el.kind === 'bound') {
        const cur = { ...readBoundStyle(el.style), ...(styleOverrides[id] ?? {}) };
        if (cur.autoFitH !== false) {
          const nextStyle = { ...cur, autoFitH: false };
          setStyleOverrides((o) => ({ ...o, [id]: nextStyle }));
          persistStyleDebounced(id, nextStyle);
          styleAfter = nextStyle;
        }
      }
      const after: ElementSnapshot = { ...before, ...next, style: styleAfter };
      pushHistory({ kind: 'update', id, before, after, ts: Date.now() }, `size:${id}`);
    },
    [canEdit, fetched, overrides, persistDebounced, styleOverrides, persistStyleDebounced, snapshotOfEl, pushHistory],
  );



  const deleteElement = useCallback(
    async (id: string) => {
      if (!canEdit) return;
      // Snapshot with merged overrides so undo restores the visible state.
      const prev = qc.getQueryData<CanvasElement[]>(ELS_KEY(proposalId));
      const target = (prev || []).find((e) => e.id === id);
      if (target) {
        const snap = snapshotOfEl(target);
        const restored: CanvasElement = {
          ...target,
          x: snap.x, y: snap.y, w: snap.w, h: snap.h,
          content: snap.content, style: snap.style,
        };
        pushHistory({ kind: 'delete', element: restored });
      }
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
    [canEdit, proposalId, qc, snapshotOfEl, pushHistory],
  );


  // Keyboard: Delete/Backspace on selected free element removes it.
  useEffect(() => {
    if (!selectedId || editingId) return;
    const el = fetched.find((e) => e.id === selectedId);
    if (!el || (el.kind !== 'text' && el.kind !== 'shape' && el.kind !== 'line')) return;
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

  // Text edit → one canvas-undo step on commit (not per keystroke). Track
  // the pre-edit snapshot when editingId turns on; on transition to null,
  // if the html actually changed, push ONE update entry.
  const prevEditingIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevEditingIdRef.current;
    const cur = editingId;
    if (prev === cur) return;
    if (cur) {
      const el = fetched.find((e) => e.id === cur);
      if (el) textEditBeforeRef.current = { id: cur, snap: snapshotOfEl(el) };
    }
    if (prev && !cur) {
      const captured = textEditBeforeRef.current;
      if (captured && captured.id === prev) {
        const el = fetched.find((e) => e.id === prev);
        if (el) {
          const after = snapshotOfEl(el);
          const beforeHtml = ((captured.snap.content ?? {}) as { html?: string }).html ?? '';
          const afterHtml = ((after.content ?? {}) as { html?: string }).html ?? '';
          if (beforeHtml !== afterHtml) {
            pushHistory({ kind: 'update', id: prev, before: captured.snap, after, ts: Date.now() });
          }
        }
        textEditBeforeRef.current = null;
      }
    }
    prevEditingIdRef.current = cur;
  }, [editingId, fetched, snapshotOfEl, pushHistory]);


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

  // Merge live drag overrides so the canvas height grows in real-time as
  // the user drags an element toward the bottom edge (still clamped to 25.5cm).
  const mergedForHeight = fetched.map((e) => ({ ...e, ...(overrides[e.id] ?? {}) }));
  const VW = CANVAS_WIDTH_CM;
  const VH = computeCanvasHeightCm(mergedForHeight);
  canvasHeightCmRef.current = VH;
  const pctX = (x: number) => `${(x / VW) * 100}%`;
  const pctY = (y: number) => `${(y / VH) * 100}%`;
  const paddingPct = `${(VH / VW) * 100}%`;

  

  const selectedEl = selectedId ? fetched.find((e) => e.id === selectedId) ?? null : null;
  const selectedIsBound = selectedEl?.kind === 'bound';
  const selectedIsHeader = selectedEl?.kind === 'header';
  const selectedIsShape = selectedEl?.kind === 'shape';
  const selectedIsText = selectedEl?.kind === 'text';
  const selectedIsLine = selectedEl?.kind === 'line';
  const selectedIsFree = selectedIsShape || selectedIsText || selectedIsLine;
  const selectedIsBoundLike = selectedIsBound || selectedIsHeader;

  const selectedBox = selectedEl
    ? (overrides[selectedEl.id] ?? { x: selectedEl.x, y: selectedEl.y, w: selectedEl.w, h: selectedEl.h })
    : null;


  // Enablement flags for each toolbar group. Slots stay in fixed positions;
  // controls are disabled (greyed) when they don't apply to the current
  // selection — no reflow when switching elements.
  const styleEnabled = !!selectedEl && (selectedIsBoundLike || selectedIsShape);
  const lineStyleEnabled = !!selectedEl && selectedIsLine;
  const sizeEnabled = !!selectedEl && !!selectedBox && !selectedIsLine;
  const zEnabled = !!selectedEl && canEdit;
  const deleteEnabled = !!selectedEl && selectedIsFree;

  return (
    <div className="space-y-2">
      {canEdit && (
        <div
          className="w-full flex items-center gap-1 flex-wrap bg-muted/30 px-2 py-1"
          data-impact-canvas-toolbar
        >
          {/* Group 1: Undo / Redo */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => void undo()}
            disabled={!canUndo}
            title="Undo (⌘/Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => void redo()}
            disabled={!canRedo}
            title="Redo (⇧⌘/Ctrl+Z)"
            aria-label="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Group 2: Adders — shapes, line, text (always enabled). */}
          <div className="flex items-center gap-0.5" data-impact-canvas-adders>
            <Button type="button" variant="ghost" size="sm" onClick={() => addShape('rect')} className="h-7 w-7 p-0" title="Rectangle" aria-label="Add rectangle" data-impact-canvas-toolbar>
              <Square className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => addShape('roundedRect')} className="h-7 w-7 p-0" title="Rounded rectangle" aria-label="Add rounded rectangle" data-impact-canvas-toolbar>
              <Squircle className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => addShape('circle')} className="h-7 w-7 p-0" title="Circle" aria-label="Add circle" data-impact-canvas-toolbar>
              <CircleIcon className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => addShape('triangle')} className="h-7 w-7 p-0" title="Triangle" aria-label="Add triangle" data-impact-canvas-toolbar>
              <Triangle className="w-3.5 h-3.5" />
            </Button>
            <LineAdderSplitButton onAdd={addLine} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addTextBox}
              className="h-7 w-7 p-0"
              title="Text box"
              aria-label="Add text box"
              data-impact-canvas-toolbar
            >
              <Type className="w-3.5 h-3.5" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Group 3: Style — fill, outline, font (bound boxes/shapes + line outline). */}
          <BoundStyleToolbar
            proposalId={proposalId}
            canEdit={canEdit && styleEnabled}
            style={
              styleEnabled && selectedEl
                ? { ...readBoundStyle(selectedEl.style), ...(styleOverrides[selectedEl.id] ?? {}) }
                : (BOUND_STYLE_DEFAULTS as BoundBoxStyle)
            }
            onChange={(patch) => {
              if (selectedEl) updateBoundStyle(selectedEl.id, patch);
            }}
          />
          <div className="flex items-center" data-impact-canvas-toolbar>
            <ImpactCanvasOutlinePicker
              color={
                (lineStyleEnabled && (selectedEl?.style as { outlineColor?: string })?.outlineColor) || '#000000'
              }
              width={(lineStyleEnabled && (selectedEl?.style as { outlineWidth?: number })?.outlineWidth) || 1.5}
              proposalId={proposalId}
              disabled={!lineStyleEnabled}
              onColorChange={(c) => selectedEl && updateBoundStyle(selectedEl.id, { outlineColor: c })}
              onWidthChange={(w) => selectedEl && updateBoundStyle(selectedEl.id, { outlineWidth: w })}
            />
          </div>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Group 4: Size (W/H cm fields) */}
          <SizeFields
            box={sizeEnabled && selectedBox ? selectedBox : { x: 0, y: 0, w: 0, h: 0 }}
            disabled={!sizeEnabled}
            onChange={(patch) => {
              if (selectedEl) setElementBox(selectedEl.id, patch);
            }}
          />

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Group 5: Layers (front / forward / backward / back) */}
          <div className="flex items-center gap-0.5" data-impact-canvas-toolbar>
            <Button
              type="button" variant="ghost" size="sm" className="h-7 px-1.5"
              title="Bring to front"
              aria-label="Bring to front"
              disabled={!zEnabled}
              onClick={() => selectedEl && changeZOrder(selectedEl.id, 'front')}
            >⤒</Button>
            <Button
              type="button" variant="ghost" size="sm" className="h-7 px-1.5"
              title="Bring forward"
              aria-label="Bring forward"
              disabled={!zEnabled}
              onClick={() => selectedEl && changeZOrder(selectedEl.id, 'forward')}
            >↑</Button>
            <Button
              type="button" variant="ghost" size="sm" className="h-7 px-1.5"
              title="Send backward"
              aria-label="Send backward"
              disabled={!zEnabled}
              onClick={() => selectedEl && changeZOrder(selectedEl.id, 'backward')}
            >↓</Button>
            <Button
              type="button" variant="ghost" size="sm" className="h-7 px-1.5"
              title="Send to back"
              aria-label="Send to back"
              disabled={!zEnabled}
              onClick={() => selectedEl && changeZOrder(selectedEl.id, 'back')}
            >⤓</Button>
          </div>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Group 6: Grid + snap toggles (icon-only) */}
          <div className="flex items-center gap-0.5" data-impact-canvas-toolbar>
            <Button
              type="button"
              variant={showGrid ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setShowGrid((v) => !v)}
              className="h-7 w-7 p-0"
              title="Show grid (0.2 cm minor, 1 cm major)"
              aria-label="Toggle grid"
              aria-pressed={showGrid}
            >
              <Grid3x3 className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant={snap ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSnap((v) => !v)}
              className="h-7 w-7 p-0"
              title="Snap to grid (0.2 cm)"
              aria-label="Toggle snap to grid"
              aria-pressed={snap}
            >
              <Magnet className="w-3.5 h-3.5" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Group 7: Delete (icon-only) */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
            onClick={() => selectedEl && void deleteElement(selectedEl.id)}
            disabled={!deleteEnabled}
            data-impact-canvas-toolbar
            title="Delete selected element"
            aria-label="Delete selected element"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}


      <div
        ref={wrapperRef}
        className={className}
        data-impact-canvas-editor-surface

        style={{
          position: 'relative',
          width: '100%',
          overflow: 'hidden',
          // Establish a stacking context so negative-z elements (e.g. shapes
          // sent to back) stay contained and don't render behind the parent
          // card's background — which would make them disappear entirely.
          isolation: 'isolate',
          fontFamily: '"Times New Roman", Times, serif',
          userSelect: drag ? 'none' : undefined,
          touchAction: 'none',
        }}
        onPointerDownCapture={(e) => {
          // Bug B guard: when several element wrappers overlap, the browser
          // routes the pointerdown to the sibling whose bounding rect is
          // topmost in DOM/paint order — that may not be the element the
          // user visually sees on top (shapes get sent behind bound boxes
          // that share the same pixel area but were rendered later in DOM).
          // Use elementsFromPoint (respects zIndex + pointer-events) to
          // pick the visually topmost canvas element and, if it differs
          // from the natural target, redirect the gesture there.
          if (!canEdit || e.button !== 0) return;
          const target = e.target as HTMLElement | null;
          if (!target) return;
          if (
            target.closest('[data-impact-canvas-toolbar]') ||
            target.closest('[data-impact-canvas-textbox-editor]') ||
            target.closest('[data-impact-canvas-line-interactive]') ||
            target.closest('[data-canvas-handle]')
          ) return;
          const naturalWrapper = target.closest('[data-canvas-el-id]') as HTMLElement | null;
          const stack = document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[];
          const topWrapper = stack
            .map((n) => n.closest('[data-canvas-el-id]') as HTMLElement | null)
            .find((n): n is HTMLElement => !!n && wrapperRef.current!.contains(n)) ?? null;
          if (topWrapper && topWrapper !== naturalWrapper) {
            const id = topWrapper.getAttribute('data-canvas-el-id');
            const el = fetchedRef.current.find((x) => x.id === id);
            if (el) {
              e.stopPropagation();
              e.preventDefault();
              const ov = overridesRef.current[el.id];
              const box = ov ?? { x: el.x, y: el.y, w: el.w, h: el.h };
              // Dispatch as if the correct wrapper received the event.
              // Emulate React.PointerEvent shape for beginDrag by patching
              // currentTarget to the top wrapper for setPointerCapture.
              const synth = new Proxy(e, {
                get(t, prop) {
                  if (prop === 'currentTarget') return topWrapper;
                  return (t as unknown as Record<string | symbol, unknown>)[prop as string];
                },
              }) as unknown as React.PointerEvent;
              beginDrag(synth, el.id, { kind: 'move' }, box);
            }
          }
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

        {/* Grid overlay — editor-only aid, never rendered in read-only. */}
        {showGrid && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 0,
              // Four layered gradients: major vertical, major horizontal,
              // minor vertical, minor horizontal. Sized in % of the wrapper
              // which itself is 18cm : VHcm, so lines stay cm-aligned.
              backgroundImage: [
                'linear-gradient(to right, rgba(0,0,0,0.18) 0, rgba(0,0,0,0.18) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(0,0,0,0.18) 0, rgba(0,0,0,0.18) 1px, transparent 1px)',
                'linear-gradient(to right, rgba(0,0,0,0.07) 0, rgba(0,0,0,0.07) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(0,0,0,0.07) 0, rgba(0,0,0,0.07) 1px, transparent 1px)',
              ].join(', '),
              backgroundSize: [
                `${(1 / VW) * 100}% ${(1 / VH) * 100}%`,
                `${(1 / VW) * 100}% ${(1 / VH) * 100}%`,
                `${(0.2 / VW) * 100}% ${(0.2 / VH) * 100}%`,
                `${(0.2 / VW) * 100}% ${(0.2 / VH) * 100}%`,
              ].join(', '),
              backgroundPosition: '0 0, 0 0, 0 0, 0 0',
            }}
          />
        )}


        {/* Header elements — bound-style boxes whose text is sourced from
            impact_canvas_columns.heading (NOT free text). Drag/resize/style
            like bound cell boxes; not individually deletable (managed via
            column add/delete). */}
        {headerEls.map((el) => {
          const col = columnByKey.get(el.bound_col_key!);
          const ov = overrides[el.id];
          const box = ov ?? { x: el.x, y: el.y, w: el.w, h: el.h };
          const selected = selectedId === el.id;
          const styleSrc = styleOverrides[el.id] ?? el.style;
          const bs = resolveBoundStyle(styleSrc);
          return (
            <div
              key={el.id}
              data-canvas-el-id={el.id}
              style={{
                position: 'absolute',
                left: pctX(box.x),
                top: pctY(box.y),
                width: pctX(box.w),
                height: pctY(box.h),
                zIndex: el.z,
                padding: '2pt',
                boxSizing: 'border-box',
                cursor: canEdit ? (drag?.id === el.id && drag.mode.kind === 'move' ? 'grabbing' : 'grab') : 'default',
              }}
              onPointerDown={(e) => beginDrag(e, el.id, { kind: 'move' }, box)}
            >
              <div
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
                  fontFamily: '"Arial Black", Arial, sans-serif',
                  fontSize: 11,
                  fontWeight: 700,
                  color: bs.color,
                  whiteSpace: 'pre-line',
                  textAlign: 'left',
                  lineHeight: 1.15,
                  pointerEvents: 'none',
                }}
              >
                {col?.heading ?? ''}
              </div>

              {selected && canEdit && HANDLES.map((h) => (
                <div
                  key={h}
                  data-canvas-handle={h}
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
              data-canvas-el-id={el.id}
              style={{
                position: 'absolute',
                left: pctX(box.x),
                top: pctY(box.y),
                width: pctX(box.w),
                height: pctY(box.h),
                zIndex: el.z,
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
                  data-canvas-handle={h}
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

        {/* Hidden probes for auto-fit bound boxes — same width & typography
            as the visible box (height:auto). Their offsetHeight drives the
            auto-fit measurement effect. */}
        {boundEls.map((el) => {
          const bs = readBoundStyle(styleOverrides[el.id] ?? el.style);
          if (bs.autoFitH === false) return null;
          const row = rowById.get(el.bound_row_id!);
          const html = (row?.content?.[el.bound_col_key!] as string) || '';
          const ov = overrides[el.id];
          const box = ov ?? { x: el.x, y: el.y, w: el.w, h: el.h };
          return (
            <div
              key={`probe-${el.id}`}
              ref={(node) => { probeRefs.current[el.id] = node; }}
              aria-hidden
              style={{
                position: 'absolute',
                left: pctX(box.x),
                top: 0,
                width: pctX(box.w),
                visibility: 'hidden',
                pointerEvents: 'none',
                padding: '2pt',
                boxSizing: 'border-box',
                fontSize: 12,
                lineHeight: 1.3,
                fontFamily: '"Times New Roman", Times, serif',
              }}
            >
              <div style={{ width: '100%', padding: '2pt', boxSizing: 'border-box' }} dangerouslySetInnerHTML={{ __html: sanitize(html) }} />
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
              data-canvas-el-id={el.id}
              style={{
                position: 'absolute',
                left: pctX(box.x),
                top: pctY(box.y),
                width: pctX(box.w),
                height: pctY(box.h),
                zIndex: el.z,
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
                if (suppressNextClickRef.current === el.id) {
                  suppressNextClickRef.current = null;
                  return;
                }
                if (selectedId !== el.id) {
                  setSelectedId(el.id);
                }
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
                  data-canvas-handle={h}
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

        {shapeEls.map((el) => {
          const ov = overrides[el.id];
          const box = ov ?? { x: el.x, y: el.y, w: el.w, h: el.h };
          const selected = selectedId === el.id;
          const editing = editingId === el.id;
          const raw = (el.content ?? {}) as { shape?: ShapeKind; html?: string };
          const shape: ShapeKind = raw.shape ?? 'rect';
          const html = contentOverrides[el.id] ?? (raw.html || '');
          const styleSrc = styleOverrides[el.id] ?? el.style;
          return (
            <div
              key={el.id}
              data-canvas-el-id={el.id}
              data-canvas-el-kind="shape"
              style={{
                background: 'transparent',
                pointerEvents: 'auto',
                position: 'absolute',
                left: pctX(box.x),
                top: pctY(box.y),
                width: pctX(box.w),
                height: pctY(box.h),
                zIndex: el.z,
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
                if (suppressNextClickRef.current === el.id) {
                  suppressNextClickRef.current = null;
                  return;
                }
                if (selectedId !== el.id) {
                  setSelectedId(el.id);
                }
              }}
              onDoubleClick={(e) => {
                if (!canEdit) return;
                e.stopPropagation();
                setSelectedId(el.id);
                setEditingId(el.id);
              }}
            >
              <ImpactCanvasShape shape={shape} styleRaw={styleSrc} selected={selected}>
                {editing ? (
                  <ImpactCanvasTextBox
                    html={html}
                    editing
                    autoFocus
                    align="center"
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
                    style={{ width: '100%', textAlign: 'center', pointerEvents: 'none' }}
                    dangerouslySetInnerHTML={{ __html: sanitize(html) }}
                  />
                )}
              </ImpactCanvasShape>

              {selected && !editing && canEdit && HANDLES.map((h) => (
                <div
                  key={h}
                  data-canvas-handle={h}
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

        {/* Selected-element resize handles hoisted to a surface-level overlay
            at a very high z-index. Rendering handles inside each element
            wrapper is fragile: a wrapper that happens to sit behind (or in
            the same stacking context as) a covering element loses its
            handles' hit-testing (this bit shape handles specifically —
            symptom: no resize cursor / no resize). By painting one shared
            set of handles at the surface root, they sit above every
            element wrapper regardless of z-order, so hover always shows
            the resize cursor and pointerdown always starts a resize.
            beginDrag is invoked with the selected element's kind-agnostic
            box; the per-wrapper handles are removed to avoid duplicates. */}
        {canEdit && (() => {
          const selEl = fetched.find((e) => e.id === selectedId);
          if (!selEl) return null;
          if (selEl.kind !== 'bound' && selEl.kind !== 'header' && selEl.kind !== 'shape' && selEl.kind !== 'text') return null;
          if (editingId === selEl.id) return null;
          const ov = overrides[selEl.id];
          const box = ov ?? { x: selEl.x, y: selEl.y, w: selEl.w, h: selEl.h };
          const leftPct = (box.x / VW) * 100;
          const topPct = (box.y / VH) * 100;
          const widthPct = (box.w / VW) * 100;
          const heightPct = (box.h / VH) * 100;
          return (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
                pointerEvents: 'none',
                zIndex: 950,
              }}
            >
              {HANDLES.map((h) => (
                <div
                  key={h}
                  data-canvas-handle={h}
                  onPointerDown={(e) => beginDrag(e, selEl.id, { kind: 'resize', handle: h }, box)}
                  style={{
                    position: 'absolute',
                    width: 10,
                    height: 10,
                    background: 'hsl(var(--primary))',
                    border: '1px solid white',
                    borderRadius: 2,
                    cursor: HANDLE_CURSOR[h],
                    pointerEvents: 'auto',
                    ...handleStyle(h),
                  }}
                />
              ))}
            </div>
          );
        })()}

        {/* Line elements — shared SVG overlay renders the visible strokes +
            arrowheads (identical to B2.1/PDF/PNG). We pass the merged
            elements so in-flight endpoint/body drags are reflected live. */}
        <ImpactCanvasLinesOverlay
          VW={VW}
          VH={VH}
          elements={lineElsMerged as unknown as LineElement[]}
        />

        {/* Editor-only interactive layer for lines: invisible thick
            hit-paths for selection + body-drag; endpoint circles when
            selected for endpoint-drag. */}
        {canEdit && lineElsMerged.length > 0 && (
          <svg
            viewBox={`0 0 ${VW} ${VH}`}
            preserveAspectRatio="none"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 901,
            }}
            data-impact-canvas-line-interactive
          >
            {lineElsMerged.map((el) => {
              const content = el.content as LineContent;
              const from = content.from;
              const to = content.to;
              const routing = content.routing;
              const box = { x: el.x, y: el.y, w: el.w, h: el.h };
              let d: string;
              if (routing === 'elbow') {
                const { bend } = computeElbowBend(from, to, content.elbow);
                d = `M ${from.x} ${from.y} L ${bend.x} ${bend.y} L ${to.x} ${to.y}`;

              } else {
                d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
              }
              const selected = selectedId === el.id;
              return (
                <g key={`li-${el.id}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke="rgba(0,0,0,0)"
                    strokeWidth={0.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      pointerEvents: 'stroke',
                      cursor: drag?.id === el.id && drag.mode.kind === 'line-move' ? 'grabbing' : 'grab',
                    }}
                    onPointerDown={(e) => {
                      beginDrag(e, el.id, { kind: 'line-move' }, box, { from, to });
                    }}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                  />
                  {selected && (
                    <>
                      <circle
                        cx={from.x} cy={from.y} r={0.18}
                        fill="hsl(var(--primary))"
                        stroke="white" strokeWidth={0.04}
                        style={{ pointerEvents: 'all', cursor: 'crosshair' }}
                        onPointerDown={(e) => {
                          beginDrag(e, el.id, { kind: 'endpoint', which: 'from' }, box, { from, to });
                        }}
                      />
                      <circle
                        cx={to.x} cy={to.y} r={0.18}
                        fill="hsl(var(--primary))"
                        stroke="white" strokeWidth={0.04}
                        style={{ pointerEvents: 'all', cursor: 'crosshair' }}
                        onPointerDown={(e) => {
                          beginDrag(e, el.id, { kind: 'endpoint', which: 'to' }, box, { from, to });
                        }}
                      />
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        )}


      </div>
    </div>
  );
}

/** Compact cm width/height numeric fields shown when an element is selected.
 *  Two-way: reflects the current (possibly drag-in-flight) box and writes
 *  changes back through setElementBox → optimistic override + debounced save. */
function SizeFields({
  box,
  onChange,
  disabled = false,
}: {
  box: { x: number; y: number; w: number; h: number };
  onChange: (patch: Partial<{ x: number; y: number; w: number; h: number }>) => void;
  disabled?: boolean;
}) {
  const fmt = (v: number) => (Math.round(v * 100) / 100).toString();
  return (
    <div className="flex items-center gap-1" data-impact-canvas-toolbar>
      <span className={cn('text-[11px] text-muted-foreground', disabled && 'opacity-50')}>W</span>
      <Input
        type="number"
        step="0.1"
        min={0}
        value={disabled ? '' : fmt(box.w)}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange({ w: v });
        }}
        className="h-7 w-14 text-xs"
        title="Width (cm)"
      />
      <span className={cn('text-[11px] text-muted-foreground', disabled && 'opacity-50')}>cm</span>
      <span className={cn('text-[11px] text-muted-foreground ml-1', disabled && 'opacity-50')}>H</span>
      <Input
        type="number"
        step="0.1"
        min={0}
        value={disabled ? '' : fmt(box.h)}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange({ h: v });
        }}
        className="h-7 w-14 text-xs"
        title="Height (cm)"
      />
      <span className={cn('text-[11px] text-muted-foreground', disabled && 'opacity-50')}>cm</span>
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
    <div className="flex items-center gap-1" data-impact-canvas-toolbar>
      {/* Fill — paint bucket icon + current-fill indicator */}
      <WPColorPicker
        color={fillIsNone ? '#FFFFFF' : fill}
        onChange={(c) => onChange({ fillColor: c })}
        disabled={!canEdit}
        proposalId={proposalId}
        canManageCustom={canEdit}
        label="Fill colour"
        showGreyscale
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
        showGreyscale

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

/**
 * Split-button adder for line/arrow variants.
 * Primary click = default straight one-way arrow. The chevron opens a
 * 2×3 popover (rows: straight, elbow; cols: plain, one-way, two-way).
 */
function LineAdderSplitButton({
  onAdd,
}: {
  onAdd: (routing: 'straight' | 'elbow', arrow: 'none' | 'end' | 'both') => void;
}) {
  const [open, setOpen] = useState(false);
  const variants: Array<{
    routing: 'straight' | 'elbow';
    arrow: 'none' | 'end' | 'both';
    label: string;
  }> = [
    { routing: 'straight', arrow: 'none', label: 'Straight line' },
    { routing: 'straight', arrow: 'end', label: 'Straight one-way arrow' },
    { routing: 'straight', arrow: 'both', label: 'Straight two-way arrow' },
    { routing: 'elbow', arrow: 'none', label: 'Elbow line' },
    { routing: 'elbow', arrow: 'end', label: 'Elbow one-way arrow' },
    { routing: 'elbow', arrow: 'both', label: 'Elbow two-way arrow' },
  ];
  return (
    <div className="inline-flex" data-impact-canvas-toolbar>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0 rounded-r-none border-r-0"
        onClick={() => onAdd('straight', 'end')}
        title="Add line (straight, one-way arrow)"
        aria-label="Add line"
      >
        <MoveRight className="w-4 h-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-5 p-0 rounded-l-none"
            title="Line variants"
            aria-label="Line variants"
          >
            <ChevronDown className="w-3 h-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-3 gap-1">
            {variants.map((v) => (
              <button
                key={`${v.routing}-${v.arrow}`}
                type="button"
                onClick={() => { onAdd(v.routing, v.arrow); setOpen(false); }}
                className="inline-flex items-center justify-center h-9 w-14 rounded-md border bg-background hover:bg-accent transition-colors"
                title={v.label}
                aria-label={v.label}
              >
                <LineVariantIcon routing={v.routing} arrow={v.arrow} />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Tiny SVG preview icon for a line/arrow variant used in the popover. */
function LineVariantIcon({
  routing,
  arrow,
}: {
  routing: 'straight' | 'elbow';
  arrow: 'none' | 'end' | 'both';
}) {
  // 48×20 viewBox. Path adjusted so arrowheads fit at each end.
  const d = routing === 'elbow'
    ? 'M 6 6 L 26 6 L 26 16 L 42 16'
    : 'M 6 10 L 42 10';
  const head = 6;
  return (
    <svg viewBox="0 0 48 20" width={40} height={16} aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {(arrow === 'end' || arrow === 'both') && (
        routing === 'elbow'
          ? <polygon points={`${42},${16} ${42 - head},${16 - head / 2} ${42 - head},${16 + head / 2}`} fill="currentColor" />
          : <polygon points={`42,10 ${42 - head},${10 - head / 2} ${42 - head},${10 + head / 2}`} fill="currentColor" />
      )}
      {arrow === 'both' && (
        routing === 'elbow'
          ? <polygon points={`6,6 ${6 + head},${6 - head / 2} ${6 + head},${6 + head / 2}`} fill="currentColor" />
          : <polygon points={`6,10 ${6 + head},${10 - head / 2} ${6 + head},${10 + head / 2}`} fill="currentColor" />
      )}
    </svg>
  );
}

