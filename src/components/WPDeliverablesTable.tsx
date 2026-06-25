import { useEffect, useRef, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Package, Plus, GripVertical, ArrowRight, Trash2 } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { SingleMonthPicker } from '@/components/SingleMonthPicker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WPDraftDeliverable, WPDraftTask } from '@/hooks/useWPDrafts';
import type { ParticipantSummary } from '@/types/proposal';
import { ParticipantBubble, WPBubble, B31Pill } from '@/components/B31Pill';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
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
import { toast } from 'sonner';

interface WPOption {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  color?: string | null;
}

interface WPDeliverablesTableProps {
  wpDraftId: string;
  wpNumber: number;
  wpColor?: string | null;
  wpTasks?: WPDraftTask[];
  deliverables: WPDraftDeliverable[];
  participants: ParticipantSummary[];
  onDeliverableUpdate: (id: string, updates: Partial<WPDraftDeliverable>) => Promise<boolean>;
  onDeliverableAdd: () => Promise<any>;
  onDeliverableDelete: (id: string) => Promise<boolean>;
  onDeliverableReorder?: (newOrder: string[]) => Promise<boolean>;
  onDeliverableMove?: (deliverableId: string, targetWpDraftId: string) => Promise<boolean>;
  readOnly?: boolean;
  projectDuration?: number;
  allWpDrafts?: WPOption[];
}

const DELIVERABLE_TYPES = [
  { value: 'R', label: 'Report', description: 'Document, report (excluding the periodic and final reports)' },
  { value: 'DEM', label: 'Demonstrator', description: 'Demonstrator, pilot, prototype, plan designs' },
  { value: 'DEC', label: 'Dissemination', description: 'Websites, patents filing, press & media actions, videos, etc.' },
  { value: 'DATA', label: 'Data', description: 'Data sets, microdata, etc.' },
  { value: 'DMP', label: 'Data management plan', description: 'Data management plan' },
  { value: 'ETHICS', label: 'Ethics', description: 'Deliverables related to ethics issues' },
  { value: 'SECURITY', label: 'Security', description: 'Deliverables related to security issues' },
  { value: 'OTHER', label: 'Other', description: 'Software, technical diagram, algorithms, models, etc.' },
];

const DISSEMINATION_LEVELS = [
  { value: 'PU', label: 'Public', description: 'Fully open, e.g. web (Deliverables flagged as public will be automatically published on CORDIS)' },
  { value: 'SEN', label: 'Sensitive', description: 'Limited under the conditions of the Grant Agreement' },
  { value: 'EU-RES', label: 'EU Restricted', description: 'Classified with the mention of the classification level RESTREINT UE/EU RESTRICTED' },
  { value: 'EU-CON', label: 'EU Confidential', description: 'Classified with the mention of the classification level CONFIDENTIEL UE/EU CONFIDENTIAL' },
  { value: 'EU-SEC', label: 'EU Secret', description: 'Classified with the mention of the classification level SECRET UE/EU SECRET' },
];

// ── Auto-textarea matching MS/risks tables ──
function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  useEffect(() => { resize(); }, [props.value]);
  return (
    <textarea
      ref={ref}
      {...props}
      onInput={(e) => { resize(); props.onInput?.(e as any); }}
      className={(props.className || '') + ' w-full resize-none overflow-hidden bg-transparent border border-input rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring'}
      style={{ minHeight: 28, ...(props.style || {}) }}
    />
  );
}

export function WPDeliverablesTable({
  wpDraftId,
  wpNumber,
  wpColor,
  wpTasks = [],
  deliverables,
  participants,
  onDeliverableUpdate,
  onDeliverableAdd,
  onDeliverableDelete,
  onDeliverableReorder,
  onDeliverableMove,
  readOnly = false,
  projectDuration = 36,
  allWpDrafts = [],
}: WPDeliverablesTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const qc = useQueryClient();
  const resolvedWpColor = wpColor || DEFAULT_WP_COLORS[(wpNumber - 1) % DEFAULT_WP_COLORS.length];
  const orderedTasks = useMemo(
    () => [...wpTasks].sort((a, b) => a.number - b.number),
    [wpTasks]
  );

  // ── Load all deliverable→task links for this WP's deliverables in one query ──
  const deliverableIds = deliverables.map(d => d.id).sort().join(',');
  const { data: links = [] } = useQuery({
    queryKey: ['wp-draft-deliverable-tasks', wpDraftId, deliverableIds],
    enabled: deliverables.length > 0,
    queryFn: async () => {
      const ids = deliverables.map(d => d.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('wp_draft_deliverable_tasks')
        .select('id, deliverable_id, wp_draft_task_id')
        .in('deliverable_id', ids);
      if (error) throw error;
      return data || [];
    },
  });

  const tasksByDeliverable = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of links) {
      const arr = m.get(l.deliverable_id) || [];
      arr.push(l.wp_draft_task_id);
      m.set(l.deliverable_id, arr);
    }
    return m;
  }, [links]);

  const saveDeliverableTasks = async (deliverableId: string, taskIds: string[]) => {
    const current = tasksByDeliverable.get(deliverableId) || [];
    const toAdd = taskIds.filter(t => !current.includes(t));
    const toRemove = current.filter(t => !taskIds.includes(t));
    try {
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('wp_draft_deliverable_tasks')
          .delete()
          .eq('deliverable_id', deliverableId)
          .in('wp_draft_task_id', toRemove);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('wp_draft_deliverable_tasks')
          .insert(toAdd.map(tid => ({ deliverable_id: deliverableId, wp_draft_task_id: tid })));
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ['wp-draft-deliverable-tasks', wpDraftId] });
    } catch (err: any) {
      toast.error('Failed to save task links: ' + (err.message || err));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onDeliverableReorder) return;
    const oldIndex = deliverables.findIndex(d => d.id === active.id);
    const newIndex = deliverables.findIndex(d => d.id === over.id);
    const reordered = arrayMove(deliverables, oldIndex, newIndex);
    onDeliverableReorder(reordered.map(d => d.id));
  };

  const otherWpDrafts = allWpDrafts.filter(wp => wp.id !== wpDraftId);

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="py-2 px-3 space-y-1">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              Deliverables
            </CardTitle>
            {!readOnly && (
              <Button size="sm" onClick={onDeliverableAdd}>
                <Plus className="h-4 w-4 mr-1" /> Add deliverable
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={deliverables.map(d => d.id)} strategy={verticalListSortingStrategy}>
              <div className="overflow-x-auto">
                <table className="platform-table text-sm">
                  <thead>
                    <tr>
                      <th style={{ width: '24px' }}></th>
                      <th style={{ width: '64px' }}>No.</th>
                      <th>Deliverable title</th>
                      <th style={{ width: '88px' }}>Type</th>
                      <th style={{ width: '92px' }}>Diss. level</th>
                      <th style={{ width: '120px' }}>Partner</th>
                      <th style={{ width: '140px' }}>Related task(s)</th>
                      <th style={{ width: '92px' }}>Due month</th>
                      <th style={{ width: '56px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliverables.length === 0 && (
                      <tr><td colSpan={9} className="py-4 text-center text-muted-foreground italic">No deliverables yet.</td></tr>
                    )}
                    {deliverables.map(d => (
                      <SortableDeliverableRow
                        key={d.id}
                        deliverable={d}
                        wpNumber={wpNumber}
                        wpColor={resolvedWpColor}
                        wpTasks={orderedTasks}
                        selectedTaskIds={tasksByDeliverable.get(d.id) || []}
                        participants={participants}
                        projectDuration={projectDuration}
                        onUpdate={onDeliverableUpdate}
                        onDelete={onDeliverableDelete}
                        onMove={onDeliverableMove}
                        onSaveTasks={saveDeliverableTasks}
                        readOnly={readOnly}
                        canReorder={!readOnly && !!onDeliverableReorder}
                        otherWpDrafts={otherWpDrafts}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

interface SortableDeliverableRowProps {
  deliverable: WPDraftDeliverable;
  wpNumber: number;
  wpColor: string;
  wpTasks: WPDraftTask[];
  selectedTaskIds: string[];
  participants: ParticipantSummary[];
  projectDuration: number;
  onUpdate: (id: string, updates: Partial<WPDraftDeliverable>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onMove?: (deliverableId: string, targetWpDraftId: string) => Promise<boolean>;
  onSaveTasks: (deliverableId: string, taskIds: string[]) => Promise<void>;
  readOnly: boolean;
  canReorder: boolean;
  otherWpDrafts: WPOption[];
}

function SortableDeliverableRow({
  deliverable,
  wpNumber,
  wpColor,
  wpTasks,
  selectedTaskIds,
  participants,
  projectDuration,
  onUpdate,
  onDelete,
  onMove,
  onSaveTasks,
  readOnly,
  canReorder,
  otherWpDrafts,
}: SortableDeliverableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deliverable.id, disabled: !canReorder });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const number = `D${wpNumber}.${deliverable.number}`;
  const selectedTasks = wpTasks.filter(t => selectedTaskIds.includes(t.id));

  return (
    <tr ref={setNodeRef} style={style} className="border-b align-top">
      {/* drag handle */}
      <td className="py-1.5 px-1 text-center">
        {canReorder && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded touch-none"
            aria-label="Reorder"
          >
            <GripVertical className="w-4 h-4 text-blue-500" />
          </button>
        )}
      </td>

      {/* D-badge pennant */}
      <td className="py-1.5 px-1 whitespace-nowrap">
        <span style={{ display: 'inline-block', position: 'relative', width: 52, height: 20 }}>
          <svg width={52} height={20} viewBox="0 0 52 20" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
            <path d="M 0,0 L 42,0 L 52,10 L 42,20 L 0,20 Z" fill="#ffffff" stroke="#73C92D" strokeWidth={1.5} strokeLinejoin="round" />
          </svg>
          <span style={{ position: 'absolute', top: 0, left: 0, width: 42, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, color: '#73C92D', whiteSpace: 'nowrap' }}>
            {number}
          </span>
        </span>
      </td>

      {/* Title */}
      <td className="py-1.5 px-1">
        <AutoTextarea
          value={deliverable.title || ''}
          disabled={readOnly}
          placeholder="Deliverable title"
          onChange={(e) => onUpdate(deliverable.id, { title: e.target.value })}
        />
      </td>

      {/* Type */}
      <td className="py-1.5 px-1">
        <Select
          value={deliverable.type || ''}
          onValueChange={(v) => onUpdate(deliverable.id, { type: v === '__clear__' ? null : v })}
          disabled={readOnly}
        >
          <SelectTrigger hideArrow className="h-7 w-full text-sm px-1.5">
            <span>{deliverable.type || <span className="text-muted-foreground">—</span>}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__clear__"><span className="text-muted-foreground italic">Clear</span></SelectItem>
            {DELIVERABLE_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value} textValue={t.value}>
                <div className="flex flex-col">
                  <span>{t.value} – {t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Dissemination */}
      <td className="py-1.5 px-1">
        <Select
          value={deliverable.dissemination_level || ''}
          onValueChange={(v) => onUpdate(deliverable.id, { dissemination_level: v === '__clear__' ? null : v })}
          disabled={readOnly}
        >
          <SelectTrigger hideArrow className="h-7 w-full text-sm px-1.5">
            <span>{deliverable.dissemination_level || <span className="text-muted-foreground">—</span>}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__clear__"><span className="text-muted-foreground italic">Clear</span></SelectItem>
            {DISSEMINATION_LEVELS.map(l => (
              <SelectItem key={l.value} value={l.value} textValue={l.value}>
                <div className="flex flex-col">
                  <span>{l.value} – {l.label}</span>
                  <span className="text-xs text-muted-foreground">{l.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Partner */}
      <td className="py-1.5 px-1">
        <Select
          value={deliverable.responsible_participant_id || ''}
          onValueChange={(v) => onUpdate(deliverable.id, { responsible_participant_id: v === '__clear__' ? null : v || null })}
          disabled={readOnly}
        >
          <SelectTrigger
            hideArrow
            className={cn('h-auto border-0 shadow-none p-0 w-auto gap-0', deliverable.responsible_participant_id ? 'font-bold' : 'font-normal')}
            style={deliverable.responsible_participant_id ? {
              backgroundColor: '#000', color: '#fff', height: '17px',
              fontFamily: 'Times New Roman, serif', fontSize: '11pt', lineHeight: '17px',
              borderRadius: '9999px', paddingLeft: '6px', paddingRight: '6px',
            } : undefined}
          >
            <SelectValue placeholder="—" className="font-normal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__clear__"><span className="text-muted-foreground italic">Clear selection</span></SelectItem>
            {participants.map(p => (
              <SelectItem key={p.id} value={p.id}>
                <ParticipantBubble>{p.organisation_short_name || p.organisation_name}</ParticipantBubble>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Related task(s) */}
      <td className="py-1.5 px-1">
        <DeliverableTaskDialog
          wpNumber={wpNumber}
          wpColor={wpColor}
          wpTasks={wpTasks}
          selectedTaskIds={selectedTaskIds}
          disabled={readOnly}
          onSave={(ids) => onSaveTasks(deliverable.id, ids)}
          renderTrigger={(open) => (
            <button
              type="button"
              onClick={open}
              disabled={readOnly}
              className="w-full min-h-7 px-1.5 py-1 border border-input rounded-md bg-background text-left hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {selectedTasks.length === 0 ? (
                <span className="text-muted-foreground italic">Select task(s)…</span>
              ) : (
                <span className="flex flex-wrap gap-0.5">
                  {selectedTasks.map(t => (
                    <B31Pill key={t.id} variant="outline" color={wpColor}>
                      T{wpNumber}.{t.number}
                    </B31Pill>
                  ))}
                </span>
              )}
            </button>
          )}
        />
      </td>

      {/* Due month */}
      <td className="py-1.5 px-1">
        <SingleMonthPicker
          value={deliverable.due_month}
          projectDuration={projectDuration}
          readOnly={readOnly}
          label=""
          onChange={(m) => onUpdate(deliverable.id, { due_month: m })}
        />
      </td>

      {/* Move + Delete */}
      <td className="py-1.5 px-0">
        <div className="flex items-center justify-end gap-0.5">
          {!readOnly && onMove && otherWpDrafts.length > 0 && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="move deliverable to another WP">
                      <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>move deliverable to another WP</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>move deliverable to another WP</DropdownMenuLabel>
                {otherWpDrafts.map(wp => (
                  <DropdownMenuItem key={wp.id} onClick={() => onMove(deliverable.id, wp.id)}>
                    WP{wp.number}{wp.short_name ? `: ${wp.short_name}` : wp.title ? `: ${wp.title}` : ''}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!readOnly && (
            <DeleteConfirmDialog
              itemLabel="this deliverable"
              onConfirm={() => onDelete(deliverable.id)}
              buttonClassName="h-7 w-7 text-red-600 hover:text-red-700"
              iconSize="h-4 w-4"
            />
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Task-assignment dialog: only THIS WP shown, checked & disabled ──
function DeliverableTaskDialog({
  wpNumber, wpColor, wpTasks, selectedTaskIds, disabled, onSave, renderTrigger,
}: {
  wpNumber: number;
  wpColor: string;
  wpTasks: WPDraftTask[];
  selectedTaskIds: string[];
  disabled?: boolean;
  onSave: (taskIds: string[]) => void;
  renderTrigger: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selectedTaskIds);

  useEffect(() => {
    if (open) setDraft(selectedTaskIds);
  }, [open, selectedTaskIds]);

  const toggle = (id: string) => {
    setDraft(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  return (
    <>
      {renderTrigger(() => !disabled && setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Related task(s)</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Pick the tasks this deliverable depends on. Selections are stored for the future Gantt chart.
          </p>
          <div className="max-h-[60vh] overflow-y-auto space-y-1 pr-1">
            <div className="rounded border border-border/40">
              {/* WP row — checked & disabled (deliverable belongs to this WP) */}
              <label className="flex items-center gap-2 px-2 py-1.5 opacity-90">
                <Checkbox checked disabled />
                <WPBubble wpNumber={wpNumber} wpColor={wpColor} />
                <span className="text-xs text-muted-foreground italic">(this deliverable's WP)</span>
              </label>
              <div className="pr-2 pb-1.5 space-y-0.5" style={{ paddingLeft: '40px' }}>
                {wpTasks.length === 0 && (
                  <div className="text-xs text-muted-foreground italic py-1">No tasks in this WP yet.</div>
                )}
                {wpTasks.map(t => (
                  <label key={t.id} className="flex items-center gap-2 py-1 rounded hover:bg-accent cursor-pointer">
                    <Checkbox
                      checked={draft.includes(t.id)}
                      onCheckedChange={() => toggle(t.id)}
                    />
                    <B31Pill variant="outline" color={wpColor}>
                      T{wpNumber}.{t.number}
                    </B31Pill>
                    <span className="text-sm truncate">{t.title || ''}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onSave(draft); setOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
