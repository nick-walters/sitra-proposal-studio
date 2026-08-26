import { Fragment, useEffect, useMemo, useRef, useState, useCallback, createContext, useContext, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { WPBubble, RiskBadge, AllWPsBubble, isAllWPsSelected } from '@/components/B31Pill';
import { SingleMonthPicker } from '@/components/SingleMonthPicker';
import { Plus, Trash2, GripVertical, ArrowUpDown, Check, Star } from 'lucide-react';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
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
import { Separator } from '@/components/ui/separator';
import { LazyRichField } from '@/components/participant/LazyRichField';
import { DebouncedRichField } from '@/components/participant/DebouncedRichField';
import {
  WP_DRAFT_FIELD_EXTENSIONS,
  WP_TITLE_FIELD_EXTENSIONS,
  WP_SHORT_NARRATIVE_FIELD_EXTENSIONS,
} from '@/components/wp/wpDraftFieldExtensions';
import { getEditorCapabilities } from '@/lib/fieldCapabilities';
import { ParticipantCrossRefDropdown } from '@/components/participant/ParticipantCrossRefDropdown';
import {
  MethodologyEditorFocusProvider,
  useMethodologyEditorFocus,
} from '@/components/MethodologyEditorFocusContext';
import { EditorToolbars } from '@/components/editor/EditorToolbars';
import { useFocusedGuidelineKey } from '@/hooks/useFocusedGuidelineKey';
import { saveVersionedRow, reorderVersionedRows, binAndDeleteNumberedRow } from '@/lib/versionedSave';
import {
  PageSearchProvider,
  usePageSearch,
  usePageSearchSource,
} from '@/lib/findReplace/PageSearchProvider';
import type { FieldSaveOutcome, SearchableField } from '@/lib/findReplace/types';
import { PageFindReplacePanel } from '@/components/findReplace/PageFindReplacePanel';
import { jumpToElementId } from '@/lib/jumpToElement';
import { GuidelineBox } from '@/components/GuidelineBox';
import { useColumnResize } from '@/hooks/useColumnResize';
import { useColumnHeaders } from '@/hooks/useColumnHeaders';
import { ColumnResizer } from '@/components/ColumnResizer';
import { EditableColumnHeader } from '@/components/EditableColumnHeader';

import { saveMilestoneAndResequence } from '@/lib/versionedSave';

import { useVersionConflict } from '@/hooks/useVersionConflict';


// ── Save tracker context: lets AutoTextarea report pending/flush to the page header ──
interface SaveTrackerCtx {
  bumpPending: (delta: number) => void;
  registerFlush: (flush: () => void) => () => void;
}
const SaveTrackerContext = createContext<SaveTrackerCtx | null>(null);




interface Props {
  proposalId: string;
  canEdit: boolean;
  projectDuration?: number;
}

interface WPRow {
  id: string;
  number: number;
  short_name: string | null;
  color: string;
}
interface TaskRow {
  id: string;
  number: number;
  title: string | null;
  wp_draft_id: string;
}
interface Milestone {
  id: string;
  number: number;
  title: string | null;
  due_month: number | null;
  means_of_verification: string | null;
  order_index: number;
  wp_ids: string[];
  primary_wp_id: string | null;
  version?: number;
}
interface Risk {
  id: string;
  number: number;
  title: string | null;
  likelihood: string | null;
  severity: string | null;
  mitigation: string | null;
  order_index: number;
  wp_ids: string[];
  version?: number;
}

const MS_KEY = (pid: string) => ['proposal-milestones-mgr', pid];
const RISK_KEY = (pid: string) => ['proposal-risks-mgr', pid];
const LEFT_ALIGNED_CELL_CLASS =
  '[&_.document-content]:!text-left [&_.document-content_*]:!text-left [&_.ProseMirror]:!text-left [&_.ProseMirror_*]:!text-left';

/** Table cells are always left-aligned, irrespective of legacy paragraph alignment. */
function leftAlignedCellHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/text-align\s*:\s*(?:justify|center|right|start|end|left)\s*;?/gi, '')
    .replace(/style=(['"])\s*\1/gi, '');
}

// Fixed column tracks shared by each row's metadata line and the label header
// row above the list, so fields align across rows. A column is reserved for
// every control, including on rows that do not render one.
/* Line 1 of a milestone row: name, then its metadata in fixed columns. */
const MILESTONE_LINE1_GRID =
  // The name keeps the lion's share at every width: it is the only greedy
  // track, and the metadata columns shrink towards their minimums first.
  'grid grid-cols-[minmax(8rem,2fr)_minmax(6rem,17rem)_minmax(4.5rem,7rem)_1.75rem] items-start gap-x-2';
/* Line 1 of a risk row: description (same 1fr share as the milestone name),
   narrow i./ii. columns, and a WP column widened with the space freed. */
const RISK_LINE1_GRID =
  'grid grid-cols-[minmax(8rem,2fr)_3rem_3rem_minmax(6rem,17.5rem)_1.75rem] items-start gap-x-2';

/* ── Document table spec, shared with the linked activities table ──
   TNR 11pt, bold header with a 1.5px black rule, 1px light rules between
   rows and none under the last, no vertical rules, tight padding, flush
   outer edges. The 18 cm text column in CSS pixels caps every table. */
const DOC_BLOCK_WIDTH = 768;
const docTableStyles =
  "font-['Times_New_Roman',Times,serif] text-[11pt] text-left bg-white [&_p]:!text-left";
const docTableRules =
  '[&_th]:border-x-0 [&_th]:border-t-0 [&_th]:border-b-[1.5px] [&_th]:border-black [&_td]:border-0 ' +
  '[&_tbody_tr]:border-x-0 [&_tbody_tr]:border-t-0 [&_tbody_tr]:border-b [&_tbody_tr]:border-gray-200 ' +
  '[&_tbody_tr:last-child]:border-b-0';
const docCellStyles =
  "px-[3pt] py-[0.75pt] align-middle font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight text-left";
const docFirstCellStyles = `${docCellStyles} !pl-0`;
/* Controls read as cell text until hovered or focused. Editable surfaces must
   name the font explicitly: a base-layer rule paints [contenteditable] Arial. */
const SUBTLE_CONTROL =
  "w-full bg-transparent border border-transparent rounded-[2px] px-1 py-0 text-left " +
  "font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight " +
  'hover:border-input focus:border-input focus:outline-none focus-visible:outline-none ' +
  'disabled:opacity-70 disabled:cursor-not-allowed';




// ── Hexagon MS badge (matches B31TablesEditor.MilestoneBadge) ──
function MilestoneBadge({ number }: { number: number | null | undefined }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: '#000', color: '#fff', fontFamily: "'Times New Roman', Times, serif",
      fontSize: '11pt', fontWeight: 700, lineHeight: '18px', height: '18px', padding: '0 6px',
      clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
      minWidth: 38,
    }}>
      MS{number ?? ''}
    </span>
  );
}

// ── Auto-textarea: local state + debounced save + flush on blur ──
// Prevents typing lag/dropped chars caused by per-keystroke DB writes + refetch overwrites.
interface AutoTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  debounceMs?: number;
}
function AutoTextarea({ value, onChange, debounceMs = 500, onBlur, onFocus, ...rest }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [local, setLocal] = useState(value ?? '');
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPending = useRef(false);
  const localRef = useRef(local);
  localRef.current = local;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const tracker = useContext(SaveTrackerContext);

  const markPending = (p: boolean) => {
    if (p === isPending.current) return;
    isPending.current = p;
    tracker?.bumpPending(p ? 1 : -1);
  };

  // Sync from props only when not focused (avoids mid-typing overwrite from refetch).
  useEffect(() => {
    if (!focused.current) setLocal(value ?? '');
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (isPending.current) {
      isPending.current = false;
      tracker?.bumpPending(-1);
    }
  }, [tracker]);

  // Register flush handler so the page-level "Save" button can force-persist.
  useEffect(() => {
    if (!tracker) return;
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        markPending(false);
        onChangeRef.current({ target: { value: localRef.current } });
      }
    };
    return tracker.registerFlush(flush);
  }, [tracker]);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  useEffect(() => { resize(); }, [local]);

  return (
    <textarea
      ref={ref}
      {...rest}
      value={local}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        if (timer.current) clearTimeout(timer.current);
        markPending(true);
        timer.current = setTimeout(() => {
          timer.current = null;
          markPending(false);
          onChangeRef.current({ target: { value: v } });
        }, debounceMs);
      }}
      onFocus={(e) => { focused.current = true; onFocus?.(e); }}
      onBlur={(e) => {
        focused.current = false;
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
          markPending(false);
          onChangeRef.current({ target: { value: local } });
        }
        onBlur?.(e);
      }}
      className={(rest.className || '') + ' w-full resize-none overflow-hidden bg-transparent border border-input rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring'}
      style={{ minHeight: 28, ...(rest.style || {}) }}
    />
  );
}


export function ProposalMilestonesRisksManager(props: Props) {
  // The toolbar drives whichever LazyRichField was last focused.
  return (
    <MethodologyEditorFocusProvider>
      <PageSearchProvider>
        <ProposalMilestonesRisksManagerInner {...props} />
      </PageSearchProvider>
    </MethodologyEditorFocusProvider>
  );
}


/**
 * LEGACY PAGE — kept as the rollback path only.
 *
 * Milestones and risks are authored inside the B3.1 block editor (blocks
 * Table 3.1.d and Table 3.1.e), which mounts the very same
 * `MilestonesEditor` / `RisksEditor` exported below. This page is reachable
 * from nothing.
 */
function ProposalMilestonesRisksManagerInner({ proposalId, canEdit, projectDuration = 36 }: Props) {
  const { activeEditor } = useMethodologyEditorFocus();
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const guidelineKey = useFocusedGuidelineKey();
  const pageSearch = usePageSearch();

  const { data: acronymSegments } = useQuery({
    queryKey: ['proposal-acronym-segments', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('acronym_segments')
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return ((data as { acronym_segments?: { text: string; color: string }[] } | null)?.acronym_segments) || [];
    },
  });

  return (
    <TooltipProvider>
    <div className="p-6 space-y-6 compact-ref-badges">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-bold text-foreground">Milestones &amp; risks</h1>
      </div>

      {canEdit && (
        <div className="contents">
          <EditorToolbars
            proposalId={proposalId}
            // Rollback page only: each editor saves itself, so the indicator
            // carries no page-level state.
            save={{ saving: false, lastSaved: null }}
            topBar={{
              onFindReplace: pageSearch ? () => pageSearch.setOpen(true) : undefined,
            }}
            fieldBar={{ onOpenGuidelines: () => setGuidelinesOpen(true) }}
            formatting={{
              proposalId,
              crossRefDropdown: (
                <ParticipantCrossRefDropdown
                  proposalId={proposalId}
                  acronymSegments={acronymSegments}
                  editor={activeEditor}
                />
              ),
            }}
          />
        </div>
      )}

      <Dialog open={guidelinesOpen} onOpenChange={setGuidelinesOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {guidelineKey === 'risks' ? 'Guidelines: critical risks' : 'Guidelines: milestones'}
            </DialogTitle>
          </DialogHeader>
          <GuidelineBox
            type="official"
            title={guidelineKey === 'risks' ? 'Critical risks' : 'Milestones'}
          >
            {guidelineKey === 'risks' ? <RisksGuidelinesInline /> : <MilestonesGuidelinesInline />}
          </GuidelineBox>
        </DialogContent>
      </Dialog>

      <Card data-guideline-key="milestones">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base">Milestones</CardTitle>
        </CardHeader>
        <CardContent>
          <MilestonesEditor
            proposalId={proposalId}
            canEdit={canEdit}
            projectDuration={projectDuration}
          />
        </CardContent>
      </Card>

      <Card data-guideline-key="risks">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base">Critical risks</CardTitle>
        </CardHeader>
        <CardContent>
          <RisksEditor proposalId={proposalId} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
      <PageFindReplacePanel />
    </TooltipProvider>
  );
}


/** WP lookup shared by both editors. */
function useWpRows(proposalId: string) {
  return useQuery<WPRow[]>({
    queryKey: ['wp-drafts-mr-mgr', proposalId],
    queryFn: async () => {
      const { data } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, color')
        .eq('proposal_id', proposalId)
        .order('number');
      return (data || []).map((wp: any) => ({
        ...wp,
        color: wp.color || DEFAULT_WP_COLORS[(wp.number - 1) % DEFAULT_WP_COLORS.length],
      }));
    },
  });
}

/** Cross-reference consumers re-read the milestone/risk tables on this event. */
function notifyRefs() {
  window.dispatchEvent(
    new CustomEvent('cross-ref-data-changed', { detail: { source: 'ProposalMilestonesRisksManager' } }),
  );
}

/**
 * Milestones editor — the authoring surface for Table 3.1.d.
 *
 * Mounted by the B3.1 block editor and, as the rollback path, by the legacy
 * page above. Data stays in `proposal_milestones` / `proposal_milestone_wps`:
 * only the surface moved.
 */
export function MilestonesEditor({
  proposalId,
  canEdit,
  projectDuration,
}: {
  proposalId: string;
  canEdit: boolean;
  /** Omitted inside the B3.1 block, where the duration is read here. */
  projectDuration?: number;
}) {
  const qc = useQueryClient();
  const { data: fetchedDuration } = useQuery({
    queryKey: ['proposal-duration', proposalId],
    enabled: !!proposalId && projectDuration == null,
    queryFn: async () => {
      const { data } = await supabase.from('proposals').select('duration').eq('id', proposalId).maybeSingle();
      return (data as { duration?: number } | null)?.duration ?? 36;
    },
  });
  const duration = projectDuration ?? fetchedDuration ?? 36;
  const { reportConflict, dialog: conflictDialog } = useVersionConflict();
  const [msReorderOpen, setMsReorderOpen] = useState(false);

  const { data: wps = [] } = useWpRows(proposalId);
  const wpsById = useMemo(() => new Map(wps.map((wp) => [wp.id, wp])), [wps]);

  const { data: milestones = [] } = useQuery<Milestone[]>({
    queryKey: MS_KEY(proposalId),
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('proposal_milestones')
        .select('id, number, title, due_month, means_of_verification, order_index, version')
        .eq('proposal_id', proposalId)
        .order('order_index')
        .order('number');
      const ids = (rows || []).map((r: any) => r.id);
      const wpLinksRes = ids.length
        ? await supabase.from('proposal_milestone_wps').select('milestone_id, wp_draft_id, is_primary').in('milestone_id', ids)
        : { data: [] as any[] };
      const wpMap = new Map<string, string[]>();
      const primaryMap = new Map<string, string | null>();
      for (const l of (wpLinksRes.data || []) as any[]) {
        const a = wpMap.get(l.milestone_id) || [];
        a.push(l.wp_draft_id);
        wpMap.set(l.milestone_id, a);
        if (l.is_primary) primaryMap.set(l.milestone_id, l.wp_draft_id);
      }
      return (rows || []).map((r: any) => ({
        ...r,
        title: leftAlignedCellHtml(r.title),
        means_of_verification: leftAlignedCellHtml(r.means_of_verification),
        wp_ids: wpMap.get(r.id) || [],
        primary_wp_id: primaryMap.get(r.id) ?? null,
      }));
    },
  });

  // Due month asc (nulls last), then intra-month order_index, then id. The
  // MS number itself is maintained by the database resequencing trigger —
  // nothing on the client writes `number`.
  const orderedMs = useMemo(() => {
    return [...milestones].sort((a, b) => {
      const da = a.due_month ?? Number.POSITIVE_INFINITY;
      const db = b.due_month ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      if (a.order_index !== b.order_index) return a.order_index - b.order_index;
      return a.id.localeCompare(b.id);
    });
  }, [milestones]);

  const persistMsGroupOrder = useCallback(async (newSorted: Milestone[]) => {
    // All-or-nothing: the whole reorder is refused if any row moved on, since a
    // half-applied order leaves the list in a state nobody asked for.
    const groups = new Map<string, Milestone[]>();
    for (const m of newSorted) {
      const key = String(m.due_month ?? '∅');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    const items = [] as { id: string; expected_version: number | null; number: number; order_index: number }[];
    for (const group of groups.values()) {
      group.forEach((m, i) => {
        items.push({ id: m.id, expected_version: m.version ?? null, number: m.number, order_index: i });
      });
    }
    if (items.length) {
      const res = await reorderVersionedRows('proposal_milestones', items);
      if (!res.ok) {
        toast.error(res.conflict
          ? 'Milestones changed elsewhere — the reorder was not applied.'
          : (res.error || 'Failed to reorder milestones'));
      }
    }
    qc.invalidateQueries({ queryKey: MS_KEY(proposalId) });
    notifyRefs();
  }, [proposalId, qc]);

  const addMilestone = useMutation({
    mutationFn: async () => {
      const nextOrder = (milestones.reduce((m, x) => Math.max(m, x.order_index), -1)) + 1;
      const nextNum = (milestones.reduce((m, x) => Math.max(m, x.number), 0)) + 1;
      const { error } = await supabase
        .from('proposal_milestones')
        .insert({ proposal_id: proposalId, number: nextNum, order_index: nextOrder, title: '' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); notifyRefs(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMilestone = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Milestone> }) => {
      const { wp_ids, task_ids, ...rest } = patch as any;
      if (typeof rest.title === 'string') rest.title = leftAlignedCellHtml(rest.title);
      if (typeof rest.means_of_verification === 'string') {
        rest.means_of_verification = leftAlignedCellHtml(rest.means_of_verification);
      }
      const known = milestones.find(m => m.id === id);
      // A due-month change reorders the board, so the renumber has to happen in
      // the same transaction as the write rather than as a follow-up call.
      const res = 'due_month' in rest
        ? await saveMilestoneAndResequence(id, rest, known?.version ?? null)
        : await saveVersionedRow('proposal_milestones', id, rest, known?.version ?? null);
      if (res.conflict) {
        reportConflict(Object.values(rest).find(v => typeof v === 'string' && v.trim() !== '') ?? null);
        throw new Error('This milestone was changed elsewhere — your change was not saved.');
      }
      if (!res.ok) throw new Error(res.error || 'Failed to save milestone');
    },
    onError: (e: any) => { toast.error(e.message); qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); notifyRefs(); },
  });

  const deleteMilestone = useMutation({
    mutationFn: async (id: string) => {
      const known = milestones.find(m => m.id === id);
      const res = await binAndDeleteNumberedRow('proposal_milestones', id, known?.version ?? null);
      if (!res.ok) {
        throw new Error(res.conflict
          ? 'This milestone changed elsewhere — it was not deleted.'
          : (res.error || 'Failed to delete milestone'));
      }
    },
    onError: (e: any) => { toast.error(e.message); qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MS_KEY(proposalId) });
      qc.invalidateQueries({ queryKey: ['proposal-row-bin', proposalId, 'proposal_milestones'] });
      notifyRefs();
    },
  });

  const setMsWps = useMutation({
    mutationFn: async ({ id, wpIds, primaryWpId }: { id: string; wpIds: string[]; primaryWpId: string | null }) => {
      await supabase.from('proposal_milestone_wps').delete().eq('milestone_id', id);
      if (wpIds.length > 0) {
        const effectivePrimary = primaryWpId && wpIds.includes(primaryWpId) ? primaryWpId : wpIds[0];
        const { error } = await supabase
          .from('proposal_milestone_wps')
          .insert(wpIds.map(w => ({ milestone_id: id, wp_draft_id: w, is_primary: w === effectivePrimary })));
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); notifyRefs(); },
  });

  // Page-wide find and replace over the stored milestone text. Writes reuse
  // the same versioned RPC as ordinary editing, so a stale row is rejected.
  const searchFields = useCallback((): SearchableField[] => {
    const out: SearchableField[] = [];
    for (const m of milestones) {
      const label = `MS${m.number}`;
      for (const [column, columnLabel, value] of [
        ['title', 'name', m.title],
        ['means_of_verification', 'means of verification', m.means_of_verification],
      ] as const) {
        if (!value) continue;
        out.push({
          id: `milestone:${m.id}:${column}`,
          label: `${label} › ${columnLabel}`,
          groupId: m.id,
          groupLabel: label,
          format: 'text',
          value,
          readOnly: !canEdit,
          reveal: () => jumpToElementId(`milestone-row-${m.id}`),
          save: !canEdit
            ? undefined
            : async (next): Promise<FieldSaveOutcome> => {
                const res = await saveVersionedRow('proposal_milestones', m.id, { [column]: next }, m.version ?? null);
                if (res.conflict) return { ok: false, conflict: true };
                if (!res.ok) return { ok: false, conflict: false, error: res.error };
                qc.invalidateQueries({ queryKey: MS_KEY(proposalId) });
                return { ok: true };
              },
        });
      }
    }
    return out;
  }, [milestones, canEdit, qc, proposalId]);

  usePageSearchSource('milestones', 'Milestones', searchFields);

  /* Document table geometry. Four content columns are resizable; the
     editor-only delete cell is excluded via data-noresize, so the saved array
     always has exactly four entries. The two long-text columns (name and
     means of verification) take the bulk of the 18 cm column; the WP and due
     month columns are sized to their controls. */
  const MS_HEADERS = ['Milestone name', 'Means of verification', 'WP(s)', 'Due month'];
  const MS_COL_PCT = ['32%', '34%', '22%', '12%'];
  const { colWidths: msColWidths, tableRef: msTableRef, handleColResizeStart: msResizeStart } =
    useColumnResize({
      proposalId,
      tableKey: 'b31-milestones',
      canResize: canEdit,
      maxTotalWidth: DOC_BLOCK_WIDTH,
      expectedColumnCount: MS_COL_PCT.length,
    });
  const msSized = msColWidths.length === MS_COL_PCT.length;
  const { headers: msHeaders, setHeader: setMsHeader } = useColumnHeaders(
    proposalId,
    'b31-milestones',
    MS_HEADERS,
  );




  return (
    <TooltipProvider>
      <div className="compact-ref-badges [&_.ProseMirror]:!text-left [&_.ProseMirror_*]:!text-left">
        {orderedMs.length === 0 ? (
          <div className="py-4 text-center text-muted-foreground italic">No milestones yet.</div>
        ) : (
          /* A single <tbody> holds every row: the resize hook measures
             `tbody tr:first-child`, so one tbody per milestone would have it
             measure the wrong row. One <tr> per milestone — every column,
             means of verification included, sits side by side. */
          <table
            ref={msTableRef}
            data-table-key="b31-milestones"
            className={`${docTableStyles} ${docTableRules} w-full`}
            style={{
              tableLayout: 'fixed',
              width: msSized
                ? `${msColWidths.reduce((s, w) => s + w, 0) + 28}px`
                : '100%',
              borderCollapse: 'collapse',
            }}
          >
            <colgroup>
              {MS_COL_PCT.map((pct, i) => (
                <col key={i} style={{ width: msSized ? `${msColWidths[i]}px` : pct }} />
              ))}
              {/* Editor-only action column; never part of the document table. */}
              <col style={{ width: '28px' }} />
            </colgroup>
            <thead>
              <tr>
                {msHeaders.map((h, i) => (
                  <th
                    key={i}
                    className={`${i === 0 ? docFirstCellStyles : docCellStyles} relative align-bottom font-bold`}
                  >
                    <EditableColumnHeader
                      value={h}
                      canEdit={canEdit}
                      onCommit={(next) => setMsHeader(i, next)}
                    />
                    {canEdit && i < MS_COL_PCT.length - 1 && (
                      <ColumnResizer onMouseDown={msResizeStart(i)} />
                    )}
                  </th>
                ))}
                <th data-noresize="" className={`${docCellStyles} !px-0 !border-0`} />
              </tr>
            </thead>
            <tbody>
              {orderedMs.map((m) => {
                const selectedWps = m.wp_ids
                  .map(id => wpsById.get(id))
                  .filter((w): w is WPRow => !!w)
                  .sort((a, b) => a.number - b.number);
                return (
                  <tr key={m.id} id={`milestone-row-${m.id}`}>
                    {/* The MS badge lives at the start of the name cell, so the
                        badge and the name share one column. */}
                    <td className={`${docFirstCellStyles} break-words`}>
                      <div className="flex items-start gap-1">
                        <span className="shrink-0 whitespace-nowrap">
                          <MilestoneBadge number={m.number} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <DebouncedRichField
                            value={m.title || ''}
                            className={LEFT_ALIGNED_CELL_CLASS}
                            cellSurface
                            disabled={!canEdit}
                            minHeight="0"
                            proposalId={proposalId}
                            staticExtensions={WP_TITLE_FIELD_EXTENSIONS}
                            onChange={(html) => updateMilestone.mutate({ id: m.id, patch: { title: html } })}
                          />
                        </div>
                      </div>
                    </td>
                    <td className={`${docCellStyles} break-words`}>
                      <DebouncedRichField
                        value={m.means_of_verification || ''}
                        className={LEFT_ALIGNED_CELL_CLASS}
                        cellSurface
                        disabled={!canEdit}
                        minHeight="0"
                        proposalId={proposalId}
                        staticExtensions={WP_SHORT_NARRATIVE_FIELD_EXTENSIONS}
                        placeholder="Means of verification"
                        onChange={(html) => updateMilestone.mutate({ id: m.id, patch: { means_of_verification: html } })}
                      />
                    </td>
                    <td className={docCellStyles}>
                      <MilestoneWpDialog
                        wps={wps}
                        selectedWpIds={m.wp_ids}
                        primaryWpId={m.primary_wp_id}
                        disabled={!canEdit}
                        onSave={(wpIds, primaryWpId) => setMsWps.mutate({ id: m.id, wpIds, primaryWpId })}
                        renderTrigger={(open) => (
                          <button type="button" onClick={open} disabled={!canEdit} className={SUBTLE_CONTROL}>
                            {selectedWps.length === 0 ? (
                              <span className="text-muted-foreground italic">Select WP(s)…</span>
                            ) : (
                              <span className="flex flex-wrap gap-0.5 items-center">
                                {isAllWPsSelected(selectedWps.length, wps.length) ? (
                                  <>
                                    <AllWPsBubble />
                                    {/* "All WPs" hides which WP is starred as
                                        primary for the Gantt, so the primary is
                                        shown alongside it — editor only. */}
                                    {selectedWps
                                      .filter((wp) => wp.id === m.primary_wp_id)
                                      .map((wp) => (
                                        <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} showStar />
                                      ))}
                                  </>
                                ) : (
                                  selectedWps.map(wp => (
                                    <WPBubble
                                      key={wp.id}
                                      wpNumber={wp.number}
                                      wpColor={wp.color}
                                      showStar={wp.id === m.primary_wp_id}
                                    />
                                  ))
                                )}
                              </span>
                            )}
                          </button>
                        )}
                      />
                    </td>
                    <td className={docCellStyles}>
                      <SingleMonthPicker
                        value={m.due_month}
                        projectDuration={duration}
                        readOnly={!canEdit}
                        label=""
                        cellSurface
                        onChange={(month) => updateMilestone.mutate({ id: m.id, patch: { due_month: month } })}
                      />
                    </td>
                    {/* Row action in its own cell: a bare div in a <tr> is not
                        laid out as a cell and would disappear. */}
                    <td data-noresize="" className={`${docCellStyles} !px-0 w-[28px] text-right`}>
                      <Button
                        size="icon" variant="ghost" className="h-6 w-6 text-red-600 hover:text-red-700"
                        disabled={!canEdit}
                        onClick={() => deleteMilestone.mutate(m.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {canEdit && (
          <div className="flex items-center justify-end gap-2 pt-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-muted hover:bg-muted/80 text-foreground"
                  onClick={() => setMsReorderOpen(true)}
                >
                  <ArrowUpDown className="h-4 w-4 mr-1" /> Reorder same-month
                </Button>
              </TooltipTrigger>
              <TooltipContent>Manually reorder milestones that share the same due month</TooltipContent>
            </Tooltip>
          </div>
        )}


        <MsSameMonthReorderDialog
          open={msReorderOpen}
          onOpenChange={setMsReorderOpen}
          sorted={orderedMs}
          wpsById={wpsById}
          onPersist={persistMsGroupOrder}
        />
        {conflictDialog}
      </div>
    </TooltipProvider>
  );
}


/**
 * Critical risks editor — the authoring surface for Table 3.1.e.
 *
 * Risks carry no printed number: they appear in the order the author drags
 * them into. Data stays in `proposal_risks` / `proposal_risk_wps`.
 */
export function RisksEditor({
  proposalId,
  canEdit,
}: {
  proposalId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const { reportConflict, dialog: conflictDialog } = useVersionConflict();
  const { data: wps = [] } = useWpRows(proposalId);

  const { data: risks = [] } = useQuery<Risk[]>({
    queryKey: RISK_KEY(proposalId),
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('proposal_risks')
        .select('id, number, title, likelihood, severity, mitigation, order_index, created_at, version')
        .eq('proposal_id', proposalId)
        .order('order_index')
        .order('created_at');
      const ids = (rows || []).map((r: any) => r.id);
      const linksRes = ids.length
        ? await supabase.from('proposal_risk_wps').select('risk_id, wp_draft_id').in('risk_id', ids)
        : { data: [] as any[] };
      const wpMap = new Map<string, string[]>();
      for (const l of linksRes.data || []) {
        const a = wpMap.get(l.risk_id) || [];
        a.push(l.wp_draft_id);
        wpMap.set(l.risk_id, a);
      }
      return (rows || []).map((r: any) => ({
        ...r,
        title: leftAlignedCellHtml(r.title),
        mitigation: leftAlignedCellHtml(r.mitigation),
        wp_ids: wpMap.get(r.id) || [],
      }));
    },
  });

  const addRisk = useMutation({
    mutationFn: async () => {
      const nextNum = (risks.reduce((m, x) => Math.max(m, x.number), 0)) + 1;
      const nextOrder = (risks.reduce((m, x) => Math.max(m, x.order_index), -1)) + 1;
      const { error } = await supabase
        .from('proposal_risks')
        .insert({ proposal_id: proposalId, number: nextNum, order_index: nextOrder, title: '' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateRisk = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Risk> }) => {
      const { wp_ids, ...rest } = patch as any;
      if (typeof rest.title === 'string') rest.title = leftAlignedCellHtml(rest.title);
      if (typeof rest.mitigation === 'string') rest.mitigation = leftAlignedCellHtml(rest.mitigation);
      const known = risks.find(r => r.id === id);
      const res = await saveVersionedRow('proposal_risks', id, rest, known?.version ?? null);
      if (res.conflict) {
        reportConflict(Object.values(rest).find(v => typeof v === 'string' && v.trim() !== '') ?? null);
        throw new Error('This risk was changed elsewhere — your change was not saved.');
      }
      if (!res.ok) throw new Error(res.error || 'Failed to save risk');
    },
    onError: (e: any) => { toast.error(e.message); qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }),
  });

  const deleteRisk = useMutation({
    mutationFn: async (id: string) => {
      const known = risks.find(r => r.id === id);
      const res = await binAndDeleteNumberedRow('proposal_risks', id, known?.version ?? null);
      if (!res.ok) {
        throw new Error(res.conflict
          ? 'This risk changed elsewhere — it was not deleted.'
          : (res.error || 'Failed to delete risk'));
      }
    },
    onError: (e: any) => { toast.error(e.message); qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) });
      qc.invalidateQueries({ queryKey: ['proposal-row-bin', proposalId, 'proposal_risks'] });
      notifyRefs();
    },
  });

  const setRiskWps = useMutation({
    mutationFn: async ({ id, wpIds }: { id: string; wpIds: string[] }) => {
      await supabase.from('proposal_risk_wps').delete().eq('risk_id', id);
      if (wpIds.length > 0) {
        const { error } = await supabase
          .from('proposal_risk_wps')
          .insert(wpIds.map(wp => ({ risk_id: id, wp_draft_id: wp })));
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }),
  });

  const riskSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persistRiskOrder = useCallback(async (ordered: Risk[]) => {
    // Sequential order_index 0..N-1, applied all-or-nothing against the
    // versions this session loaded.
    if (ordered.length) {
      const res = await reorderVersionedRows('proposal_risks', ordered.map((r, i) => ({
        id: r.id,
        expected_version: r.version ?? null,
        number: r.number,
        order_index: i,
      })));
      if (!res.ok) {
        toast.error(res.conflict
          ? 'Risks changed elsewhere — the reorder was not applied.'
          : (res.error || 'Failed to reorder risks'));
      }
    }
    qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) });
    qc.invalidateQueries({ queryKey: ['b31-risks-live', proposalId] });
    notifyRefs();
  }, [proposalId, qc]);

  const handleRiskDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = risks.findIndex(r => r.id === active.id);
    const newIndex = risks.findIndex(r => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(risks, oldIndex, newIndex);
    qc.setQueryData(RISK_KEY(proposalId), reordered.map((r, i) => ({ ...r, order_index: i })));
    persistRiskOrder(reordered);
  };

  const searchFields = useCallback((): SearchableField[] => {
    const out: SearchableField[] = [];
    for (const r of risks) {
      const label = `Risk ${r.number}`;
      for (const [column, columnLabel, value] of [
        ['title', 'description', r.title],
        ['mitigation', 'mitigation', r.mitigation],
      ] as const) {
        if (!value) continue;
        out.push({
          id: `risk:${r.id}:${column}`,
          label: `${label} › ${columnLabel}`,
          groupId: r.id,
          groupLabel: label,
          format: 'text',
          value,
          readOnly: !canEdit,
          reveal: () => jumpToElementId(`risk-row-${r.id}`),
          save: !canEdit
            ? undefined
            : async (next): Promise<FieldSaveOutcome> => {
                const res = await saveVersionedRow('proposal_risks', r.id, { [column]: next }, r.version ?? null);
                if (res.conflict) return { ok: false, conflict: true };
                if (!res.ok) return { ok: false, conflict: false, error: res.error };
                qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) });
                return { ok: true };
              },
        });
      }
    }
    return out;
  }, [risks, canEdit, qc, proposalId]);

  usePageSearchSource('risks', 'Critical risks', searchFields);

  /* Document table geometry. Five content columns are resizable; the
     editor-only delete cell is excluded via data-noresize. The drag grip is
     not a column at all — it sits in the page's left margin — so the first
     real column starts flush at the text column's inner edge. The two long
     text columns (description and mitigation) take the bulk of the width. */
  const RISK_HEADERS = ['Risk description', 'i.', 'ii.', 'WP(s)', 'Mitigation & adaptation measures'];
  const RISK_COL_PCT = ['28%', '7%', '7%', '22%', '36%'];

  const { colWidths: riskColWidths, tableRef: riskTableRef, handleColResizeStart: riskResizeStart } =
    useColumnResize({
      proposalId,
      tableKey: 'b31-risks',
      canResize: canEdit,
      maxTotalWidth: DOC_BLOCK_WIDTH,
      expectedColumnCount: RISK_COL_PCT.length,
    });
  const riskSized = riskColWidths.length === RISK_COL_PCT.length;
  const { headers: riskHeaders, setHeader: setRiskHeader } = useColumnHeaders(
    proposalId,
    'b31-risks',
    RISK_HEADERS,
  );

  return (
    <TooltipProvider>
      <div className="compact-ref-badges [&_.ProseMirror]:!text-left [&_.ProseMirror_*]:!text-left">
        {risks.length === 0 ? (
          <div className="py-4 text-center text-muted-foreground italic">No risks yet.</div>
        ) : (
          <DndContext
            sensors={riskSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleRiskDragEnd}
          >
            <SortableContext items={risks.map(r => r.id)} strategy={verticalListSortingStrategy}>
              {/* A single <tbody> holds every row: the resize hook measures
                  `tbody tr:first-child`, so one tbody per risk would have it
                  measure the wrong row. */}
              <table
                ref={riskTableRef}
                data-table-key="b31-risks"
                className={`${docTableStyles} ${docTableRules} w-full`}
                style={{
                  tableLayout: 'fixed',
                  width: riskSized
                    ? `${riskColWidths.reduce((s, w) => s + w, 0) + 28}px`
                    : '100%',
                  borderCollapse: 'collapse',
                }}
              >
                <colgroup>
                  {RISK_COL_PCT.map((pct, i) => (
                    <col key={i} style={{ width: riskSized ? `${riskColWidths[i]}px` : pct }} />
                  ))}
                  {/* Editor-only action column; never part of the document table. */}
                  <col style={{ width: '28px' }} />
                </colgroup>
                <thead>
                  <tr>
                    {riskHeaders.map((h, i) => (
                      <th
                        key={i}
                        className={`${i === 0 ? docFirstCellStyles : docCellStyles} relative align-bottom font-bold`}
                      >
                        <EditableColumnHeader
                          value={h}
                          canEdit={canEdit}
                          onCommit={(next) => setRiskHeader(i, next)}
                        />
                        {canEdit && i < RISK_COL_PCT.length - 1 && (
                          <ColumnResizer onMouseDown={riskResizeStart(i)} />
                        )}
                      </th>
                    ))}
                    <th data-noresize="" className={`${docCellStyles} !px-0 !border-0`} />
                  </tr>
                </thead>

                <tbody>
                  {risks.map((r) => (
                    <SortableRiskRow
                      key={r.id}
                      risk={r}
                      wps={wps}
                      canEdit={canEdit}
                      onUpdate={(patch) => updateRisk.mutate({ id: r.id, patch })}
                      onSetWps={(ids) => setRiskWps.mutate({ id: r.id, wpIds: ids })}
                      onDelete={() => deleteRisk.mutate(r.id)}
                      proposalId={proposalId}
                    />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        )}

        {canEdit && (
          <div className="flex items-center justify-end gap-2 pt-3">
            <Button size="sm" onClick={() => addRisk.mutate()}>
              <Plus className="h-4 w-4 mr-1" /> Add risk
            </Button>
          </div>
        )}
        {conflictDialog}
      </div>
    </TooltipProvider>
  );
}


// ── Sortable rows for the risks table: scalars, then mitigation full-width ──
// Risks carry no printed number, so the first cell holds only the grip.
function SortableRiskRow({
  risk, wps, canEdit, onUpdate, onSetWps, onDelete, proposalId,
}: {
  risk: Risk;
  wps: WPRow[];
  canEdit: boolean;
  onUpdate: (patch: Partial<Risk>) => void;
  onSetWps: (ids: string[]) => void;
  onDelete: () => void;
  proposalId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: risk.id,
    disabled: !canEdit,
  });
  // Both rows of the pair carry the same transform so a dragged risk moves whole.
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <Fragment>
      {/* Scalar line: grip, description, likelihood, severity, WP(s), delete.
          The rule sits under the mitigation row, so it falls between risks. */}
      <tr ref={setNodeRef} style={style} id={`risk-row-${risk.id}`} className="!border-b-0">
        <td data-noresize="" className={`${docFirstCellStyles} whitespace-nowrap`}>
          {canEdit && (
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing inline-flex items-center justify-center"
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4 text-[#2563EB]" />
            </button>
          )}
        </td>
        <td className={`${docCellStyles} break-words`}>
          <DebouncedRichField
            value={risk.title || ''}
            className={LEFT_ALIGNED_CELL_CLASS}
            cellSurface
            disabled={!canEdit}
            minHeight="0"
            proposalId={proposalId}
            staticExtensions={WP_TITLE_FIELD_EXTENSIONS}
            onChange={(html) => onUpdate({ title: html })}
          />
        </td>
        <td className={docCellStyles}>
          <RiskLevelSelect
            value={(risk.likelihood as 'L' | 'M' | 'H' | null) || null}
            disabled={!canEdit}
            cellSurface
            onChange={(v) => onUpdate({ likelihood: v })}
          />
        </td>
        <td className={docCellStyles}>
          <RiskLevelSelect
            value={(risk.severity as 'L' | 'M' | 'H' | null) || null}
            disabled={!canEdit}
            cellSurface
            onChange={(v) => onUpdate({ severity: v })}
          />
        </td>
        <td className={docCellStyles}>
          <WPMultiSelect
            allWps={wps}
            selectedIds={risk.wp_ids}
            disabled={!canEdit}
            cellSurface
            onChange={onSetWps}
          />
        </td>
        {/* Row action in its own cell: a bare div in a <tr> is not laid out as
            a cell and would disappear. */}
        <td data-noresize="" className={`${docCellStyles} !px-0 w-[28px] text-right`}>
          <Button
            size="icon" variant="ghost" className="h-6 w-6 text-red-600 hover:text-red-700"
            disabled={!canEdit}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </td>
      </tr>
      {/* Mitigation & adaptation measures: its own full-width row beneath. */}
      <tr style={style}>
        <td data-noresize="" className={docFirstCellStyles} />
        <td className={`${docCellStyles} break-words`} colSpan={5}>
          <DebouncedRichField
            value={risk.mitigation || ''}
            className={LEFT_ALIGNED_CELL_CLASS}
            cellSurface
            disabled={!canEdit}
            minHeight="0"
            proposalId={proposalId}
            staticExtensions={WP_SHORT_NARRATIVE_FIELD_EXTENSIONS}
            placeholder="Mitigation & adaptation measures"
            onChange={(html) => onUpdate({ mitigation: html })}
          />
        </td>
      </tr>
    </Fragment>
  );
}



// ── L/M/H badge dropdown (uses the same RiskBadge as Table 3.1.e) ──
function RiskLevelSelect({
  value, onChange, disabled, cellSurface,
}: {
  value: 'L' | 'M' | 'H' | null;
  onChange: (v: 'L' | 'M' | 'H' | null) => void;
  disabled?: boolean;
  /** Reads as cell text inside a document table until hovered or focused. */
  cellSurface?: boolean;
}) {
  return (
    <Select
      value={value ?? '__none__'}
      onValueChange={(v) => onChange(v === '__none__' ? null : (v as 'L' | 'M' | 'H'))}
      disabled={disabled}
    >
      <SelectTrigger
        hideArrow
        className={cellSurface
          ? `${SUBTLE_CONTROL} h-auto min-h-0 py-[1px] inline-flex justify-start focus:ring-0`
          : 'h-8 w-auto inline-flex px-1 border-0 bg-transparent focus:ring-0'}
      >
        <span className="inline-flex items-center">
          {value ? <RiskBadge level={value} /> : <span className="text-muted-foreground">—</span>}
        </span>
      </SelectTrigger>

      <SelectContent>
        <SelectItem value="__none__"><span className="text-muted-foreground">—</span></SelectItem>
        <SelectItem value="L"><RiskBadge level="L" /></SelectItem>
        <SelectItem value="M"><RiskBadge level="M" /></SelectItem>
        <SelectItem value="H"><RiskBadge level="H" /></SelectItem>
      </SelectContent>
    </Select>
  );
}
// ── Inline guidelines rendered under each card title ──
function MilestonesGuidelinesInline() {
  return (
    <div className="text-sm text-muted-foreground space-y-1.5 pt-1">
      <p>
        This list is mirrored to Table 3.1.d (List of milestones). Milestones are automatically ordered by due month.
        Each milestone is linked to one or more work packages (no tasks); one of those WPs is marked the
        <strong> primary WP</strong>, which is the row the milestone sits on in the Gantt chart.
      </p>
      <p>
        <span className="font-medium text-foreground">Milestone:</span> control points in the project that help to
        chart progress. Milestones may correspond to the achievement of a key result, allowing the next phase of the
        work to begin. They may also be needed at intermediary points so that, if problems have arisen, corrective
        measures can be taken. The achievement of a milestone should be verifiable.
      </p>
      <p>
        <span className="font-medium text-foreground">Due date:</span> measured in months from the project start date.
      </p>
      <p>
        <span className="font-medium text-foreground">Means of verification:</span> show how you will confirm that the
        milestone has been attained. Refer to indicators if appropriate (e.g. a laboratory prototype that is
        &lsquo;up and running&rsquo;; software released and validated by a user group; field survey complete and data
        quality validated).
      </p>
    </div>
  );
}

function RisksGuidelinesInline() {
  return (
    <div className="text-sm text-muted-foreground space-y-1.5 pt-1">
      <p>
        This list is mirrored to Table 3.1.e (Risk table). Risks appear in the order you arrange them &mdash; drag the
        grip to reorder.
      </p>

      <p>
        <span className="font-medium text-foreground">Critical risk:</span> a plausible event or issue that could have
        a high adverse impact on the ability of the project to achieve its objectives.
      </p>
      <p>
        <span className="font-medium text-foreground">i. Level of likelihood to occur</span>: the
        estimated probability that the risk will materialise, even after taking account of the mitigating measures put
        in place.
      </p>
      <p>
        <span className="font-medium text-foreground">ii. Level of severity</span>: the relative
        seriousness of the risk and the significance of its effect.
      </p>
      <p className="flex flex-wrap items-center gap-1">
        <RiskBadge level="L" /><span>= low likelihood or severity;</span>
        <RiskBadge level="M" /><span>= medium;</span>
        <RiskBadge level="H" /><span>= high.</span>
      </p>
    </div>
  );
}


// ── WP multi-select (used by risks) ─────────────────────────────
function WPMultiSelect({
  allWps, selectedIds, onChange, disabled, cellSurface,
}: {
  allWps: WPRow[]; selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
  /** Reads as cell text inside a document table until hovered or focused. */
  cellSurface?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const current = draft ?? selectedIds;
  const ordered = [...allWps].sort((a, b) => a.number - b.number);
  const selectedWps = ordered.filter(wp => current.includes(wp.id));

  const toggle = (id: string) => {
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    setDraft(next);
  };

  const commit = (next: boolean) => {
    setOpen(next);
    if (!next && draft) {
      onChange(draft);
      setDraft(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={commit}>
      <PopoverTrigger asChild>
        {cellSurface ? (
          <button type="button" className={SUBTLE_CONTROL} disabled={disabled}>
            <span className="flex flex-wrap gap-0.5 items-center w-full">
              {selectedWps.length === 0
                ? <span className="text-muted-foreground italic">Select WP(s)…</span>
                : isAllWPsSelected(selectedWps.length, ordered.length)
                  ? <AllWPsBubble />
                  : selectedWps.map(wp => <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} />)}
            </span>
          </button>
        ) : (
          <Button variant="outline" size="sm" className="h-auto min-h-8 w-full justify-start font-normal py-1 px-1.5 whitespace-normal" disabled={disabled}>
            <span className="flex flex-wrap gap-0.5 w-full">
              {selectedWps.length === 0
                ? <span className="text-muted-foreground">Select…</span>
                : isAllWPsSelected(selectedWps.length, ordered.length)
                  ? <AllWPsBubble />
                  : selectedWps.map(wp => <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} />)}
            </span>
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {ordered.map(wp => (
            <label key={wp.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent cursor-pointer">
              <Checkbox checked={current.includes(wp.id)} onCheckedChange={() => toggle(wp.id)} />
              <WPBubble wpNumber={wp.number} wpColor={wp.color} />
              <span className="text-sm truncate">{wp.short_name || `WP${wp.number}`}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── WP-only dialog for milestones (related + primary) ───────────
function MilestoneWpDialog({
  wps, selectedWpIds, primaryWpId, disabled, onSave, renderTrigger,
}: {
  wps: WPRow[];
  selectedWpIds: string[];
  primaryWpId: string | null;
  disabled?: boolean;
  onSave: (wpIds: string[], primaryWpId: string | null) => void;
  renderTrigger: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draftWps, setDraftWps] = useState<string[]>(selectedWpIds);
  const [draftPrimary, setDraftPrimary] = useState<string | null>(primaryWpId);

  useEffect(() => {
    if (open) {
      setDraftWps(selectedWpIds);
      setDraftPrimary(primaryWpId);
    }
  }, [open, selectedWpIds, primaryWpId]);

  const orderedWps = useMemo(() => [...wps].sort((a, b) => a.number - b.number), [wps]);

  const toggleWp = (wp: WPRow) => {
    if (draftWps.includes(wp.id)) {
      const next = draftWps.filter(x => x !== wp.id);
      setDraftWps(next);
      // Unchecked WP clears primary if it was the primary;
      // auto-pick the lowest remaining checked WP as the new primary.
      if (draftPrimary === wp.id) {
        const fallback = orderedWps.find(w => next.includes(w.id));
        setDraftPrimary(fallback ? fallback.id : null);
      }
    } else {
      const next = [...draftWps, wp.id];
      setDraftWps(next);
      // First-checked WP becomes primary by default.
      if (!draftPrimary) setDraftPrimary(wp.id);
    }
  };

  const setPrimary = (wpId: string) => {
    if (!draftWps.includes(wpId)) return; // only checked WPs can be primary
    setDraftPrimary(wpId);
  };

  const save = () => {
    const effective = draftPrimary && draftWps.includes(draftPrimary)
      ? draftPrimary
      : (draftWps[0] ?? null);
    onSave(draftWps, effective);
    setOpen(false);
  };

  return (
    <>
      {renderTrigger(() => !disabled && setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Related work packages</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground -mt-1 space-y-1">
            <p>Tick the WPs related to this milestone, then mark one as the <strong>primary</strong> WP.</p>
            <p>The primary WP determines which row the milestone sits on in the Gantt chart.</p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {orderedWps.length === 0 ? (
              <div className="text-sm text-muted-foreground italic py-2">No work packages defined yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="w-10 py-1.5 text-center" title="Related"><Check className="h-4 w-4 inline" /></th>
                    <th className="w-10 py-1.5 text-center" title="Primary"><Star className="h-4 w-4 inline" /></th>
                    <th className="py-1.5 px-2 text-left">Work package</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedWps.map(wp => {
                    const checked = draftWps.includes(wp.id);
                    const isPrimary = draftPrimary === wp.id;
                    return (
                      <tr key={wp.id} className="border-b last:border-b-0 hover:bg-accent/40">
                        <td className="py-1.5 text-center">
                          <Checkbox checked={checked} onCheckedChange={() => toggleWp(wp)} />
                        </td>
                        <td className="py-1.5 text-center">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={isPrimary}
                            aria-label={isPrimary ? 'Primary WP' : 'Set as primary WP'}
                            disabled={!checked}
                            onClick={() => setPrimary(wp.id)}
                            className="inline-flex items-center justify-center p-0.5 rounded-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <Star
                              className={`h-4 w-4 ${isPrimary ? 'text-amber-500 fill-amber-400' : 'text-muted-foreground'}`}
                            />
                          </button>
                        </td>
                        <td className="py-1.5 px-2">
                          <span className="inline-flex items-center gap-2">
                            <WPBubble wpNumber={wp.number} wpColor={wp.color} />
                            <span className="truncate">{wp.short_name || `WP${wp.number}`}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Same-month reorder dialog for milestones (mirrors the deliverables one) ──
function MsSameMonthReorderDialog({
  open, onOpenChange, sorted, wpsById, onPersist,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sorted: Milestone[];
  wpsById: Map<string, WPRow>;
  onPersist: (newSorted: Milestone[]) => Promise<void>;
}) {
  const [working, setWorking] = useState<Milestone[]>(sorted);
  useEffect(() => { if (open) setWorking(sorted); }, [open, sorted]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: Milestone[] }>();
    for (const m of working) {
      const key = m.due_month == null ? '∅' : String(m.due_month);
      const label = m.due_month == null ? 'No due month set' : `Month ${m.due_month}`;
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key)!.items.push(m);
    }
    return Array.from(map.values());
  }, [working]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (groupKey: string) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setWorking(prev => {
      const g = prev.filter(m => (m.due_month == null ? '∅' : String(m.due_month)) === groupKey);
      const oldIdx = g.findIndex(m => m.id === active.id);
      const newIdx = g.findIndex(m => m.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      const reordered = arrayMove(g, oldIdx, newIdx);
      const it = reordered[Symbol.iterator]();
      return prev.map(m => {
        const k = m.due_month == null ? '∅' : String(m.due_month);
        return k === groupKey ? it.next().value! : m;
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
          <DialogTitle>Reorder milestones sharing a due month</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Drag within a group to reorder. A milestone can only move above or below other milestones with the same
          due month. MS numbers are recomputed automatically when you save.
        </p>
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.key} className="rounded border border-border/40">
              <div className="px-2 py-1 text-xs font-semibold bg-muted/50">{g.label}</div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(g.key)}>
                <SortableContext items={g.items.map(m => m.id)} strategy={verticalListSortingStrategy}>
                  <div className="divide-y divide-border/40">
                    {g.items.map(m => (
                      <MsReorderRow key={m.id} m={m} wpsById={wpsById} />
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
            <div className="text-xs italic text-muted-foreground">No milestones yet.</div>
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

function MsReorderRow({ m, wpsById }: { m: Milestone; wpsById: Map<string, WPRow> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const selectedWps = m.wp_ids
    .map(id => wpsById.get(id))
    .filter((w): w is WPRow => !!w)
    .sort((a, b) => a.number - b.number);
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
      <MilestoneBadge number={m.number} />
      {/* Stored titles are rich text; the dialog shows them as plain text
          (tags stripped, entities decoded). */}
      <span className="text-sm truncate flex-1">
        {htmlToPlainText(m.title || '') || <span className="italic text-muted-foreground">Untitled</span>}
      </span>
      <span className="flex flex-wrap gap-0.5">
        {isAllWPsSelected(selectedWps.length, wpsById.size)
          ? <AllWPsBubble />
          : selectedWps.map(wp => <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} />)}
      </span>
    </div>
  );
}
