import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
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

interface WPRisksTableProps {
  wpNumber: number;
  risks: WPDraftRisk[];
  onRiskUpdate: (id: string, updates: Partial<WPDraftRisk>) => Promise<boolean>;
  onRiskAdd: () => Promise<any>;
  onRiskDelete: (id: string) => Promise<boolean>;
  onRiskReorder?: (newOrder: string[]) => Promise<boolean>;
  readOnly?: boolean;
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
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4" />
          Risks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
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
            Add Risk
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
}

function SortableRiskCard({
  risk,
  onUpdate,
  onDelete,
  readOnly,
  canReorder,
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

  useEffect(() => {
    setLocalTitle(risk.title || '');
  }, [risk.title]);

  useEffect(() => {
    setLocalMitigation(risk.mitigation || '');
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
            <SelectTrigger className={cn("h-6 w-[42px] text-xs px-1.5", getRiskLevelColor(risk.likelihood))}>
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
            <SelectTrigger className={cn("h-6 w-[42px] text-xs px-1.5", getRiskLevelColor(risk.severity))}>
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
            className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0"
            onClick={() => onDelete(risk.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Row 2: Mitigation & adaptation measures */}
      <div className="flex items-start gap-1.5 mt-1.5 ml-5">
        <span className="text-xs text-muted-foreground flex-shrink-0 mt-1">Mitigation & adaptation measures:</span>
        <Textarea
          value={localMitigation}
          onChange={handleMitigationChange}
          placeholder="Describe mitigation strategies..."
          className="min-h-[40px] resize-y text-xs flex-1"
          disabled={readOnly}
        />
      </div>
    </div>
  );
}
