import { useState, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, Network, Move, Plus, Trash2, ArrowRight, ArrowLeft, ArrowLeftRight, Image, FileDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { exportAsPng, exportPERTAsPptx, type PERTExportData } from '@/lib/figureExport';
import { toast } from 'sonner';

interface WPNode {
  id: string;
  number: number;
  shortName: string;
  title: string;
  color: string;
  x: number;
  y: number;
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
}

interface PERTChartFigureProps {
  figureNumber: string;
  proposalId: string;
  content: PERTContent | null;
  onContentChange: (content: PERTContent) => void;
  canEdit: boolean;
}

export function PERTChartFigure({
  figureNumber,
  proposalId,
  content,
  onContentChange,
  canEdit,
}: PERTChartFigureProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

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
    const nodeWidth = 120;
    const nodeHeight = 60;
    const hGap = 80;
    const vGap = 60;
    const startX = 20;
    const startY = 20;

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

  // Create node objects
  const nodes: WPNode[] = useMemo(() => {
    return wpDrafts.map((wp) => ({
      id: wp.id,
      number: wp.number,
      shortName: wp.short_name || `WP${wp.number}`,
      title: wp.title || '',
      color: wp.color,
      x: nodePositions[wp.id]?.x || 100,
      y: nodePositions[wp.id]?.y || 100,
    }));
  }, [wpDrafts, nodePositions]);

  // Helper to compute arrow between two nodes
  const computeArrow = useCallback((fromNode: WPNode, toNode: WPNode) => {
    const nodeWidth = 120;
    const nodeHeight = 50;
    
    const fromCenterX = fromNode.x + nodeWidth / 2;
    const fromCenterY = fromNode.y + nodeHeight / 2;
    const toCenterX = toNode.x + nodeWidth / 2;
    const toCenterY = toNode.y + nodeHeight / 2;

    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return null;

    // Use rectangle intersection for precise edge contact
    const halfW = nodeWidth / 2;
    const halfH = nodeHeight / 2;

    const getEdgePoint = (cx: number, cy: number, adx: number, ady: number) => {
      const absDx = Math.abs(adx);
      const absDy = Math.abs(ady);
      let scale: number;
      if (absDx * halfH > absDy * halfW) {
        scale = halfW / absDx;
      } else {
        scale = halfH / absDy;
      }
      return { x: cx + adx * scale, y: cy + ady * scale };
    };

    const from = getEdgePoint(fromCenterX, fromCenterY, dx / dist, dy / dist);
    const to = getEdgePoint(toCenterX, toCenterY, -dx / dist, -dy / dist);

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


  // Handle drag
  const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (!canEdit) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    setDraggingNode(nodeId);
    setDragOffset({ x: e.clientX - svgRect.left - node.x, y: e.clientY - svgRect.top - node.y });
  }, [canEdit, nodes]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingNode) return;
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const newX = Math.max(0, e.clientX - svgRect.left - dragOffset.x);
    const newY = Math.max(0, e.clientY - svgRect.top - dragOffset.y);
    const newPositions = { ...(content?.nodePositions || {}), [draggingNode]: { x: newX, y: newY } };
    onContentChange({ ...content, nodePositions: newPositions });
  }, [draggingNode, dragOffset, content, onContentChange]);

  const handleMouseUp = useCallback(() => { setDraggingNode(null); }, []);

  const nodeW = 120;
  const nodeH = 50;
  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + nodeW));
  const maxY = Math.max(...nodes.map(n => n.y + nodeH));
  const pad = canEdit ? 30 : 5;
  const svgWidth = canEdit ? Math.max(800, maxX + pad) : (maxX - minX + pad * 2);
  const svgHeight = canEdit ? Math.max(400, maxY + pad) : (maxY - minY + pad * 2);
  const viewBoxStr = canEdit ? `0 0 ${svgWidth} ${svgHeight}` : `${minX - pad} ${minY - pad} ${svgWidth} ${svgHeight}`;

  const getWpLabel = (wpId: string) => {
    const wp = wpDrafts.find((w) => w.id === wpId);
    if (!wp) return 'Unknown';
    return `WP${wp.number}${wp.short_name ? `: ${wp.short_name}` : ''}`;
  };

  const getWpColor = (wpId: string) => {
    return wpDrafts.find((w) => w.id === wpId)?.color || '#888';
  };

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                  <Download className="w-3 h-3" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  if (chartRef.current) {
                    exportAsPng(chartRef.current, `PERT-Chart-Figure-${figureNumber}`);
                    toast.success('PNG downloaded');
                  }
                }}>
                  <Image className="w-4 h-4 mr-2" />
                  Download as PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const exportData: PERTExportData = {
                    nodes: nodes.map(n => ({ id: n.id, number: n.number, shortName: n.shortName, color: n.color, x: n.x, y: n.y })),
                    arrows: dependencies.map(d => ({ fromNodeId: d.fromWpId, toNodeId: d.toWpId, direction: d.direction })),
                    svgWidth,
                    svgHeight,
                  };
                  exportPERTAsPptx(exportData, `PERT-Chart-Figure-${figureNumber}`);
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
        <div ref={chartRef} className={canEdit ? "border rounded-lg bg-background overflow-auto" : "overflow-auto"}>
          <svg
            ref={svgRef}
            width={canEdit ? svgWidth : '18cm'}
            height={canEdit ? svgHeight : undefined}
            viewBox={viewBoxStr}
            preserveAspectRatio="xMidYMid meet"
            className="select-none"
            style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt' }}
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

            {/* Render nodes first (below arrows) */}
            {nodes.map((node) => {
              return (
                <Tooltip key={node.id}>
                  <TooltipTrigger asChild>
                    <g
                      transform={`translate(${node.x}, ${node.y})`}
                      className={canEdit ? 'cursor-grab active:cursor-grabbing' : ''}
                      onMouseDown={(e) => handleMouseDown(e, node.id)}
                    >
                      <rect width={120} height={50} rx={8} ry={8} fill={node.color}
                        stroke={draggingNode === node.id ? 'hsl(var(--primary))' : 'transparent'} strokeWidth={2} className="transition-all" />
                      <text x={60} y={20} textAnchor="middle" fill="#FFFFFF" fontSize="11pt" fontWeight="bold">
                        WP{node.number}
                      </text>
                      <text x={60} y={38} textAnchor="middle" fill="#FFFFFF" fontSize="11pt" opacity={0.9}>
                        {node.shortName.length > 12 ? node.shortName.substring(0, 11) + '…' : node.shortName}
                      </text>
                    </g>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-sm">
                      <p className="font-semibold">WP{node.number}: {node.shortName}</p>
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
      </TooltipProvider>

      {/* Legend - only in edit mode */}
      {canEdit && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-2">
          <span className="font-semibold">Legend:</span>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 bg-primary/20 rounded" />
            <span>Work Package</span>
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
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
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
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
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
