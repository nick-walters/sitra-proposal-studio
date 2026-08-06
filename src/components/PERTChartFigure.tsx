import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { scheduleFigurePngCache } from '@/lib/figureCache';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, Network, Move, Plus, Trash2, ArrowRight, ArrowLeft, ArrowLeftRight, Image, FileDown, Grid3x3, Magnet, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PERTExportData } from '@/lib/figureExport';
import { toast } from 'sonner';

/** Grid geometry (SVG user units = px at zoom 1). */
const PERT_MINOR_GRID = 10;
const PERT_MAJOR_GRID = 50;
const PERT_MIN_ZOOM = 0.25;
const PERT_MAX_ZOOM = 3;

/** CSS px per cm at 96 dpi — maps the physical frame to SVG user units. */
const PX_PER_CM = 96 / 2.54;
/** Default frame: third-page standard size. */
const PERT_DEFAULT_WIDTH_CM = 18;
const PERT_DEFAULT_HEIGHT_CM = 8.5;
/** Default WP box size (SVG user units). */
const NODE_DEFAULT_W = 84;
const NODE_DEFAULT_H = 35;
const NODE_MIN_W = 30;
const NODE_MIN_H = 18;

const cmToPx = (cm: number) => cm * PX_PER_CM;
const pxToCm = (px: number) => px / PX_PER_CM;

interface WPNode {
  id: string;
  number: number;
  shortName: string;
  title: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Dependency {
  id: string;
  fromWpId: string;
  toWpId: string;
  direction: 'forward' | 'reverse' | 'bidirectional';
}

type DependencyDirection = Dependency['direction'];

interface PERTContent {
  nodePositions?: Record<string, { x: number; y: number }>;
  /** Per-node box size in SVG user units (px at 100%). */
  nodeSizes?: Record<string, { w: number; h: number }>;
  /** Physical frame size, shared with the figure size picker. */
  widthCm?: number | null;
  heightCm?: number | null;
  presetId?: string | null;
}


interface PERTChartFigureProps {
  figureId?: string;
  figureNumber: string;
  proposalId: string;
  content: PERTContent | null;
  onContentChange: (content: PERTContent) => void;
  canEdit: boolean;
}

/** Corner handle identifiers for WP box resizing. */
type Corner = 'nw' | 'ne' | 'sw' | 'se';
type ResizeState = {
  id: string;
  corner: Corner;
  startX: number;
  startY: number;
  origin: { x: number; y: number; w: number; h: number };
} | null;


export function PERTChartFigure({
  figureId,
  figureNumber,
  proposalId,
  content,
  onContentChange,
  canEdit,
}: PERTChartFigureProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [resizing, setResizing] = useState<ResizeState>(null);


  // Editor preferences (grid overlay + snap-to-grid + zoom) — the grid and
  // snap flags persist per browser, mirroring the freeform canvas editor.
  const [showGrid, setShowGrid] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('pert-chart-show-grid') === '1';
  });
  const [snap, setSnap] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('pert-chart-snap') === '1';
  });
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    try { window.localStorage.setItem('pert-chart-show-grid', showGrid ? '1' : '0'); } catch { /* ignore */ }
  }, [showGrid]);
  useEffect(() => {
    try { window.localStorage.setItem('pert-chart-snap', snap ? '1' : '0'); } catch { /* ignore */ }
  }, [snap]);


  // Cache rendered PNG to storage so the backup edge function can include it.
  useEffect(() => {
    if (!figureId) return;
    scheduleFigurePngCache(proposalId, figureId, () => chartRef.current);
  }, [figureId, proposalId, content]);

  // Fetch WP drafts
  const { data: wpDrafts = [] } = useQuery({
    queryKey: ['wp-drafts-pert', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, title, color')
        .eq('proposal_id', proposalId)
        .order('number');
      if (error) throw error;
      return data;
    },
  });

  // Fetch dependencies
  const { data: dependencies = [] } = useQuery({
    queryKey: ['wp-dependencies-pert', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_dependencies')
        .select('id, from_wp_id, to_wp_id, direction')
        .eq('proposal_id', proposalId);
      if (error) throw error;
      return data.map((d) => ({
        id: d.id,
        fromWpId: d.from_wp_id,
        toWpId: d.to_wp_id,
        direction: (d.direction || 'forward') as DependencyDirection,
      })) as Dependency[];
    },
  });

  // Track newly added (incomplete) dependencies
  const [incompleteDeps, setIncompleteDeps] = useState<Array<{ tempId: string; fromWpId: string; toWpId: string; direction: DependencyDirection }>>([]);

  // Add a new empty row locally
  const handleAddEmptyRow = useCallback(() => {
    setIncompleteDeps(prev => [...prev, { tempId: crypto.randomUUID(), fromWpId: '', toWpId: '', direction: 'forward' }]);
  }, []);

  // Save an incomplete dep to the database once both WPs are selected
  const saveIncompleteDep = useCallback(async (tempId: string, fromWpId: string, toWpId: string, direction: DependencyDirection) => {
    if (!fromWpId || !toWpId) return;
    try {
      const { error } = await supabase.from('wp_dependencies').insert({
        proposal_id: proposalId,
        from_wp_id: fromWpId,
        to_wp_id: toWpId,
        direction,
      });
      if (error) throw error;
      setIncompleteDeps(prev => prev.filter(d => d.tempId !== tempId));
      queryClient.invalidateQueries({ queryKey: ['wp-dependencies-pert', proposalId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add dependency');
    }
  }, [proposalId, queryClient]);

  // Update dependency mutation (any field)
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { from_wp_id?: string; to_wp_id?: string; direction?: string } }) => {
      const { data, error } = await supabase.from('wp_dependencies').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['wp-dependencies-pert', proposalId] });
      const previous = queryClient.getQueryData(['wp-dependencies-pert', proposalId]);
      queryClient.setQueryData(['wp-dependencies-pert', proposalId], (old: Dependency[] | undefined) =>
        old?.map(d => d.id === id ? { ...d, ...(updates.from_wp_id ? { fromWpId: updates.from_wp_id } : {}), ...(updates.to_wp_id ? { toWpId: updates.to_wp_id } : {}), ...(updates.direction ? { direction: updates.direction as DependencyDirection } : {}) } : d)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['wp-dependencies-pert', proposalId], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-dependencies-pert', proposalId] });
    },
  });

  // Delete dependency mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wp_dependencies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-dependencies-pert', proposalId] });
      toast.success('Dependency removed');
    },
  });

  // Calculate default positions in a grid layout
  const defaultPositions = useMemo(() => {
    const cols = 3;
    const nodeWidth = 84;
    const nodeHeight = 42;
    const hGap = 56;
    const vGap = 20;
    const startX = 14;
    const startY = 14;

    const positions: Record<string, { x: number; y: number }> = {};
    wpDrafts.forEach((wp, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      positions[wp.id] = {
        x: startX + col * (nodeWidth + hGap),
        y: startY + row * (nodeHeight + vGap),
      };
    });
    return positions;
  }, [wpDrafts]);

  // Merge saved positions with defaults
  const nodePositions = useMemo(() => {
    return { ...defaultPositions, ...(content?.nodePositions || {}) };
  }, [defaultPositions, content?.nodePositions]);

  // Create node objects (position + per-node box size)
  const nodes: WPNode[] = useMemo(() => {
    const sizes = content?.nodeSizes || {};
    return wpDrafts.map((wp) => ({
      id: wp.id,
      number: wp.number,
      shortName: wp.short_name || '',
      title: wp.title || '',
      color: wp.color,
      x: nodePositions[wp.id]?.x || 100,
      y: nodePositions[wp.id]?.y || 100,
      w: Math.max(NODE_MIN_W, Number(sizes[wp.id]?.w) || NODE_DEFAULT_W),
      h: Math.max(NODE_MIN_H, Number(sizes[wp.id]?.h) || NODE_DEFAULT_H),
    }));
  }, [wpDrafts, nodePositions, content?.nodeSizes]);

  // Helper to compute arrow between two nodes (respects per-node box sizes)
  const computeArrow = useCallback((fromNode: WPNode, toNode: WPNode) => {
    const fromCenterX = fromNode.x + fromNode.w / 2;
    const fromCenterY = fromNode.y + fromNode.h / 2;
    const toCenterX = toNode.x + toNode.w / 2;
    const toCenterY = toNode.y + toNode.h / 2;

    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return null;

    // Rectangle intersection for precise edge contact
    const getEdgePoint = (cx: number, cy: number, adx: number, ady: number, halfW: number, halfH: number) => {
      const absDx = Math.abs(adx);
      const absDy = Math.abs(ady);
      const scale = absDx * halfH > absDy * halfW ? halfW / absDx : halfH / absDy;
      return { x: cx + adx * scale, y: cy + ady * scale };
    };

    const from = getEdgePoint(fromCenterX, fromCenterY, dx / dist, dy / dist, fromNode.w / 2, fromNode.h / 2);
    const to = getEdgePoint(toCenterX, toCenterY, -dx / dist, -dy / dist, toNode.w / 2, toNode.h / 2);

    return { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y };
  }, []);

  // Calculate arrow paths
  const arrows = useMemo(() => {
    return dependencies.map((dep) => {
      const fromNode = nodes.find((n) => n.id === dep.fromWpId);
      const toNode = nodes.find((n) => n.id === dep.toWpId);
      if (!fromNode || !toNode) return null;
      const pts = computeArrow(fromNode, toNode);
      if (!pts) return null;
      return { id: dep.id, direction: dep.direction, ...pts };
    }).filter(Boolean);
  }, [dependencies, nodes, computeArrow]);


  // Handle drag — client px are divided by the zoom factor so the pointer
  // stays glued to the node at any zoom level.
  const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    setSelectedNode(nodeId);
    if (!canEdit) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    setDraggingNode(nodeId);
    setDragOffset({
      x: (e.clientX - svgRect.left) / zoom - node.x,
      y: (e.clientY - svgRect.top) / zoom - node.y,
    });
  }, [canEdit, nodes, zoom]);

  // Start a corner resize on the selected node.
  const handleResizeStart = useCallback((e: React.MouseEvent, node: WPNode, corner: Corner) => {
    if (!canEdit) return;
    e.stopPropagation();
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    setSelectedNode(node.id);
    setResizing({
      id: node.id,
      corner,
      startX: (e.clientX - svgRect.left) / zoom,
      startY: (e.clientY - svgRect.top) / zoom,
      origin: { x: node.x, y: node.y, w: node.w, h: node.h },
    });
  }, [canEdit, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const snapTo = (v: number) => (snap ? Math.round(v / PERT_MINOR_GRID) * PERT_MINOR_GRID : v);

    if (resizing) {
      const cx = (e.clientX - svgRect.left) / zoom;
      const cy = (e.clientY - svgRect.top) / zoom;
      const dx = cx - resizing.startX;
      const dy = cy - resizing.startY;
      const o = resizing.origin;
      let x = o.x;
      let y = o.y;
      let w = o.w;
      let h = o.h;
      if (resizing.corner.includes('e')) w = Math.max(NODE_MIN_W, snapTo(o.w + dx));
      if (resizing.corner.includes('s')) h = Math.max(NODE_MIN_H, snapTo(o.h + dy));
      if (resizing.corner.includes('w')) {
        const right = o.x + o.w;
        x = Math.max(0, Math.min(snapTo(o.x + dx), right - NODE_MIN_W));
        w = right - x;
      }
      if (resizing.corner.includes('n')) {
        const bottom = o.y + o.h;
        y = Math.max(0, Math.min(snapTo(o.y + dy), bottom - NODE_MIN_H));
        h = bottom - y;
      }
      onContentChange({
        ...content,
        nodePositions: { ...(content?.nodePositions || {}), [resizing.id]: { x, y } },
        nodeSizes: { ...(content?.nodeSizes || {}), [resizing.id]: { w, h } },
      });
      return;
    }

    if (!draggingNode) return;
    const newX = Math.max(0, snapTo((e.clientX - svgRect.left) / zoom - dragOffset.x));
    const newY = Math.max(0, snapTo((e.clientY - svgRect.top) / zoom - dragOffset.y));
    const newPositions = { ...(content?.nodePositions || {}), [draggingNode]: { x: newX, y: newY } };
    onContentChange({ ...content, nodePositions: newPositions });

  }, [draggingNode, dragOffset, content, onContentChange, snap, zoom, resizing]);

  const handleMouseUp = useCallback(() => { setDraggingNode(null); setResizing(null); }, []);

  // ---- Physical frame ------------------------------------------------------
  const frameWidthCm = Number(content?.widthCm) > 0 ? Number(content!.widthCm) : PERT_DEFAULT_WIDTH_CM;
  const frameHeightCm = Number(content?.heightCm) > 0 ? Number(content!.heightCm) : PERT_DEFAULT_HEIGHT_CM;
  const svgWidth = Math.round(cmToPx(frameWidthCm));
  const svgHeight = Math.round(cmToPx(frameHeightCm));
  const viewBoxStr = `0 0 ${svgWidth} ${svgHeight}`;

  const selected = selectedNode ? nodes.find((n) => n.id === selectedNode) : undefined;

  const setNodeSizeCm = useCallback((node: WPNode, widthCm?: number, heightCm?: number) => {
    const w = widthCm != null ? Math.max(NODE_MIN_W, cmToPx(widthCm)) : node.w;
    const h = heightCm != null ? Math.max(NODE_MIN_H, cmToPx(heightCm)) : node.h;
    onContentChange({
      ...content,
      nodeSizes: { ...(content?.nodeSizes || {}), [node.id]: { w, h } },
    });
  }, [content, onContentChange]);


  // ---- Zoom (editor only) --------------------------------------------------
  const applyZoom = useCallback((next: number, anchor?: { x: number; y: number }) => {
    setZoom((current) => {
      const clamped = Math.min(PERT_MAX_ZOOM, Math.max(PERT_MIN_ZOOM, next));
      const el = scrollRef.current;
      if (el) {
        const k = clamped / current;
        const px = anchor ? anchor.x : el.clientWidth / 2;
        const py = anchor ? anchor.y : el.clientHeight / 2;
        // Keep the point under the cursor (or the viewport centre) stationary.
        const nextLeft = (el.scrollLeft + px) * k - px;
        const nextTop = (el.scrollTop + py) * k - py;
        requestAnimationFrame(() => {
          el.scrollLeft = nextLeft;
          el.scrollTop = nextTop;
        });
      }
      return clamped;
    });
  }, []);

  // Non-passive wheel listener: React's onWheel is passive, so preventDefault
  // there is ignored and the page would scroll behind the chart.
  const applyZoomRef = useRef(applyZoom);
  useEffect(() => { applyZoomRef.current = applyZoom; }, [applyZoom]);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => {
    if (!canEdit) return;
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel keeps scrolling
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const rect = el.getBoundingClientRect();
      applyZoomRef.current(zoomRef.current * Math.exp(-dy * 0.0015), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [canEdit]);





  return (
    <div className={canEdit ? "space-y-4" : ""}>
      {canEdit && (
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Network className="w-4 h-4" />
            Figure {figureNumber}. PERT Chart
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Move className="w-3 h-3" />
              Drag nodes to reposition
            </span>

            {/* Snap + grid */}
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant={snap ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 w-7 p-0"
                title="Snap to grid (10 px)" aria-label="Toggle snap to grid"
                aria-pressed={snap}
                onClick={() => setSnap((v) => !v)}
              >
                <Magnet className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant={showGrid ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 w-7 p-0"
                title="Show grid (10 px minor, 50 px major)" aria-label="Toggle grid"
                aria-pressed={showGrid}
                onClick={() => setShowGrid((v) => !v)}
              >
                <Grid3x3 className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-0.5">
              <Button
                type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                title="Zoom out" aria-label="Zoom out"
                disabled={zoom <= PERT_MIN_ZOOM}
                onClick={() => applyZoom(zoom / 1.2)}
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <button
                type="button"
                className="h-7 min-w-[3rem] px-1 text-xs text-muted-foreground tabular-nums hover:text-foreground"
                title="Reset zoom to 100%" aria-label="Reset zoom"
                onClick={() => applyZoom(1)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button
                type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                title="Zoom in" aria-label="Zoom in"
                disabled={zoom >= PERT_MAX_ZOOM}
                onClick={() => applyZoom(zoom * 1.2)}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                title="Reset zoom" aria-label="Reset zoom"
                onClick={() => applyZoom(1)}
              >
                <Maximize className="w-3.5 h-3.5" />
              </Button>
            </div>


            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                  <Download className="w-3 h-3" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={async () => {
                  if (chartRef.current) {
                    const { exportAsPng } = await import('@/lib/figureExport');
                    await exportAsPng(chartRef.current, `PERT-Chart-Figure-${figureNumber}`);
                    toast.success('PNG downloaded');
                  }
                }}>
                  <Image className="w-4 h-4 mr-2" />
                  Download as PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  const exportData: PERTExportData = {
                    nodes: nodes.map(n => ({ id: n.id, number: n.number, shortName: n.shortName, color: n.color, x: n.x, y: n.y })),
                    arrows: dependencies.map(d => ({ fromNodeId: d.fromWpId, toNodeId: d.toWpId, direction: d.direction })),
                    svgWidth,
                    svgHeight,
                  };
                  const { exportPERTAsPptx } = await import('@/lib/figureExport');
                  await exportPERTAsPptx(exportData, `PERT-Chart-Figure-${figureNumber}`);
                  toast.success('PPTX downloaded');
                }}>
                  <FileDown className="w-4 h-4 mr-2" />
                  Download as PPTX
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      <TooltipProvider>
        <div
          ref={scrollRef}
          className={canEdit ? 'relative border rounded-lg bg-white overflow-auto' : 'bg-white overflow-auto'}
        >
          <div className="relative" style={canEdit ? { width: svgWidth * zoom, height: svgHeight * zoom } : undefined}>
          <div ref={chartRef} className="bg-white">
          <svg
            ref={svgRef}
            width={canEdit ? svgWidth * zoom : '18cm'}
            height={canEdit ? svgHeight * zoom : undefined}

            viewBox={viewBoxStr}
            preserveAspectRatio="xMidYMid meet"
            className="select-none"
            style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '10px' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
             <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
                <polygon points="0 0, 6 2.5, 0 5" fill="#64748b" />
              </marker>
              <marker id="arrowhead-start" markerWidth="6" markerHeight="5" refX="0" refY="2.5" orient="auto">
                <polygon points="6 0, 0 2.5, 6 5" fill="#64748b" />
              </marker>
            </defs>

            {/* Render nodes */}
            {nodes.map((node) => {
              return (
                <Tooltip key={node.id}>
                  <TooltipTrigger asChild>
                    <g
                      transform={`translate(${node.x}, ${node.y})`}
                      className={canEdit ? 'cursor-grab active:cursor-grabbing' : ''}
                      onMouseDown={(e) => handleMouseDown(e, node.id)}
                    >
                      <rect width={84} height={35} rx={6} ry={6} fill={node.color}
                        stroke={draggingNode === node.id ? 'hsl(var(--primary))' : 'transparent'} strokeWidth={1.5} className="transition-all" />
                      <text x={42} y={14} textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="bold">
                        WP{node.number}
                      </text>
                      {node.shortName && (
                        <text x={42} y={27} textAnchor="middle" fill="#FFFFFF" fontSize="10" opacity={0.9}>
                          {node.shortName}
                        </text>
                      )}
                    </g>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-sm">
                      <p className="font-semibold">WP{node.number}{node.shortName ? `: ${node.shortName}` : ''}</p>
                      {node.title && <p className="text-xs text-muted-foreground">{node.title}</p>}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}

            {/* Render arrows on top of nodes so arrowheads are always visible */}
            {arrows.map((arrow) => arrow && (
              <line
                key={`${arrow.id}-${arrow.direction}`}
                x1={arrow.fromX} y1={arrow.fromY}
                x2={arrow.toX} y2={arrow.toY}
                stroke="#64748b" strokeWidth="1"
                markerEnd={arrow.direction !== 'reverse' ? 'url(#arrowhead)' : undefined}
                markerStart={arrow.direction === 'reverse' || arrow.direction === 'bidirectional' ? 'url(#arrowhead-start)' : undefined}
              />
            ))}
          </svg>
          </div>

          {/* Grid overlay — editor-only aid, kept outside chartRef so exports
              and cached PNGs never include it. */}
          {canEdit && showGrid && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 1,
                backgroundImage: [
                  'linear-gradient(to right, rgba(0,0,0,0.18) 0, rgba(0,0,0,0.18) 1px, transparent 1px)',
                  'linear-gradient(to bottom, rgba(0,0,0,0.18) 0, rgba(0,0,0,0.18) 1px, transparent 1px)',
                  'linear-gradient(to right, rgba(0,0,0,0.07) 0, rgba(0,0,0,0.07) 1px, transparent 1px)',
                  'linear-gradient(to bottom, rgba(0,0,0,0.07) 0, rgba(0,0,0,0.07) 1px, transparent 1px)',
                ].join(', '),
                backgroundSize: [
                  `${PERT_MAJOR_GRID * zoom}px ${PERT_MAJOR_GRID * zoom}px`,
                  `${PERT_MAJOR_GRID * zoom}px ${PERT_MAJOR_GRID * zoom}px`,
                  `${PERT_MINOR_GRID * zoom}px ${PERT_MINOR_GRID * zoom}px`,
                  `${PERT_MINOR_GRID * zoom}px ${PERT_MINOR_GRID * zoom}px`,
                ].join(', '),
              }}
            />
          )}
          </div>
        </div>
      </TooltipProvider>


      {/* Legend - only in edit mode */}
      {canEdit && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-2">
          <span className="font-semibold">Legend:</span>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 bg-primary/20 rounded" />
            <span>Work package</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width="24" height="10">
              <line x1="0" y1="5" x2="18" y2="5" stroke="currentColor" strokeWidth="2" markerEnd="url(#arrowhead-legend)" />
              <defs>
                <marker id="arrowhead-legend" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="currentColor" />
                </marker>
              </defs>
            </svg>
            <span>Dependency</span>
          </div>
        </div>
      )}

      {/* Dependency Manager */}
      {canEdit && (
        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Network className="w-3.5 h-3.5" />
            Manage Dependencies
          </h4>

          {/* Dependencies list - each row is fully editable */}
          {dependencies.length > 0 && (
            <div className="space-y-1.5">
              {dependencies.map((dep) => (
                <div key={dep.id} className="flex items-center gap-2 text-sm bg-muted/50 px-3 py-1.5 rounded">
                  <Select value={dep.fromWpId} onValueChange={(v) => updateMutation.mutate({ id: dep.id, updates: { from_wp_id: v } })}>
                    <SelectTrigger className="flex-1 h-7 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {wpDrafts.map((wp) => (
                        <SelectItem key={wp.id} value={wp.id}>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded" style={{ backgroundColor: wp.color }} />
                            WP{wp.number}{wp.short_name ? `: ${wp.short_name}` : ''}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={dep.direction} onValueChange={(v) => updateMutation.mutate({ id: dep.id, updates: { direction: v } })}>
                    <SelectTrigger className="w-10 h-7 px-1 justify-center [&>svg]:hidden">
                      <SelectValue>
                        {dep.direction === 'forward' && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        {dep.direction === 'reverse' && <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />}
                        {dep.direction === 'bidirectional' && <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="min-w-0 w-auto">
                      <SelectItem value="forward"><ArrowRight className="w-4 h-4" /></SelectItem>
                      <SelectItem value="reverse"><ArrowLeft className="w-4 h-4" /></SelectItem>
                      <SelectItem value="bidirectional"><ArrowLeftRight className="w-4 h-4" /></SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={dep.toWpId} onValueChange={(v) => updateMutation.mutate({ id: dep.id, updates: { to_wp_id: v } })}>
                    <SelectTrigger className="flex-1 h-7 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {wpDrafts.map((wp) => (
                        <SelectItem key={wp.id} value={wp.id}>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded" style={{ backgroundColor: wp.color }} />
                            WP{wp.number}{wp.short_name ? `: ${wp.short_name}` : ''}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost" size="sm"
                     className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                    onClick={() => deleteMutation.mutate(dep.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Incomplete (unsaved) dependency rows */}
          {incompleteDeps.map((dep) => (
            <div key={dep.tempId} className="flex items-center gap-2 text-sm bg-muted/50 px-3 py-1.5 rounded">
              <Select value={dep.fromWpId || undefined} onValueChange={(v) => {
                const updated = { ...dep, fromWpId: v };
                setIncompleteDeps(prev => prev.map(d => d.tempId === dep.tempId ? updated : d));
                if (v && updated.toWpId) saveIncompleteDep(dep.tempId, v, updated.toWpId, updated.direction);
              }}>
                <SelectTrigger className="flex-1 h-7 text-sm">
                  <SelectValue placeholder="Select WP…" />
                </SelectTrigger>
                <SelectContent>
                  {wpDrafts.map((wp) => (
                    <SelectItem key={wp.id} value={wp.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded" style={{ backgroundColor: wp.color }} />
                        WP{wp.number}{wp.short_name ? `: ${wp.short_name}` : ''}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dep.direction} onValueChange={(v) => {
                const updated = { ...dep, direction: v as DependencyDirection };
                setIncompleteDeps(prev => prev.map(d => d.tempId === dep.tempId ? updated : d));
              }}>
                <SelectTrigger className="w-10 h-7 px-1 justify-center [&>svg]:hidden">
                  <SelectValue>
                    {dep.direction === 'forward' && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    {dep.direction === 'reverse' && <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />}
                    {dep.direction === 'bidirectional' && <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="min-w-0 w-auto">
                  <SelectItem value="forward"><ArrowRight className="w-4 h-4" /></SelectItem>
                  <SelectItem value="reverse"><ArrowLeft className="w-4 h-4" /></SelectItem>
                  <SelectItem value="bidirectional"><ArrowLeftRight className="w-4 h-4" /></SelectItem>
                </SelectContent>
              </Select>
              <Select value={dep.toWpId || undefined} onValueChange={(v) => {
                const updated = { ...dep, toWpId: v };
                setIncompleteDeps(prev => prev.map(d => d.tempId === dep.tempId ? updated : d));
                if (updated.fromWpId && v) saveIncompleteDep(dep.tempId, updated.fromWpId, v, updated.direction);
              }}>
                <SelectTrigger className="flex-1 h-7 text-sm">
                  <SelectValue placeholder="Select WP…" />
                </SelectTrigger>
                <SelectContent>
                  {wpDrafts.map((wp) => (
                    <SelectItem key={wp.id} value={wp.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded" style={{ backgroundColor: wp.color }} />
                        WP{wp.number}{wp.short_name ? `: ${wp.short_name}` : ''}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                onClick={() => setIncompleteDeps(prev => prev.filter(d => d.tempId !== dep.tempId))}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}

          {/* Add new dependency button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs gap-1"
            onClick={handleAddEmptyRow}
            disabled={wpDrafts.length < 2}
          >
            <Plus className="w-3.5 h-3.5" />
            Add dependency
          </Button>
        </div>
      )}
    </div>
  );
}
