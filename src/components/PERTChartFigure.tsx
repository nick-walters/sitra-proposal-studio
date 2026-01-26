import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Network, Move } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { getContrastingTextColor } from '@/lib/wpColors';

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

  // Calculate arrow paths
  const arrows = useMemo(() => {
    return dependencies.map((dep) => {
      const fromNode = nodes.find((n) => n.id === dep.fromWpId);
      const toNode = nodes.find((n) => n.id === dep.toWpId);
      if (!fromNode || !toNode) return null;

      const nodeWidth = 120;
      const nodeHeight = 50;
      
      // Calculate centers
      const fromCenterX = fromNode.x + nodeWidth / 2;
      const fromCenterY = fromNode.y + nodeHeight / 2;
      const toCenterX = toNode.x + nodeWidth / 2;
      const toCenterY = toNode.y + nodeHeight / 2;

      // Calculate angle
      const dx = toCenterX - fromCenterX;
      const dy = toCenterY - fromCenterY;
      const angle = Math.atan2(dy, dx);

      // Calculate edge points
      const fromX = fromCenterX + Math.cos(angle) * (nodeWidth / 2);
      const fromY = fromCenterY + Math.sin(angle) * (nodeHeight / 2);
      const toX = toCenterX - Math.cos(angle) * (nodeWidth / 2 + 10); // 10px offset for arrowhead
      const toY = toCenterY - Math.sin(angle) * (nodeHeight / 2 + 10);

      return {
        id: dep.id,
        fromX,
        fromY,
        toX,
        toY,
      };
    }).filter(Boolean);
  }, [dependencies, nodes]);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (!canEdit) return;
    
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;

    setDraggingNode(nodeId);
    setDragOffset({
      x: e.clientX - svgRect.left - node.x,
      y: e.clientY - svgRect.top - node.y,
    });
  }, [canEdit, nodes]);

  // Handle drag
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingNode) return;

    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;

    const newX = Math.max(0, e.clientX - svgRect.left - dragOffset.x);
    const newY = Math.max(0, e.clientY - svgRect.top - dragOffset.y);

    const newPositions = {
      ...(content?.nodePositions || {}),
      [draggingNode]: { x: newX, y: newY },
    };

    onContentChange({ ...content, nodePositions: newPositions });
  }, [draggingNode, dragOffset, content, onContentChange]);

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    setDraggingNode(null);
  }, []);

  // Calculate SVG dimensions
  const svgWidth = Math.max(800, ...nodes.map((n) => n.x + 150));
  const svgHeight = Math.max(400, ...nodes.map((n) => n.y + 100));

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
            {/* Arrow marker definition */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="currentColor"
                  className="text-muted-foreground"
                />
              </marker>
            </defs>

            {/* Arrows */}
            {arrows.map((arrow) => arrow && (
              <line
                key={arrow.id}
                x1={arrow.fromX}
                y1={arrow.fromY}
                x2={arrow.toX}
                y2={arrow.toY}
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted-foreground"
                markerEnd="url(#arrowhead)"
              />
            ))}

            {/* Nodes */}
            {nodes.map((node) => {
              const textColor = getContrastingTextColor(node.color);
              return (
                <Tooltip key={node.id}>
                  <TooltipTrigger asChild>
                    <g
                      transform={`translate(${node.x}, ${node.y})`}
                      className={canEdit ? 'cursor-grab active:cursor-grabbing' : ''}
                      onMouseDown={(e) => handleMouseDown(e, node.id)}
                    >
                      {/* Node rectangle */}
                      <rect
                        width={120}
                        height={50}
                        rx={8}
                        ry={8}
                        fill={node.color}
                        stroke={draggingNode === node.id ? 'hsl(var(--primary))' : 'transparent'}
                        strokeWidth={2}
                        className="transition-all"
                      />
                      {/* WP Number */}
                      <text
                        x={60}
                        y={20}
                        textAnchor="middle"
                        fill={textColor}
                        fontSize={12}
                        fontWeight="bold"
                      >
                        WP{node.number}
                      </text>
                      {/* Short Name */}
                      <text
                        x={60}
                        y={38}
                        textAnchor="middle"
                        fill={textColor}
                        fontSize={11}
                        opacity={0.9}
                      >
                        {node.shortName.length > 12 
                          ? node.shortName.substring(0, 11) + '…' 
                          : node.shortName}
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

      {dependencies.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No dependencies defined. Add dependencies from the Proposal Overview page.
        </p>
      )}
    </div>
  );
}
