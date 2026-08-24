import { useEffect, useMemo, useRef, useState, useCallback, createContext, useContext, type CSSProperties } from 'react';
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
} from '@/components/wp/wpDraftFieldExtensions';
import { getEditorCapabilities } from '@/lib/fieldCapabilities';
import { ParticipantCrossRefDropdown } from '@/components/participant/ParticipantCrossRefDropdown';
import {
  MethodologyEditorFocusProvider,
  useMethodologyEditorFocus,
} from '@/components/MethodologyEditorFocusContext';
import { EditorToolbars } from '@/components/editor/EditorToolbars';
import { saveVersionedRow, reorderVersionedRows, deleteAndResequence } from '@/lib/versionedSave';
import {
  PageSearchProvider,
  usePageSearch,
  usePageSearchSource,
} from '@/lib/findReplace/PageSearchProvider';
import type { FieldSaveOutcome, SearchableField } from '@/lib/findReplace/types';
import { PageFindReplacePanel } from '@/components/findReplace/PageFindReplacePanel';
import { jumpToElementId } from '@/lib/jumpToElement';

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

// Fixed column tracks shared by each row's metadata line and the label header
// row above the list, so fields align across rows. A column is reserved for
// every control, including on rows that do not render one.
/* Line 1 of a milestone row: name, then its metadata in fixed columns. */
const MILESTONE_LINE1_GRID =
  'grid grid-cols-[1fr_17rem_7rem_1.75rem] items-start gap-x-2';
/* Line 1 of a risk row: description (same 1fr share as the milestone name),
   narrow i./ii. columns, and a WP column widened with the space freed. */
const RISK_LINE1_GRID =
  'grid grid-cols-[1fr_3rem_3rem_17.5rem_1.75rem] items-start gap-x-2';




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


function ProposalMilestonesRisksManagerInner({ proposalId, canEdit, projectDuration = 36 }: Props) {
  const { activeEditor } = useMethodologyEditorFocus();
  const runOnActiveEditor = (fn: (chain: ReturnType<NonNullable<typeof activeEditor>['chain']>) => void) => {
    if (!activeEditor || activeEditor.isDestroyed) return;
    fn(activeEditor.chain().focus());
  };

  /**
   * Maps the shared toolbar's execCommand-style vocabulary onto the focused
   * TipTap editor, so this page uses the same toolbar as every other surface.
   */
  const execCommand = (command: string, value?: string) => {
    runOnActiveEditor((chain) => {
      const c = chain as any;
      switch (command) {
        case 'bold': c.toggleBold().run(); break;
        case 'italic': c.toggleItalic().run(); break;
        case 'underline': c.toggleUnderline().run(); break;
        case 'insertUnorderedList': c.toggleBulletList?.().run(); break;
        case 'insertOrderedList': c.toggleOrderedList?.().run(); break;
        case 'justifyLeft': c.setTextAlign?.('left')?.run(); break;
        case 'justifyCenter': c.setTextAlign?.('center')?.run(); break;
        case 'justifyRight': c.setTextAlign?.('right')?.run(); break;
        case 'justifyFull': c.setTextAlign?.('justify')?.run(); break;
        case 'insertHTML': c.insertContent(value ?? '').run(); break;
        default: break;
      }
    });
  };
  const qc = useQueryClient();

  // ── Save-state tracking for the page-header SaveIndicator ────
  const pendingTextareasRef = useRef(0);
  const [pendingTextareas, setPendingTextareas] = useState(0);
  const flushers = useRef(new Set<() => void>());
  const [activeSaves, setActiveSaves] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const tracker = useMemo<SaveTrackerCtx>(() => ({
    bumpPending: (delta: number) => {
      pendingTextareasRef.current = Math.max(0, pendingTextareasRef.current + delta);
      setPendingTextareas(pendingTextareasRef.current);
    },
    registerFlush: (flush: () => void) => {
      flushers.current.add(flush);
      return () => { flushers.current.delete(flush); };
    },
  }), []);

  // Offers back text refused by the version guard, as the cards board does.
  const { reportConflict, dialog: conflictDialog } = useVersionConflict();

  // Apply to every mutation to track saving/lastSaved/saveError.
  const saveHooks = useMemo(() => ({
    onMutate: () => { setActiveSaves(s => s + 1); },
    onSettled: (_data: unknown, err: unknown) => {
      setActiveSaves(s => Math.max(0, s - 1));
      if (err) setSaveError((err as any)?.message || String(err));
      else { setLastSaved(new Date()); setSaveError(null); }
    },
  }), []);

  const saveNow = useCallback(() => {
    // Flush every armed AutoTextarea timer — their onChange fires the mutation immediately.
    Array.from(flushers.current).forEach(f => { try { f(); } catch { /* noop */ } });
  }, []);



  // ── WP + task lookups ────────────────────────────────────────
  const { data: wps = [] } = useQuery<WPRow[]>({
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

  const wpIdsKey = wps.map(w => w.id).join(',');
  const { data: tasks = [] } = useQuery<TaskRow[]>({
    queryKey: ['wp-tasks-mr-mgr', proposalId, wpIdsKey],
    queryFn: async () => {
      if (wps.length === 0) return [];
      const { data } = await supabase
        .from('wp_draft_tasks')
        .select('id, number, title, wp_draft_id')
        .in('wp_draft_id', wps.map(wp => wp.id))
        .order('number');
      return data || [];
    },
    enabled: wps.length > 0,
  });

  // ── Milestones ───────────────────────────────────────────────
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
        wp_ids: wpMap.get(r.id) || [],
        primary_wp_id: primaryMap.get(r.id) ?? null,
      }));
    },
  });

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
      return (rows || []).map((r: any) => ({ ...r, wp_ids: wpMap.get(r.id) || [] }));
    },
  });


  // Helper: bump cross-ref consumers when MS data changes
  const notifyRefs = () => {
    window.dispatchEvent(new CustomEvent('cross-ref-data-changed', { detail: { source: 'ProposalMilestonesRisksManager' } }));
  };

  const wpsById = useMemo(() => new Map(wps.map(wp => [wp.id, wp])), [wps]);

  // ── Auto-order milestones: due_month asc (nulls last), then intra-month order_index, then id ──
  const orderedMs = useMemo(() => {
    return [...milestones].sort((a, b) => {
      const da = a.due_month ?? Number.POSITIVE_INFINITY;
      const db = b.due_month ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      if (a.order_index !== b.order_index) return a.order_index - b.order_index;
      return a.id.localeCompare(b.id);
    });
  }, [milestones]);

  // ── Milestone numbering is maintained by the database resequencing trigger ──
  // (due month, then order_index). Nothing on the client writes `number`.

  // ── Persist same-month manual order_index (called by reorder dialog) ──
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


  // Means of verification is rich text (formatting + cross-reference badges).
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



  // ── Mutations: milestones ────────────────────────────────────
  const addMilestone = useMutation({
    mutationFn: async () => {
      const nextOrder = (milestones.reduce((m, x) => Math.max(m, x.order_index), -1)) + 1;
      // max(number) + 1, matching risks. `length + 1` duplicated an existing
      // number whenever the list already had a gap.
      const nextNum = (milestones.reduce((m, x) => Math.max(m, x.number), 0)) + 1;
      const { error } = await supabase
        .from('proposal_milestones')
        .insert({ proposal_id: proposalId, number: nextNum, order_index: nextOrder, title: '' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); notifyRefs(); },
    onError: (e: any) => toast.error(e.message),
    ...saveHooks,
  });

  const updateMilestone = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Milestone> }) => {
      const { wp_ids, task_ids, ...rest } = patch as any;
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
    ...saveHooks,
  });

  const deleteMilestone = useMutation({
    mutationFn: async (id: string) => {
      const known = milestones.find(m => m.id === id);
      const res = await deleteAndResequence('proposal_milestones', id, known?.version ?? null);
      if (!res.ok) {
        throw new Error(res.conflict
          ? 'This milestone changed elsewhere — it was not deleted.'
          : (res.error || 'Failed to delete milestone'));
      }
    },
    onError: (e: any) => { toast.error(e.message); qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: MS_KEY(proposalId) }); notifyRefs(); },
    ...saveHooks,
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
    ...saveHooks,
  });

  // ── Mutations: risks (UNCHANGED — part 2 will revisit) ───────
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
    ...saveHooks,
  });

  const updateRisk = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Risk> }) => {
      const { wp_ids, ...rest } = patch as any;
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
    ...saveHooks,
  });

  const deleteRisk = useMutation({
    mutationFn: async (id: string) => {
      const known = risks.find(r => r.id === id);
      const res = await deleteAndResequence('proposal_risks', id, known?.version ?? null);
      if (!res.ok) {
        throw new Error(res.conflict
          ? 'This risk changed elsewhere — it was not deleted.'
          : (res.error || 'Failed to delete risk'));
      }
    },
    onError: (e: any) => { toast.error(e.message); qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: RISK_KEY(proposalId) }),
    ...saveHooks,
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
    ...saveHooks,
  });

  // Risks are user-ordered via drag-and-drop; sort by order_index then created_at (query already does this).
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
    // Optimistic cache update
    qc.setQueryData(RISK_KEY(proposalId), reordered.map((r, i) => ({ ...r, order_index: i })));
    persistRiskOrder(reordered);
  };


  const [msReorderOpen, setMsReorderOpen] = useState(false);

  return (
    <SaveTrackerContext.Provider value={tracker}>
    <TooltipProvider>
    <div className="p-6 space-y-6 compact-ref-badges">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-bold text-foreground">Milestones &amp; risks</h1>
      </div>

      {/* Shared focus-dependent toolbars, as on every other editing surface. */}
      {canEdit && (
        <div className="relative z-40">
          <EditorToolbars
            proposalId={proposalId}
            save={{ saving: activeSaves > 0, lastSaved, onSaveNow: saveNow }}
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


      {/* Milestones */}
      <Card>
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base">Milestones</CardTitle>
          <MilestonesGuidelinesInline />
        </CardHeader>
        <CardContent>





          <div className="space-y-1">
            {/* Column labels for the second line — same fixed grid as every row,
                indented to align with the milestone name above. */}
            {orderedMs.length > 0 && (
              <div className="grid grid-cols-[48px_1fr] gap-x-2 px-1 pb-1 border-b">
                <div />
                <div className={cn(MILESTONE_LINE1_GRID, 'text-xs font-medium text-muted-foreground')}>
                  <div>Milestone name</div>
                  <div>WP(s)</div>
                  <div>Due month</div>
                  <div />
                </div>
              </div>
            )}
            {orderedMs.length === 0 && (
              <div className="py-4 text-center text-muted-foreground italic">No milestones yet.</div>
            )}
            {orderedMs.map((m) => {
              const selectedWps = m.wp_ids
                .map(id => wpsById.get(id))
                .filter((w): w is WPRow => !!w)
                .sort((a, b) => a.number - b.number);
              return (
                <div key={m.id} className="grid grid-cols-[48px_1fr] gap-x-2 border-b py-1.5 space-y-1 px-1">
                  {/* ── Line 1: MS chip + name + WP(s) + due month + delete ── */}
                  <span className="flex-none whitespace-nowrap pt-0.5 w-[48px]">
                    <MilestoneBadge number={m.number} />
                  </span>

                  <div className={MILESTONE_LINE1_GRID}>
                    <div className="min-w-0">
                      <DebouncedRichField
                        value={m.title || ''}
                        disabled={!canEdit}
                        minHeight="30px"
                        proposalId={proposalId}
                        staticExtensions={WP_TITLE_FIELD_EXTENSIONS}
                        onChange={(html) => updateMilestone.mutate({ id: m.id, patch: { title: html } })}
                      />
                    </div>
                    <div>
                      <MilestoneWpDialog
                        wps={wps}
                        selectedWpIds={m.wp_ids}
                        primaryWpId={m.primary_wp_id}
                        disabled={!canEdit}
                        onSave={(wpIds, primaryWpId) => setMsWps.mutate({ id: m.id, wpIds, primaryWpId })}
                        renderTrigger={(open) => (
                          <button
                            type="button"
                            onClick={open}
                            disabled={!canEdit}
                            className="w-full min-h-7 px-1.5 py-1 border border-input rounded-md bg-background text-left hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {selectedWps.length === 0 ? (
                              <span className="text-muted-foreground italic">Select WP(s)…</span>
                            ) : (
                              <span className="flex flex-wrap gap-0.5 items-center">
                                {isAllWPsSelected(selectedWps.length, wps.length) ? (
                                  <>
                                    <AllWPsBubble />
                                    {/* "All WPs" hides which WP is starred as
                                        primary for the Gantt, so the primary is
                                        shown alongside it — editor only, never
                                        mirrored into the preview or export. */}
                                    {selectedWps
                                      .filter((wp) => wp.id === m.primary_wp_id)
                                      .map((wp) => (
                                        <WPBubble
                                          key={wp.id}
                                          wpNumber={wp.number}
                                          wpColor={wp.color}
                                          showStar
                                        />
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
                    </div>
                    <div>
                      <SingleMonthPicker
                        value={m.due_month}
                        projectDuration={projectDuration}
                        readOnly={!canEdit}
                        label=""
                        onChange={(month) => updateMilestone.mutate({ id: m.id, patch: { due_month: month } })}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700"
                        disabled={!canEdit}
                        onClick={() => deleteMilestone.mutate(m.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* ── Line 2: means of verification, aligned with the name above ── */}
                  <div className="col-start-2">
                    <DebouncedRichField
                      value={m.means_of_verification || ''}
                      disabled={!canEdit}
                      minHeight="30px"
                      proposalId={proposalId}
                      staticExtensions={WP_DRAFT_FIELD_EXTENSIONS}
                      placeholder="Means of verification"
                      onChange={(html) => updateMilestone.mutate({ id: m.id, patch: { means_of_verification: html } })}
                    />
                  </div>
                </div>
              );
            })}
          </div>

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
              <Button size="sm" onClick={() => addMilestone.mutate()}>
                <Plus className="h-4 w-4 mr-1" /> Add milestone
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Risks */}
      <Card>
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base">Critical risks</CardTitle>
          <RisksGuidelinesInline />
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {/* Column labels for the second line — same fixed grid as every row,
                indented to align with the risk description above. */}
            {risks.length > 0 && (
              <div className="grid grid-cols-[18px_1fr] gap-x-1 px-1 pb-1 border-b">
                <div />
                <div className={cn(RISK_LINE1_GRID, 'text-xs font-medium text-muted-foreground')}>
                  <div>Risk description</div>
                  <div className="text-center">i.</div>
                  <div className="text-center">ii.</div>
                  <div>WP(s)</div>
                  <div />
                </div>
              </div>
            )}
            <DndContext
              sensors={riskSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleRiskDragEnd}
            >
              <SortableContext items={risks.map(r => r.id)} strategy={verticalListSortingStrategy}>
                {risks.length === 0 && (
                  <div className="py-4 text-center text-muted-foreground italic">No risks yet.</div>
                )}
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
              </SortableContext>
            </DndContext>
          </div>


          {canEdit && (
            <div className="flex items-center justify-end gap-2 pt-3">
              <Button size="sm" onClick={() => addRisk.mutate()}>
                <Plus className="h-4 w-4 mr-1" /> Add risk
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
    </SaveTrackerContext.Provider>
  );

}


// ── Sortable row for the risks table (drag-handle in first cell) ──
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
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="group grid grid-cols-[18px_1fr] gap-x-1 border-b py-1.5 space-y-1 px-1">
      {/* ── Line 1: grip + description + likelihood + severity + WP(s) + delete ──
          The grip is permanently visible (no hover reveal) and sits close to
          the description field. */}
      <span className="flex-none w-[18px] flex items-center justify-start pt-1">
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
      </span>
      <div className={RISK_LINE1_GRID}>
        <div className="min-w-0">
          <DebouncedRichField
            value={risk.title || ''}
            disabled={!canEdit}
            minHeight="30px"
            proposalId={proposalId}
            staticExtensions={WP_TITLE_FIELD_EXTENSIONS}
            onChange={(html) => onUpdate({ title: html })}
          />
        </div>
        <div className="flex justify-center">
          <RiskLevelSelect
            value={(risk.likelihood as 'L' | 'M' | 'H' | null) || null}
            disabled={!canEdit}
            onChange={(v) => onUpdate({ likelihood: v })}
          />
        </div>
        <div className="flex justify-center">
          <RiskLevelSelect
            value={(risk.severity as 'L' | 'M' | 'H' | null) || null}
            disabled={!canEdit}
            onChange={(v) => onUpdate({ severity: v })}
          />
        </div>
        <div>
          <WPMultiSelect
            allWps={wps}
            selectedIds={risk.wp_ids}
            disabled={!canEdit}
            onChange={onSetWps}
          />
        </div>
        <div className="flex justify-center">
          <Button
            size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700"
            disabled={!canEdit}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Line 2: mitigation & adaptation measures, aligned with the description above ── */}
      <div className="col-start-2">
        <DebouncedRichField
          value={risk.mitigation || ''}
          disabled={!canEdit}
          minHeight="30px"
          proposalId={proposalId}
          staticExtensions={WP_DRAFT_FIELD_EXTENSIONS}
          placeholder="Mitigation & adaptation measures"
          onChange={(html) => onUpdate({ mitigation: html })}
        />
      </div>
    </div>

  );
}


// ── L/M/H badge dropdown (uses the same RiskBadge as Table 3.1.e) ──
function RiskLevelSelect({
  value, onChange, disabled,
}: {
  value: 'L' | 'M' | 'H' | null;
  onChange: (v: 'L' | 'M' | 'H' | null) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value ?? '__none__'}
      onValueChange={(v) => onChange(v === '__none__' ? null : (v as 'L' | 'M' | 'H'))}
      disabled={disabled}
    >
      <SelectTrigger hideArrow className="h-8 w-auto inline-flex px-1 border-0 bg-transparent focus:ring-0">
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
    <div className="text-xs text-muted-foreground space-y-1.5 pt-1">
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
    <div className="text-xs text-muted-foreground space-y-1.5 pt-1">
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


// ── WP multi-select (used by risks — UNCHANGED) ─────────────────
function WPMultiSelect({
  allWps, selectedIds, onChange, disabled,
}: {
  allWps: WPRow[]; selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
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
        <Button variant="outline" size="sm" className="h-auto min-h-8 w-full justify-start font-normal py-1 px-1.5 whitespace-normal" disabled={disabled}>
          <span className="flex flex-wrap gap-0.5 w-full">
            {selectedWps.length === 0
              ? <span className="text-muted-foreground">Select…</span>
              : isAllWPsSelected(selectedWps.length, ordered.length)
                ? <AllWPsBubble />
                : selectedWps.map(wp => <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} />)}
          </span>
        </Button>
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
