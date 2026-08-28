import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { CollapseChevron } from '@/components/cards/CollapseChevron';
import {
  WP_BLOCK_FRAME,
  WP_BLOCK_HEADER,
  WP_CHEVRON_SIZE,
  WP_CONTROL_STACK,
  WP_DOC_FONT,
  WP_TITLE_INDENT,
} from '@/lib/wpBlockChrome';
import { WPBinDialog, useWPBinCount } from '@/components/wp/WPBinDialog';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, ArrowRight, Recycle } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { SingleMonthPicker } from '@/components/SingleMonthPicker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WPDraftDeliverable, WPDraftTask } from '@/hooks/useWPDrafts';
import type { ParticipantSummary } from '@/types/proposal';
import { ParticipantBubble, WPBubble, B31Pill } from '@/components/B31Pill';
import { LazyRichField } from '@/components/participant/LazyRichField';
import {
  ModuleCommentAnchor,
  ModuleCommentButton,
} from '@/components/comments/ModuleComments';
import { wpDeliverableTarget } from '@/lib/moduleCommentTargets';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { WP_TITLE_FIELD_EXTENSIONS } from '@/components/wp/wpDraftFieldExtensions';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
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
  onDeliverableMove?: (deliverableId: string, targetWpDraftId: string) => Promise<boolean>;
  readOnly?: boolean;
  projectDuration?: number;
  allWpDrafts?: WPOption[];
  proposalId?: string | null;
  /** Keep the focused editor mounted while the page toolbar has focus. */
  shouldStayMounted?: () => boolean;
  /** Per-user collapse state, persisted by the page. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
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

/** The page's content column: 21 cm page less 1.5 cm of margin each side. */
const DOC_TEXT_COLUMN = '18cm';
/* Shared document-table look — identical to milestones and risks: a rule under
   the header, hairlines between rows, no vertical rules, tight padding. */
const docTableStyles =
  "font-['Times_New_Roman',Times,serif] text-[11pt] text-left bg-white [&_p]:!text-left";
const docTableRules =
  '[&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b-[1.5px] [&_th]:border-black [&_td]:border-0 ' +
  '[&_tbody_tr]:border-x-0 [&_tbody_tr]:border-t-0 [&_tbody_tr]:border-b [&_tbody_tr]:border-gray-200 ' +
  '[&_tbody_tr:last-child]:border-b-0';
const docCellStyles =
  "px-[3pt] py-[0.75pt] align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight text-left";
const docFirstCellStyles = `${docCellStyles} !pl-0`;
/* Controls read as cell text until hovered or focused — the same treatment the
   milestones and risks document tables use, so the editor matches the B3.1
   mirror rather than looking like a form. */
const SUBTLE_CONTROL =
  "w-full bg-transparent border border-transparent rounded-[2px] px-0 py-0 text-left " +
  "font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight " +
  'hover:border-input focus:border-input focus:outline-none focus-visible:outline-none ' +
  'disabled:opacity-70 disabled:cursor-not-allowed';




// ── Sort: due_month ASC (nulls last), then linked task number ASC (unlinked last),
//    then order_index (intra-month manual), then id stable ──
function sortDeliverables(
  list: WPDraftDeliverable[],
  taskRank?: Map<string, number>,
): WPDraftDeliverable[] {
  return [...list].sort((a, b) => {
    const am = a.due_month ?? Number.POSITIVE_INFINITY;
    const bm = b.due_month ?? Number.POSITIVE_INFINITY;
    if (am !== bm) return am - bm;
    const at = taskRank?.get(a.id) ?? Number.POSITIVE_INFINITY;
    const bt = taskRank?.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
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

/**
 * Title cell — rich text limited to BOLD and ITALIC (see
 * WP_TITLE_FIELD_EXTENSIONS). Lazily mounts a TipTap instance on focus and
 * commits the HTML when the editor unmounts.
 */
function DeliverableTitleCell({
  value,
  disabled,
  onCommit,
  proposalId,
  shouldStayMounted,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (v: string) => void;
  proposalId?: string | null;
  shouldStayMounted?: () => boolean;
}) {
  const [local, setLocal] = useState(value || '');
  const dirtyRef = useRef(false);
  const { push: pushCommit, flush: flushCommit } = useDebouncedSave<string>(onCommit);

  useEffect(() => {
    if (!dirtyRef.current) setLocal(value || '');
  }, [value]);

  return (
    <LazyRichField
      value={local}
      disabled={disabled}
      cellSurface
      minHeight="21px"
      proposalId={proposalId ?? ''}
      staticExtensions={WP_TITLE_FIELD_EXTENSIONS}
      shouldStayMounted={shouldStayMounted}
      onChange={(html) => {
        dirtyRef.current = true;
        setLocal(html);
        pushCommit(html);
      }}
      onBlur={() => {
        flushCommit();
        dirtyRef.current = false;
      }}
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
  onDeliverableMove,
  readOnly = false,
  projectDuration = 36,
  allWpDrafts = [],
  proposalId,
  shouldStayMounted,
  collapsed = false,
  onToggleCollapsed,
}: WPDeliverablesTableProps) {
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

  // Rank each deliverable by the lowest task number it is assigned to.
  const taskRank = useMemo(() => {
    const numById = new Map(wpTasks.map(t => [t.id, t.number]));
    const m = new Map<string, number>();
    for (const [delId, taskIds] of tasksByDeliverable) {
      const nums = taskIds
        .map(id => numById.get(id))
        .filter((n): n is number => typeof n === 'number');
      if (nums.length > 0) m.set(delId, Math.min(...nums));
    }
    return m;
  }, [tasksByDeliverable, wpTasks]);

  // Client-side sort is for instant feedback only. The authoritative numbering
  // is produced by the database resequencing triggers, so nothing here writes
  // `number` — a stale tab can no longer overwrite a deliberate renumber.
  const sorted = useMemo(() => sortDeliverables(deliverables, taskRank), [deliverables, taskRank]);



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

  const otherWpDrafts = allWpDrafts.filter(wp => wp.id !== wpDraftId);

  const [binOpen, setBinOpen] = useState(false);
  const binCount = useWPBinCount(wpDraftId, 'wp_draft_deliverable');

  return (
    <TooltipProvider>
      <section className={WP_BLOCK_FRAME} data-guideline-key="drafts.wp.deliverables">
        {/* Block controls, right-aligned in the order add, move, restore —
            exactly as the tasks block. The heading wears the same frame,
            face and weight as "Objectives:" and "Description of work:".
            Guidance is never printed here: it is reached through the
            Guidelines button with a field focused. */}
        <div className={cn(WP_BLOCK_HEADER, !collapsed && 'border-b border-border')}>
          {onToggleCollapsed && (
            <div className={WP_CONTROL_STACK}>
              <CollapseChevron
                collapsed={collapsed}
                onToggle={onToggleCollapsed}
                className={WP_CHEVRON_SIZE}
              />
            </div>
          )}
          <p
            className="min-w-0 flex-1 select-none font-bold"
            style={{
              ...WP_DOC_FONT,
              paddingLeft: onToggleCollapsed ? WP_TITLE_INDENT : 'calc(1.5cm - 20px)',
            }}
          >
            Deliverables:
          </p>
          {
            !readOnly ? (
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      aria-label="Add deliverable"
                      onClick={() => void onDeliverableAdd()}
                    >
                      <Plus className="h-3.5 w-3.5 text-blue-500" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add deliverable</TooltipContent>
                </Tooltip>

                {onDeliverableMove && otherWpDrafts.length > 0 && sorted.length > 0 && (
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            aria-label="Move a deliverable to another work package"
                          >
                            <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Move a deliverable to another work package</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel>Move a deliverable to another WP</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {sorted.map((d) => (
                        <DropdownMenuSub key={d.id}>
                          <DropdownMenuSubTrigger>
                            D{wpNumber}.{d.number}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {otherWpDrafts.map((wp) => (
                              <DropdownMenuItem
                                key={wp.id}
                                onClick={() => void onDeliverableMove(d.id, wp.id)}
                              >
                                WP{wp.number}
                                {wp.short_name ? `: ${wp.short_name}` : wp.title ? `: ${wp.title}` : ''}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* Restore stays in place and greys out when the bin is empty. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      aria-label="Restore a deleted deliverable"
                      disabled={binCount === 0}
                      onClick={() => setBinOpen(true)}
                    >
                      <Recycle className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {binCount === 0 ? 'Nothing deleted recently' : 'Restore a deleted deliverable'}
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : null
          }
        </div>

        {/* One document table, styled exactly as milestones and risks: a rule
            under the header, hairlines between rows, no vertical rules, and a
            hard 18 cm measure. Every field for a deliverable sits on ONE row;
            each column is as tight as its content, the title taking the rest. */}
        {!collapsed && (
        <div className="doc-surface-page bg-white px-[1.5cm] py-[8pt]">
          {sorted.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground italic">No deliverables yet.</div>
          ) : (

            <table
              className={`${docTableStyles} ${docTableRules}`}
              style={{ tableLayout: 'auto', width: DOC_TEXT_COLUMN, borderCollapse: 'collapse' }}
            >
              <thead>
                <tr>
                  <th className={`${docFirstCellStyles} align-bottom font-bold whitespace-nowrap`}>No.</th>
                  <th className={`${docCellStyles} align-bottom font-bold`} style={{ width: '100%' }}>
                    Deliverable title
                  </th>
                  <th className={`${docCellStyles} align-bottom font-bold whitespace-nowrap`}>Partner</th>
                  <th className={`${docCellStyles} align-bottom font-bold whitespace-nowrap`}>Type</th>
                  <th className={`${docCellStyles} align-bottom font-bold whitespace-nowrap`}>Level</th>
                  <th className={`${docCellStyles} align-bottom font-bold whitespace-nowrap`}>Due</th>
                  <th className={`${docCellStyles} align-bottom font-bold whitespace-nowrap`}>Task</th>
                </tr>
              </thead>
              <tbody>
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
                    onSaveTasks={saveDeliverableTasks}
                    readOnly={readOnly}
                    proposalId={proposalId}
                    shouldStayMounted={shouldStayMounted}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}

      </section>


      <WPBinDialog
        isOpen={binOpen}
        onClose={() => setBinOpen(false)}
        wpDraftId={wpDraftId}
        targetType="wp_draft_deliverable"
        title="Deleted deliverables"
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
  onSaveTasks: (deliverableId: string, taskIds: string[]) => Promise<void>;
  readOnly: boolean;
  proposalId?: string | null;
  shouldStayMounted?: () => boolean;
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
  onSaveTasks,
  readOnly,
  proposalId,
  shouldStayMounted,
}: DeliverableRowProps) {
  const number = `D${wpNumber}.${deliverable.number}`;
  const selectedTasks = wpTasks.filter(t => selectedTaskIds.includes(t.id));

  return (
    <tr data-version-target={`wp_draft_deliverable|${deliverable.id}|title`}>
      {/* Number: the pennant chip, as tight as the chip itself. */}
      <td className={`${docFirstCellStyles} whitespace-nowrap`}>
        <span style={{ display: 'inline-block', position: 'relative', width: 52, height: 21 }}>
          <svg width={52} height={20} viewBox="0 0 52 20" style={{ position: 'absolute', top: 1, left: 0, overflow: 'visible' }}>
            <path d="M 0,0 L 42,0 L 52,10 L 42,20 L 0,20 Z" fill="#ffffff" stroke={wpColor} strokeWidth={1.5} strokeLinejoin="round" />
          </svg>
          <span style={{ position: 'absolute', top: 1, left: 0, width: 42, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, color: wpColor, whiteSpace: 'nowrap' }}>
            {number}
          </span>
        </span>
      </td>

      {/* Title: takes every pixel the tight columns leave behind. */}
      <td className={docCellStyles} style={{ width: '100%' }}>
        {/* A deliverable is a commentable module like any other: the anchor
            only measures the row, the control sits in the right margin. */}
        <ModuleCommentAnchor
          control="none"
          targetKey={wpDeliverableTarget(deliverable.id, 'title')}
          label={`${number} — deliverable`}
        >
          <DeliverableTitleCell
            value={deliverable.title || ''}
            disabled={readOnly}
            onCommit={(v) => onUpdate(deliverable.id, { title: v })}
            proposalId={proposalId}
            shouldStayMounted={shouldStayMounted}
          />
        </ModuleCommentAnchor>
      </td>

      {/* Every remaining control reads as cell text until hovered or focused,
          so the row prints like its B3.1 mirror rather than like a form. */}
      {/* Partner */}
      <td className={`${docCellStyles} whitespace-nowrap`}>
          <Select
            value={deliverable.responsible_participant_id || ''}
            onValueChange={(v) => onUpdate(deliverable.id, { responsible_participant_id: v === '__clear__' ? null : v || null })}
            disabled={readOnly}
          >
            <SelectTrigger
              hideArrow
              className={cn(SUBTLE_CONTROL, 'h-auto min-h-0 w-auto gap-0 inline-flex justify-start focus:ring-0')}
            >
              {deliverable.responsible_participant_id ? (
                <ParticipantBubble>
                  {(() => {
                    const p = participants.find(x => x.id === deliverable.responsible_participant_id);
                    return p ? (p.organisation_short_name || p.organisation_name) : '—';
                  })()}
                </ParticipantBubble>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
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

      {/* Type */}
      <td className={`${docCellStyles} whitespace-nowrap`}>
          <Select
            value={deliverable.type || ''}
            onValueChange={(v) => onUpdate(deliverable.id, { type: v === '__clear__' ? null : v })}
            disabled={readOnly}
          >
            <SelectTrigger hideArrow className={cn(SUBTLE_CONTROL, 'h-auto min-h-0 inline-flex justify-start focus:ring-0')}>
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
      <td className={`${docCellStyles} whitespace-nowrap`}>
          <Select
            value={deliverable.dissemination_level || ''}
            onValueChange={(v) => onUpdate(deliverable.id, { dissemination_level: v === '__clear__' ? null : v })}
            disabled={readOnly}
          >
            <SelectTrigger hideArrow className={cn(SUBTLE_CONTROL, 'h-auto min-h-0 inline-flex justify-start focus:ring-0')}>
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

      {/* Due month */}
      <td className={`${docCellStyles} whitespace-nowrap`}>
          <SingleMonthPicker
            value={deliverable.due_month}
            projectDuration={projectDuration}
            readOnly={readOnly}
            label=""
            cellSurface
            onChange={(m) => onUpdate(deliverable.id, { due_month: m })}
          />
      </td>

      {/* Related task. Delete sits in the page's right margin, as on
          milestones and risks, so the table keeps exactly its seven columns. */}
      <td className={`${docCellStyles} whitespace-nowrap relative`}>
          {/* Right margin controls: comment, then delete — the same order and
              treatment the block control rows use. */}
          <div className="absolute left-full top-1/2 ml-1 flex -translate-y-1/2 items-center">
            <ModuleCommentButton
              targetKey={wpDeliverableTarget(deliverable.id, 'title')}
              label={`${number} — deliverable`}
            />
            {!readOnly && (
              <DeleteConfirmDialog
                itemLabel="this deliverable"
                description="This deliverable goes to the deliverables bin, where it can be restored for 90 days."
                onConfirm={() => onDelete(deliverable.id)}
                buttonClassName="h-6 w-6 text-red-600 hover:text-red-700"
                iconSize="h-4 w-4"
              />
            )}
          </div>
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
                className={SUBTLE_CONTROL}
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
    </tr>
  );


}

// ── Task-assignment dialog: single-select (radio) within THIS WP ──
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
  const [draft, setDraft] = useState<string | null>(selectedTaskIds[0] ?? null);

  useEffect(() => {
    if (open) setDraft(selectedTaskIds[0] ?? null);
  }, [open, selectedTaskIds]);

  const radioName = `del-task-${wpNumber}`;

  return (
    <>
      {renderTrigger(() => !disabled && setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Related task</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Pick the single task this deliverable depends on.
          </p>
          <div className="max-h-[60vh] overflow-y-auto space-y-1 pr-1">
            <div className="rounded border border-border/40">
              <label className="flex items-center gap-2 px-2 py-1.5 opacity-90">
                <WPBubble wpNumber={wpNumber} wpColor={wpColor} />
                <span className="text-xs text-muted-foreground italic">(this deliverable's WP)</span>
              </label>
              <div className="pr-2 pb-1.5 space-y-0.5" style={{ paddingLeft: '40px' }}>
                {wpTasks.length === 0 && (
                  <div className="text-xs text-muted-foreground italic py-1">No tasks in this WP yet.</div>
                )}
                {wpTasks.map(t => (
                  <label key={t.id} className="flex items-center gap-2 py-1 rounded hover:bg-accent cursor-pointer">
                    <input
                      type="radio"
                      name={radioName}
                      checked={draft === t.id}
                      onChange={() => setDraft(t.id)}
                    />
                    <B31Pill variant="outline" color={wpColor}>
                      T{wpNumber}.{t.number}
                    </B31Pill>
                    <span className="text-sm truncate">{t.title || ''}</span>
                  </label>
                ))}
              </div>
              {draft !== null && (
                <div className="px-2 pb-2">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                    onClick={() => setDraft(null)}
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onSave(draft ? [draft] : []); setOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}



