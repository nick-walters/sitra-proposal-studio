import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Plus, GripVertical, ChevronsUpDown } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { getDefaultWPColor } from '@/lib/wpColors';
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
  color?: string | null;
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
  { value: 'H', label: 'High', borderColor: '#ef4444' },
  { value: 'M', label: 'Medium', borderColor: '#f59e0b' },
  { value: 'L', label: 'Low', borderColor: '#22c55e' },
];

function RiskLevelBubble({ level }: { level: string }) {
  const colorMap: Record<string, string> = { H: '#ef4444', M: '#f59e0b', L: '#22c55e' };
  const levelColor = colorMap[level] || '#000';
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap"
      style={{ backgroundColor: '#ffffff', color: levelColor, border: `1.5px solid ${levelColor}`, fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, padding: '0px', width: '19px', height: '17px' }}
    >
      {level}
    </span>
  );
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

  const [wpPopoverOpen, setWpPopoverOpen] = useState(false);


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
        const wpDraft = allWpDrafts.find(w => w.number === n);
        const color = wpDraft?.color || getDefaultWPColor(n);
        const textColor = '#ffffff';
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
      {/* Row 1: Drag handle, Risk title (2 lines), Delete */}
      <div className="flex items-start gap-1.5">
        {canReorder && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded touch-none flex-shrink-0 mt-0.5"
          >
            <GripVertical className="w-4 h-4 text-[#2563EB]" />
          </button>
        )}
        <DebouncedTextarea
          value={risk.title || ''}
          onDebouncedChange={(val) => { onUpdate(risk.id, { title: val }); }}
          debounceMs={500}
          placeholder="Describe the risk..."
          className="min-h-[28px] resize-none text-draft flex-1 overflow-hidden font-bold"
          style={{ height: 'auto', fieldSizing: 'content' } as any}
          disabled={readOnly}
        />
        {!readOnly && (
          <DeleteConfirmDialog
            itemLabel="this risk"
            onConfirm={() => onDelete(risk.id)}
          />
        )}
      </div>

      {/* Row 2: Likelihood, Severity, WPs */}
      <div className="flex items-center gap-3 mt-1.5 ml-5">
        <div className="flex items-center gap-1">
          <span className="text-draft text-muted-foreground">Likelihood:</span>
          <Select
            value={risk.likelihood || undefined}
            onValueChange={(value) => onUpdate(risk.id, { likelihood: value === '__clear__' ? null : value })}
            disabled={readOnly}
          >
            <SelectTrigger hideArrow className="h-6 w-auto min-w-[28px] px-0.5 border-0 bg-transparent focus:ring-0">
              {risk.likelihood ? <RiskLevelBubble level={risk.likelihood} /> : <span className="text-muted-foreground text-draft">Select</span>}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__clear__">
                <span className="text-muted-foreground italic">Clear</span>
              </SelectItem>
              {RISK_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  <div className="flex items-center gap-2">
                    <RiskLevelBubble level={level.value} />
                    <span>{level.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-draft text-muted-foreground">Severity:</span>
          <Select
            value={risk.severity || undefined}
            onValueChange={(value) => onUpdate(risk.id, { severity: value === '__clear__' ? null : value })}
            disabled={readOnly}
          >
            <SelectTrigger hideArrow className="h-6 w-auto min-w-[28px] px-0.5 border-0 bg-transparent focus:ring-0">
              {risk.severity ? <RiskLevelBubble level={risk.severity} /> : <span className="text-muted-foreground text-draft">Select</span>}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__clear__">
                <span className="text-muted-foreground italic">Clear</span>
              </SelectItem>
              {RISK_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  <div className="flex items-center gap-2">
                    <RiskLevelBubble level={level.value} />
                    <span>{level.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-draft text-muted-foreground flex-shrink-0">WPs:</span>
          <Popover open={wpPopoverOpen} onOpenChange={setWpPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-draft px-2 flex-1 justify-between font-normal"
                disabled={readOnly}
              >
                {displayWpBubbles || <span className="text-muted-foreground">Select</span>}
                <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {allWpDrafts.map(wp => {
                  const color = wp.color || getDefaultWPColor(wp.number);
                  const textColor = '#ffffff';
                  return (
                    <label
                      key={wp.id}
                      className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer text-draft"
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
                  <p className="text-draft text-muted-foreground px-1">No WPs found</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Row 3: Mitigation */}
      <div className="flex items-start gap-1.5 mt-1.5 ml-5">
        <DebouncedTextarea
          value={risk.mitigation || ''}
          onDebouncedChange={(val) => { onUpdate(risk.id, { mitigation: val }); }}
          debounceMs={500}
          placeholder="Describe mitigation & adaptation measures..."
          className="min-h-[40px] resize-y text-draft flex-1"
          disabled={readOnly}
        />
      </div>
    </div>
  );
}
