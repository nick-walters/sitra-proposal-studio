import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Plus, Trash2, GripVertical, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDefaultWPColor, getContrastingTextColor } from '@/lib/wpColors';
import type { WPDraftRisk } from '@/hooks/useWPDrafts';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface WPOption {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
}

interface WPRisksTableProps {
  wpNumber: number;
  risks: WPDraftRisk[];
  onRiskUpdate: (id: string, updates: Partial<WPDraftRisk>) => Promise<boolean>;
  onRiskAdd: () => Promise<any>;
  onRiskDelete: (id: string) => Promise<boolean>;
  onRiskReorder?: (newOrder: string[]) => Promise<boolean>;
  readOnly?: boolean;
  allWpDrafts?: WPOption[];
}

const RISK_LEVELS = [
  { value: 'H', label: 'High', color: 'text-red-600 bg-red-50' },
  { value: 'M', label: 'Medium', color: 'text-amber-600 bg-amber-50' },
  { value: 'L', label: 'Low', color: 'text-green-600 bg-green-50' },
];

function getRiskLevelColor(level: string | null): string {
  const found = RISK_LEVELS.find(l => l.value === level);
  return found?.color || '';
}

export function WPRisksTable({
  wpNumber,
  risks,
  onRiskUpdate,
  onRiskAdd,
  onRiskDelete,
  onRiskReorder,
  readOnly = false,
  allWpDrafts = [],
}: WPRisksTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onRiskReorder) return;

    const oldIndex = risks.findIndex((r) => r.id === active.id);
    const newIndex = risks.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(risks, oldIndex, newIndex);
    
    onRiskReorder(reordered.map(r => r.id));
  };

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4" />
          Risks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-3 pt-0">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={risks.map(r => r.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {risks.map((risk) => (
                <SortableRiskCard
                  key={risk.id}
                  risk={risk}
                  onUpdate={onRiskUpdate}
                  onDelete={onRiskDelete}
                  readOnly={readOnly}
                  canReorder={!readOnly && !!onRiskReorder}
                  allWpDrafts={allWpDrafts}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRiskAdd}
            className="mt-1"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add risk
          </Button>
        )}

        {/* Colour legend */}
        <div className="flex items-center gap-3 mt-2 pt-2 border-t text-xs text-muted-foreground">
          <span>Likelihood / Severity:</span>
          {RISK_LEVELS.map(level => (
            <span key={level.value} className={cn("px-1.5 py-0.5 rounded text-xs font-medium", level.color)}>
              {level.value} = {level.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface SortableRiskCardProps {
  risk: WPDraftRisk;
  onUpdate: (id: string, updates: Partial<WPDraftRisk>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  readOnly: boolean;
  canReorder: boolean;
  allWpDrafts: WPOption[];
}

function SortableRiskCard({
  risk,
  onUpdate,
  onDelete,
  readOnly,
  canReorder,
  allWpDrafts,
}: SortableRiskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: risk.id, disabled: !canReorder });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [localTitle, setLocalTitle] = useState(risk.title || '');
  const [localMitigation, setLocalMitigation] = useState(risk.mitigation || '');
  const [titleTimeout, setTitleTimeout] = useState<NodeJS.Timeout | null>(null);
  const [mitigationTimeout, setMitigationTimeout] = useState<NodeJS.Timeout | null>(null);
  const [wpPopoverOpen, setWpPopoverOpen] = useState(false);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setLocalTitle(risk.title || '');
  }, [risk.title]);

  useEffect(() => {
    if (!isFocused.current) setLocalMitigation(risk.mitigation || '');
  }, [risk.mitigation]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalTitle(newValue);

    if (titleTimeout) clearTimeout(titleTimeout);
    
    const timeout = setTimeout(() => {
      onUpdate(risk.id, { title: newValue });
    }, 500);
    setTitleTimeout(timeout);
  };

  const handleMitigationChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalMitigation(newValue);

    if (mitigationTimeout) clearTimeout(mitigationTimeout);
    
    const timeout = setTimeout(() => {
      onUpdate(risk.id, { mitigation: newValue });
    }, 500);
    setMitigationTimeout(timeout);
  };

  // Parse related_wps string into array of WP numbers
  const selectedWpNumbers: number[] = (() => {
    const raw = risk.related_wps || '';
    if (!raw.trim()) return [];
    return raw.split(',')
      .map(s => parseInt(s.replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n));
  })();

  const toggleWp = (wpNumber: number) => {
    const current = new Set(selectedWpNumbers);
    if (current.has(wpNumber)) current.delete(wpNumber);
    else current.add(wpNumber);
    const sorted = Array.from(current).sort((a, b) => a - b);
    const value = sorted.map(n => `WP${n}`).join(', ');
    onUpdate(risk.id, { related_wps: value });
  };

  // Display selected WPs as colour-coded bubbles
  const displayWpBubbles = selectedWpNumbers.length > 0 ? (
    <span className="flex items-center gap-0.5 flex-wrap">
      {selectedWpNumbers.map(n => {
        const color = getDefaultWPColor(n);
        const textColor = getContrastingTextColor(color);
        return (
          <span
            key={n}
            className="inline-flex items-center justify-center px-1.5 rounded-full text-[10px] font-bold leading-[17px]"
            style={{
              backgroundColor: color,
              color: textColor,
              height: '17px',
              fontFamily: 'Times New Roman, serif',
              fontSize: '11pt',
            }}
          >
            WP{n}
          </span>
        );
      })}
    </span>
  ) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border bg-card p-2 ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Row 1: Drag handle, Risk title, Likelihood, Severity, Delete */}
      <div className="flex items-center gap-1.5">
        {canReorder && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded touch-none flex-shrink-0"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Risk:</span>
        </div>
        <Input
          value={localTitle}
          onChange={handleTitleChange}
          onFocus={() => { isFocused.current = true; }}
          onBlur={() => { isFocused.current = false; }}
          placeholder="Describe the risk..."
          className="h-6 text-xs flex-1"
          disabled={readOnly}
        />
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Likelihood:</span>
          <Select
            value={risk.likelihood || ''}
            onValueChange={(value) => onUpdate(risk.id, { likelihood: value })}
            disabled={readOnly}
          >
            <SelectTrigger hideArrow className={cn("h-6 w-[32px] text-xs px-1.5", getRiskLevelColor(risk.likelihood))}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {RISK_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Severity:</span>
          <Select
            value={risk.severity || ''}
            onValueChange={(value) => onUpdate(risk.id, { severity: value })}
            disabled={readOnly}
          >
            <SelectTrigger hideArrow className={cn("h-6 w-[32px] text-xs px-1.5", getRiskLevelColor(risk.severity))}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {RISK_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive/80 flex-shrink-0"
            onClick={() => onDelete(risk.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Row 2: WPs + Mitigation */}
      <div className="flex items-start gap-1.5 mt-1.5 ml-5">
        <div className="flex items-center gap-1 flex-shrink-0 pt-1">
          <span className="text-xs text-muted-foreground">WPs:</span>
          <Popover open={wpPopoverOpen} onOpenChange={setWpPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2 min-w-[70px] max-w-[200px] justify-between font-normal"
                disabled={readOnly}
              >
                {displayWpBubbles || <span className="text-muted-foreground">Select</span>}
                <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {allWpDrafts.map(wp => {
                  const color = getDefaultWPColor(wp.number);
                  const textColor = getContrastingTextColor(color);
                  return (
                    <label
                      key={wp.id}
                      className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer text-xs"
                    >
                      <Checkbox
                        checked={selectedWpNumbers.includes(wp.number)}
                        onCheckedChange={() => toggleWp(wp.number)}
                      />
                      <span
                        className="inline-flex items-center justify-center px-1.5 rounded-full font-bold"
                        style={{
                          backgroundColor: color,
                          color: textColor,
                          height: '17px',
                          fontFamily: 'Times New Roman, serif',
                          fontSize: '11pt',
                          lineHeight: '17px',
                        }}
                      >
                        WP{wp.number}
                      </span>
                    </label>
                  );
                })}
                {allWpDrafts.length === 0 && (
                  <p className="text-xs text-muted-foreground px-1">No WPs found</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Textarea
          value={localMitigation}
          onChange={handleMitigationChange}
          onFocus={() => { isFocused.current = true; }}
          onBlur={() => { isFocused.current = false; }}
          placeholder="Describe mitigation & adaptation measures..."
          className="min-h-[40px] resize-y text-xs flex-1"
          disabled={readOnly}
        />
      </div>
    </div>
  );
}
