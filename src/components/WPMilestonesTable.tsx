import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Flag, Plus, Trash2, GripVertical, ChevronsUpDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SingleMonthPicker } from '@/components/SingleMonthPicker';
import { getDefaultWPColor } from '@/lib/wpColors';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { WPSimpleEditor } from '@/components/WPSimpleEditor';
import type { WPDraftMilestone } from '@/hooks/useWPDrafts';
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

interface WPMilestonesTableProps {
  wpNumber: number;
  milestones: WPDraftMilestone[];
  onMilestoneUpdate: (id: string, updates: Partial<WPDraftMilestone>) => Promise<boolean>;
  onMilestoneAdd: () => Promise<any>;
  onMilestoneDelete: (id: string) => Promise<boolean>;
  onMilestoneReorder?: (newOrder: string[]) => Promise<boolean>;
  readOnly?: boolean;
  projectDuration?: number;
  allWpDrafts?: WPOption[];
}

export function WPMilestonesTable({
  wpNumber,
  milestones,
  onMilestoneUpdate,
  onMilestoneAdd,
  onMilestoneDelete,
  onMilestoneReorder,
  readOnly = false,
  projectDuration = 48,
  allWpDrafts = [],
}: WPMilestonesTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const monthOptions = Array.from({ length: projectDuration }, (_, i) => i + 1);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onMilestoneReorder) return;

    const oldIndex = milestones.findIndex((m) => m.id === active.id);
    const newIndex = milestones.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(milestones, oldIndex, newIndex);

    onMilestoneReorder(reordered.map(m => m.id));
  };

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flag className="h-4 w-4" />
          Milestones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-3 pt-0">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={milestones.map(m => m.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {milestones.map((milestone) => (
                <SortableMilestoneCard
                  key={milestone.id}
                  milestone={milestone}
                  onUpdate={onMilestoneUpdate}
                  onDelete={onMilestoneDelete}
                  readOnly={readOnly}
                  canReorder={!readOnly && !!onMilestoneReorder}
                  monthOptions={monthOptions}
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
            onClick={onMilestoneAdd}
            className="mt-1"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Milestone
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface SortableMilestoneCardProps {
  milestone: WPDraftMilestone;
  onUpdate: (id: string, updates: Partial<WPDraftMilestone>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  readOnly: boolean;
  canReorder: boolean;
  monthOptions: number[];
  allWpDrafts: WPOption[];
}

function SortableMilestoneCard({
  milestone,
  onUpdate,
  onDelete,
  readOnly,
  canReorder,
  monthOptions,
  allWpDrafts,
}: SortableMilestoneCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: milestone.id, disabled: !canReorder });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [localTitle, setLocalTitle] = useState(milestone.title || '');
  const [titleTimeout, setTitleTimeout] = useState<NodeJS.Timeout | null>(null);
  const [wpPopoverOpen, setWpPopoverOpen] = useState(false);
  const isFocused = useRef(false);

  useEffect(() => { if (!isFocused.current) setLocalTitle(milestone.title || ''); }, [milestone.title]);

  // Parse related_wps string into array of WP numbers
  const selectedWpNumbers: number[] = (() => {
    const raw = milestone.related_wps || '';
    if (!raw.trim()) return [];
    return raw.split(',')
      .map(s => s.trim().replace(/^WP\s*/i, ''))
      .map(Number)
      .filter(n => !isNaN(n));
  })();

  const toggleWp = (wpNum: number) => {
    const current = new Set(selectedWpNumbers);
    if (current.has(wpNum)) {
      current.delete(wpNum);
    } else {
      current.add(wpNum);
    }
    const sorted = Array.from(current).sort((a, b) => a - b);
    const value = sorted.map(n => `WP${n}`).join(', ');
    onUpdate(milestone.id, { related_wps: value });
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalTitle(newValue);
    if (titleTimeout) clearTimeout(titleTimeout);
    const timeout = setTimeout(() => { onUpdate(milestone.id, { title: newValue }); }, 500);
    setTitleTimeout(timeout);
  };

  const handleVerificationChange = (newValue: string) => {
    onUpdate(milestone.id, { means_of_verification: newValue });
  };

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
      {/* Row 1: Drag handle, MS number, Title, Delete */}
      <div className="flex items-center gap-1.5">
        {canReorder && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded touch-none flex-shrink-0"
          >
            <GripVertical className="w-4 h-4 text-[#2563EB]" />
          </button>
        )}
        
        <Input
          value={localTitle}
          onChange={handleTitleChange}
          onFocus={() => { isFocused.current = true; }}
          onBlur={() => { isFocused.current = false; }}
          placeholder="Milestone title..."
          className="h-6 !text-draft flex-1 font-bold"
          disabled={readOnly}
        />
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive flex-shrink-0"
            onClick={() => onDelete(milestone.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Row 2: Related WPs + Due month (right) */}
      <div className="flex items-center gap-3 mt-1.5 ml-5">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-draft text-muted-foreground flex-shrink-0">Related WPs:</span>
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
        <div className="flex items-center gap-1 flex-shrink-0">
          <SingleMonthPicker
            value={milestone.due_month}
            projectDuration={monthOptions.length}
            readOnly={readOnly}
            onChange={(m) => onUpdate(milestone.id, { due_month: m })}
            label="Due:"
          />
        </div>
      </div>

      {/* Row 3: Means of verification */}
      <div className="mt-1.5 ml-5">
        <WPSimpleEditor
          value={milestone.means_of_verification || ''}
          onChange={handleVerificationChange}
          placeholder="Describe means of verification..."
          minHeight="40px"
          hideToolbar
          disabled={readOnly}
        />
      </div>
    </div>
  );
}
