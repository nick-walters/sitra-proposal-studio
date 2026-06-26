import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Package, Plus, GripVertical, ArrowRight, ArrowUpDown } from 'lucide-react';
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

// ── Sort: due_month ASC (nulls last), then order_index (intra-month manual), then id stable ──
function sortDeliverables(list: WPDraftDeliverable[]): WPDraftDeliverable[] {
  return [...list].sort((a, b) => {
    const am = a.due_month ?? Number.POSITIVE_INFINITY;
    const bm = b.due_month ?? Number.POSITIVE_INFINITY;
    if (am !== bm) return am - bm;
    if (a.order_index !== b.order_index) return a.order_index - b.order_index;
    return a.id.localeCompare(b.id);
  });
}

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
  const qc = useQueryClient();
  const resolvedWpColor = wpColor || DEFAULT_WP_COLORS[(wpNumber - 1) % DEFAULT_WP_COLORS.length];
  const orderedTasks = useMemo(
    () => [...wpTasks].sort((a, b) => a.number - b.number),
    [wpTasks]
  );

  const sorted = useMemo(() => sortDeliverables(deliverables), [deliverables]);

  // ── Persist D-numbers 1..N to match current sorted order ──
  const lastSyncRef = useRef<string>('');
  useEffect(() => {
    if (readOnly) return;
    if (sorted.length === 0) return;
    const desired = sorted.map((d, i) => ({ id: d.id, n: i + 1, current: d.number }));
    const mismatch = desired.filter(x => x.n !== x.current);
    if (mismatch.length === 0) return;
    const signature = mismatch.map(x => `${x.id}:${x.n}`).join('|');
    if (lastSyncRef.current === signature) return;
    lastSyncRef.current = signature;
    // Fire-and-forget per-row updates; local state will reflect via the parent hook.
    (async () => {
      for (const m of mismatch) {
        await onDeliverableUpdate(m.id, { number: m.n });
      }
    })();
  }, [sorted, readOnly, onDeliverableUpdate]);

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

  // ── Same-month manual ordering: write order_index per group, then renumber via parent reorder ──
  const persistGroupOrder = useCallback(async (newSorted: WPDraftDeliverable[]) => {
    // Assign order_index within each due_month group as 0..k-1
    const groups = new Map<string, WPDraftDeliverable[]>();
    for (const d of newSorted) {
      const key = String(d.due_month ?? '∅');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    const updates: Array<{ id: string; order_index: number }> = [];
    for (const group of groups.values()) {
      group.forEach((d, i) => {
        if (d.order_index !== i) updates.push({ id: d.id, order_index: i });
      });
    }
    for (const u of updates) {
      await onDeliverableUpdate(u.id, { order_index: u.order_index });
    }
    // Renumber via parent reorder (sets number = position+1 in flat order)
    if (onDeliverableReorder) {
      await onDeliverableReorder(newSorted.map(d => d.id));
    }
  }, [onDeliverableUpdate, onDeliverableReorder]);

  const otherWpDrafts = allWpDrafts.filter(wp => wp.id !== wpDraftId);

  const [reorderOpen, setReorderOpen] = useState(false);

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="py-2 px-3 space-y-1">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              Deliverables
            </CardTitle>
            <div className="flex items-center gap-2">
              {!readOnly && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-muted hover:bg-muted/80 text-foreground"
                        onClick={() => setReorderOpen(true)}
                      >
                        <ArrowUpDown className="h-4 w-4 mr-1" /> Reorder same-month
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Manually reorder deliverables that share the same due month</TooltipContent>
                  </Tooltip>
                  <Button size="sm" onClick={onDeliverableAdd}>
                    <Plus className="h-4 w-4 mr-1" /> Add deliverable
                  </Button>
                </>
              )}
            </div>
          </div>
          <DeliverablesShortNoteInline />
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="overflow-x-auto">
            <table className="platform-table text-sm w-full">
              <thead>
                <tr className="h-12">
                  <th style={{ width: '64px' }} className="whitespace-normal align-bottom">No.</th>
                  <th className="whitespace-normal align-bottom">Deliverable title &amp; short description</th>
                  <th style={{ width: '80px' }} className="whitespace-normal align-bottom">Type</th>
                  <th style={{ width: '76px' }} className="whitespace-normal align-bottom">Dissemination level</th>
                  <th style={{ width: '70px' }} className="whitespace-normal align-bottom">Partner</th>
                  <th style={{ width: '140px' }} className="whitespace-normal align-bottom">Assign to task</th>
                  <th style={{ width: '62px' }} className="whitespace-normal align-bottom">Due month</th>
                  <th style={{ width: '25px' }} className="align-bottom"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr><td colSpan={8} className="py-4 text-center text-muted-foreground italic">No deliverables yet.</td></tr>
                )}
                {sorted.map(d => (
                  <DeliverableRow
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
                    otherWpDrafts={otherWpDrafts}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <DeliverablesDetailedGuidelinesInline />
        </CardContent>
      </Card>

      <SameMonthReorderDialog
        open={reorderOpen}
        onOpenChange={setReorderOpen}
        sorted={sorted}
        wpNumber={wpNumber}
        wpColor={resolvedWpColor}
        onPersist={persistGroupOrder}
      />
    </TooltipProvider>
  );
}

interface DeliverableRowProps {
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
  otherWpDrafts: WPOption[];
}

function DeliverableRow({
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
  otherWpDrafts,
}: DeliverableRowProps) {
  const number = `D${wpNumber}.${deliverable.number}`;
  const selectedTasks = wpTasks.filter(t => selectedTaskIds.includes(t.id));

  return (
    <tr className="border-b align-top">
      {/* D-badge pennant */}
      <td className="py-1.5 px-1 whitespace-nowrap">
        <span style={{ display: 'inline-block', position: 'relative', width: 52, height: 21 }}>
          <svg width={52} height={20} viewBox="0 0 52 20" style={{ position: 'absolute', top: 1, left: 0, overflow: 'visible' }}>
            <path d="M 0,0 L 42,0 L 52,10 L 42,20 L 0,20 Z" fill="#ffffff" stroke={wpColor} strokeWidth={1.5} strokeLinejoin="round" />
          </svg>
          <span style={{ position: 'absolute', top: 1, left: 0, width: 42, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, color: wpColor, whiteSpace: 'nowrap' }}>
            {number}
          </span>
        </span>
      </td>

      {/* Title */}
      <td className="py-1.5 px-1">
        <AutoTextarea
          value={deliverable.title || ''}
          disabled={readOnly}
          placeholder="Deliverable title & short description"
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

      {/* Related task */}
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
                <span className="text-muted-foreground italic">Select task…</span>
              ) : (
                <span className="flex flex-wrap gap-0.5">
                  {selectedTasks.slice(0, 1).map(t => (
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

      {/* Move (above) + Delete (below) — stacked */}
      <td className="py-1.5 px-0">
        <div className="flex flex-col items-center gap-0.5">
          {!readOnly && onMove && otherWpDrafts.length > 0 && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Move deliverable to another WP">
                      <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Move deliverable to another WP</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Move deliverable to another WP</DropdownMenuLabel>
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

// ── Same-month reorder dialog ──
function SameMonthReorderDialog({
  open, onOpenChange, sorted, wpNumber, wpColor, onPersist,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sorted: WPDraftDeliverable[];
  wpNumber: number;
  wpColor: string;
  onPersist: (newSorted: WPDraftDeliverable[]) => Promise<void>;
}) {
  // local working copy
  const [working, setWorking] = useState<WPDraftDeliverable[]>(sorted);
  useEffect(() => { if (open) setWorking(sorted); }, [open, sorted]);

  // group by due_month while preserving overall sort
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: WPDraftDeliverable[] }>();
    for (const d of working) {
      const key = d.due_month == null ? '∅' : String(d.due_month);
      const label = d.due_month == null ? 'No due month set' : `Month ${d.due_month}`;
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key)!.items.push(d);
    }
    return Array.from(map.values());
  }, [working]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (groupKey: string) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setWorking(prev => {
      // find indices within group
      const g = prev.filter(d => (d.due_month == null ? '∅' : String(d.due_month)) === groupKey);
      const oldIdx = g.findIndex(d => d.id === active.id);
      const newIdx = g.findIndex(d => d.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      const reorderedGroup = arrayMove(g, oldIdx, newIdx);
      // rebuild prev with reorderedGroup in place
      const it = reorderedGroup[Symbol.iterator]();
      return prev.map(d => {
        const k = d.due_month == null ? '∅' : String(d.due_month);
        return k === groupKey ? it.next().value! : d;
      });
    });
  };

  const onSave = async () => {
    await onPersist(working);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reorder deliverables sharing a due month</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Drag within a group to reorder. A deliverable can only move above or below other deliverables with the
          same due month. D-numbers are recomputed automatically when you save.
        </p>
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.key} className="rounded border border-border/40">
              <div className="px-2 py-1 text-xs font-semibold bg-muted/50">{g.label}</div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(g.key)}>
                <SortableContext items={g.items.map(d => d.id)} strategy={verticalListSortingStrategy}>
                  <div className="divide-y divide-border/40">
                    {g.items.map(d => (
                      <ReorderRow key={d.id} d={d} wpNumber={wpNumber} wpColor={wpColor} />
                    ))}
                    {g.items.length === 0 && (
                      <div className="px-2 py-2 text-xs italic text-muted-foreground">No items.</div>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="text-xs italic text-muted-foreground">No deliverables yet.</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave}>Save order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReorderRow({ d, wpNumber, wpColor }: { d: WPDraftDeliverable; wpNumber: number; wpColor: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-2 py-1.5 bg-background">
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded touch-none"
        aria-label="Reorder within month"
      >
        <GripVertical className="w-4 h-4 text-blue-500" />
      </button>
      <B31Pill variant="outline" color={wpColor}>D{wpNumber}.{d.number}</B31Pill>
      <span className="text-sm truncate flex-1">{d.title || <span className="italic text-muted-foreground">Untitled</span>}</span>
    </div>
  );
}

// ── Short note rendered under the card title ──
function DeliverablesShortNoteInline() {
  return (
    <div className="text-xs text-muted-foreground pt-1">
      <p>
        This list is mirrored to Table 3.1.c (List of deliverables). A deliverable is a report sent to the European
        Commission to ensure effective monitoring of the project. Deliverables are automatically reordered by
        delivery date and numbered &ldquo;D&lt;WP&gt;.&lt;n&gt;&rdquo; (e.g. the first deliverable in WP1 is D1.1).
        Detailed guidelines are below the table.
      </p>
    </div>
  );
}

// ── Detailed guidelines rendered below the deliverables table ──
function DeliverablesDetailedGuidelinesInline() {
  const CD = () => (
    <a
      href="https://eur-lex.europa.eu/eli/dec/2015/444/oj/eng"
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline hover:no-underline"
    >
      Commission Decision № 2015/444
    </a>
  );
  return (
    <div className="text-xs text-muted-foreground space-y-2 pt-3 mt-2 border-t border-border/40">
      <div>
        <span className="font-medium text-foreground">Type</span> — use one of:
        <ul className="list-disc pl-5 mt-1 space-y-0.5">
          <li><span className="font-medium">R</span>: Document, report (excluding the periodic and final reports).</li>
          <li><span className="font-medium">DEM</span>: Demonstrator, pilot, prototype, plan designs.</li>
          <li><span className="font-medium">DEC</span>: Websites, patents filing, press &amp; media actions, videos, etc.</li>
          <li><span className="font-medium">DATA</span>: Data sets, microdata, etc.</li>
          <li><span className="font-medium">DMP</span>: Data management plan.</li>
          <li><span className="font-medium">ETHICS</span>: Deliverables related to ethics issues.</li>
          <li><span className="font-medium">SECURITY</span>: Deliverables related to security issues.</li>
          <li><span className="font-medium">OTHER</span>: Software, technical diagram, algorithms, models, etc.</li>
        </ul>
      </div>
      <div>
        <span className="font-medium text-foreground">Dissemination level</span> — use one of:
        <ul className="list-disc pl-5 mt-1 space-y-0.5">
          <li><span className="font-medium">PU</span> – Public, fully open, e.g. web (deliverables flagged as public will be automatically published in CORDIS project&apos;s page).</li>
          <li><span className="font-medium">SEN</span> – Sensitive, limited under the conditions of the Grant Agreement.</li>
          <li><span className="font-medium">Classified R-UE/EU-R</span> – EU RESTRICTED under the <CD />.</li>
          <li><span className="font-medium">Classified C-UE/EU-C</span> – EU CONFIDENTIAL under the <CD />.</li>
          <li><span className="font-medium">Classified S-UE/EU-S</span> – EU SECRET under the <CD />.</li>
        </ul>
      </div>
      <p><span className="font-medium text-foreground">Delivery date</span> — measured in months from the project&apos;s start date.</p>
    </div>
  );
}


