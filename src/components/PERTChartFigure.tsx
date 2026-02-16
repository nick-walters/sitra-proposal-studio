import { useState, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Network, Move, Plus, Trash2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
}

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
  const queryClient = useQueryClient();
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [fromWp, setFromWp] = useState<string>('');
  const [toWp, setToWp] = useState<string>('');

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
        .select('id, from_wp_id, to_wp_id')
        .eq('proposal_id', proposalId);
      if (error) throw error;
      return data.map((d) => ({
        id: d.id,
        fromWpId: d.from_wp_id,
        toWpId: d.to_wp_id,
      })) as Dependency[];
    },
  });

  // Add dependency mutation
  const addMutation = useMutation({
    mutationFn: async () => {
      if (!fromWp || !toWp) return;
      if (fromWp === toWp) throw new Error('A WP cannot depend on itself');
      const exists = dependencies.some(d => d.fromWpId === fromWp && d.toWpId === toWp);
      if (exists) throw new Error('This dependency already exists');

      const { error } = await supabase.from('wp_dependencies').insert({
        proposal_id: proposalId,
        from_wp_id: fromWp,
        to_wp_id: toWp,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-dependencies-pert', proposalId] });
      setFromWp('');
      setToWp('');
      toast.success('Dependency added');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add dependency');
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
    const startX = 100;
    const startY = 80;

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
      return { id: dep.id, ...pts };
    }).filter(Boolean);
  }, [dependencies, nodes, computeArrow]);

  // Preview arrow for selected dropdowns
  const previewArrow = useMemo(() => {
    if (!fromWp || !toWp || fromWp === toWp) return null;
    const fromNode = nodes.find((n) => n.id === fromWp);
    const toNode = nodes.find((n) => n.id === toWp);
    if (!fromNode || !toNode) return null;
    // Don't show preview if this dependency already exists
    if (dependencies.some(d => d.fromWpId === fromWp && d.toWpId === toWp)) return null;
    const pts = computeArrow(fromNode, toNode);
    if (!pts) return null;
    return { id: 'preview', ...pts };
  }, [fromWp, toWp, nodes, dependencies, computeArrow]);

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

  const svgWidth = Math.max(800, ...nodes.map((n) => n.x + 150));
  const svgHeight = Math.max(400, ...nodes.map((n) => n.y + 100));

  const getWpLabel = (wpId: string) => {
    const wp = wpDrafts.find((w) => w.id === wpId);
    if (!wp) return 'Unknown';
    return `WP${wp.number}${wp.short_name ? `: ${wp.short_name}` : ''}`;
  };

  const getWpColor = (wpId: string) => {
    return wpDrafts.find((w) => w.id === wpId)?.color || '#888';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Network className="w-4 h-4" />
          Figure {figureNumber}. PERT Chart
        </h3>
        <div className="flex items-center gap-2">
          {canEdit && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Move className="w-3 h-3" />
              Drag nodes to reposition
            </span>
          )}
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
            <Download className="w-3 h-3" />
            Export
          </Button>
        </div>
      </div>

      <TooltipProvider>
        <div className="border rounded-lg bg-background overflow-auto">
          <svg
            ref={svgRef}
            width={svgWidth}
            height={svgHeight}
            className="select-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" className="text-muted-foreground" />
              </marker>
            </defs>

            {arrows.map((arrow) => arrow && (
              <line
                key={arrow.id}
                x1={arrow.fromX} y1={arrow.fromY}
                x2={arrow.toX} y2={arrow.toY}
                stroke="currentColor" strokeWidth="2"
                className="text-muted-foreground"
                markerEnd="url(#arrowhead)"
              />
            ))}

            {/* Preview arrow */}
            {previewArrow && (
              <line
                x1={previewArrow.fromX} y1={previewArrow.fromY}
                x2={previewArrow.toX} y2={previewArrow.toY}
                stroke="currentColor" strokeWidth="2" strokeDasharray="6 3"
                className="text-muted-foreground/50"
                markerEnd="url(#arrowhead)"
              />
            )}

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
                      <text x={60} y={20} textAnchor="middle" fill="#FFFFFF" fontSize={12} fontWeight="bold">
                        WP{node.number}
                      </text>
                      <text x={60} y={38} textAnchor="middle" fill="#FFFFFF" fontSize={11} opacity={0.9}>
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
          </svg>
        </div>
      </TooltipProvider>

      {/* Legend */}
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

      {/* Dependency Manager */}
      {canEdit && (
        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Network className="w-3.5 h-3.5" />
            Manage Dependencies
          </h4>

          {/* Existing dependencies list */}
          {dependencies.length > 0 && (
            <div className="space-y-1.5">
              {dependencies.map((dep) => (
                <div key={dep.id} className="flex items-center gap-2 text-sm bg-muted/50 px-3 py-1.5 rounded">
                  <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: getWpColor(dep.fromWpId) }} />
                  <span className="font-medium">{getWpLabel(dep.fromWpId)}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: getWpColor(dep.toWpId) }} />
                  <span className="font-medium">{getWpLabel(dep.toWpId)}</span>
                  <Button
                    variant="ghost" size="sm"
                    className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(dep.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add new dependency */}
          <div className="flex items-center gap-2 pt-1 border-t">
            <Select value={fromWp} onValueChange={setFromWp}>
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="From WP..." />
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
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={toWp} onValueChange={setToWp}>
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="To WP..." />
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
            <Button size="sm" className="h-8" onClick={() => addMutation.mutate()} disabled={!fromWp || !toWp || addMutation.isPending}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
