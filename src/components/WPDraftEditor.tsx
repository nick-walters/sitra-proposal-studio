import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { getCaseTypePrefix, caseWord } from '@/lib/caseTypeLabels';
import { useProposalCaseTypes } from '@/hooks/useProposalCaseTypes';

import { EditorToolbars, CrossRefMenu } from '@/components/editor/EditorToolbars';
import { useWPDraftEditor } from '@/hooks/useWPDrafts';
import { saveVersionedRow } from '@/lib/versionedSave';
import { jumpToElementId } from '@/lib/jumpToElement';
import {
  PageSearchProvider,
  usePageSearch,
  usePageSearchSource,
} from '@/lib/findReplace/PageSearchProvider';
import type { FieldSaveOutcome, SearchableField } from '@/lib/findReplace/types';
import { PageFindReplacePanel } from '@/components/findReplace/PageFindReplacePanel';
import { useWPDraftUndoRedo } from '@/hooks/useWPDraftUndoRedo';
import { WPTableSection } from '@/components/WPTableSection';
import {
  MethodologyEditorFocusProvider,
  useMethodologyEditorFocus,
} from '@/components/MethodologyEditorFocusContext';
import { getEditorCapabilities } from '@/lib/fieldCapabilities';
import { CardLockProvider, useCardLocks } from '@/hooks/useCardLocks';
import { LockTimeoutWarning } from '@/components/cards/LockTimeoutWarning';


import { WPDeliverablesTable } from '@/components/WPDeliverablesTable';
import { CitationDialog } from '@/components/CitationDialog';
import { InsertCrossReferenceDialog } from '@/components/InsertCrossReferenceDialog';
import { InsertWPReferenceDialog } from '@/components/InsertWPReferenceDialog';
import { InsertParticipantReferenceDialog } from '@/components/InsertParticipantReferenceDialog';
import { InsertCaseReferenceDialog } from '@/components/InsertCaseReferenceDialog';
import { InsertFigureDialog } from '@/components/InsertFigureDialog';
import { InsertTDMSReferenceDropdowns } from '@/components/InsertTDMSReferenceDropdowns';
import { useProposalReferences } from '@/hooks/useProposalReferences';
import { useQuery } from '@tanstack/react-query';

import { DebouncedInput } from '@/components/ui/debounced-input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Lightbulb, Table2, Image as ImageLucide, Crown, ChevronsUpDown, Check, Lock, BookOpen } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { markBadgeElement, markBadgeTree } from '@/lib/refBadgeMarkup';
import { toast } from 'sonner';
import type { ParticipantSummary } from '@/types/proposal';
import { useFocusedGuidelineKey } from '@/hooks/useFocusedGuidelineKey';
import { useCardGuidelines } from '@/hooks/useCardGuidelines';
import { useProposalTemplateVersion } from '@/hooks/useProposalTemplateVersion';
import DOMPurify from 'dompurify';
import { useFocusedVersionTarget } from '@/hooks/useFocusedVersionTarget';
import { CardFieldHistoryDialog } from '@/components/cards/CardFieldHistoryDialog';


interface WPDraftEditorProps {
  wpId: string;
  proposalId: string;
  canEdit: boolean;
  isCoordinator?: boolean;
  projectDuration?: number;
}

/* Guidance for WP draft fields is authored in the backend under Sections &
   Guidelines → Drafts (section D1), keyed by `drafts.wp.*`. Nothing is
   hardcoded here and nothing is borrowed from B3.1 any more. */
const GUIDELINE_TITLES: Record<string, string> = {
  'drafts.wp.objectives': 'Guidelines: WP objectives',
  'drafts.wp.intro': 'Guidelines: the field before the first task',
  'drafts.wp.task': 'Guidelines: tasks',
  'drafts.wp.deliverables': 'Guidelines: deliverables',
};

export function WPDraftEditor(props: WPDraftEditorProps) {
  return (
    <MethodologyEditorFocusProvider>
      {/* WP drafts are not a section, so the lock rows carry no section id
          (the column is nullable) and streaming uses a proposal-wide key. */}
      <CardLockProvider
        proposalId={props.proposalId}
        sectionId={null}
        channelKey={`wp-drafts:${props.proposalId}`}
        enabled
      >
        <PageSearchProvider>
          <WPDraftEditorInner {...props} />
          <WPLockTimeoutWarning />
        </PageSearchProvider>
      </CardLockProvider>
    </MethodologyEditorFocusProvider>
  );
}

/** Idle-timeout warning for whichever WP field this client currently holds. */
function WPLockTimeoutWarning() {
  const { warning } = useCardLocks();
  return warning ? <LockTimeoutWarning secondsLeft={warning.secondsLeft} /> : null;
}

function WPDraftEditorInner({ wpId, proposalId, canEdit: canEditProp, isCoordinator = false, projectDuration = 36 }: WPDraftEditorProps) {
  const {
    wpDraft,
    loading,
    saving,
    lastSaved,
    saveError,
    updateField,
    addTask,
    updateTask,
    deleteTask: rawDeleteTask,
    reorderTasks,
    binIntroField,
    updateWPEffort,
    setTaskParticipants,
    moveTaskToWP,
    addDeliverable,
    updateDeliverable,
    deleteDeliverable: rawDeleteDeliverable,
    moveDeliverableToWP,
    refetch: refetchDraft,
  } = useWPDraftEditor(wpId);


  const {
    canUndo, canRedo, undoLabel, redoLabel,
    undo, redo, recordDelete, recordAdd, reset: resetUndoRedo,
  } = useWPDraftUndoRedo(wpId);

  // Reset undo/redo when WP changes
  useEffect(() => { resetUndoRedo(); }, [wpId, resetUndoRedo]);

  // Wrapped delete functions that record for undo
  const deleteTask = useCallback(async (taskId: string) => {
    const task = wpDraft?.tasks?.find(t => t.id === taskId);
    if (task) recordDelete('task', task, { participants: task.participants, effort: task.effort });
    return rawDeleteTask(taskId);
  }, [rawDeleteTask, wpDraft, recordDelete]);

  const deleteDeliverable = useCallback(async (deliverableId: string) => {
    const d = wpDraft?.deliverables?.find(d => d.id === deliverableId);
    if (d) recordDelete('deliverable', d);
    return rawDeleteDeliverable(deliverableId);
  }, [rawDeleteDeliverable, wpDraft, recordDelete]);

  const handleUndo = useCallback(async () => {
    const result = await undo();
    if (result?.refetch) refetchDraft();
  }, [undo, refetchDraft]);

  const handleRedo = useCallback(async () => {
    const result = await redo();
    if (result?.refetch) refetchDraft();
  }, [redo, refetchDraft]);

  const { data: caseTypes = [] } = useProposalCaseTypes(proposalId);

  // wp_drafts.color is authoritative — theme colour is written down there
  // by the WP manager, so no effectiveColor fork is needed.
  const effectiveColor = wpDraft?.color || '#73C92D';



  // Lock enforcement
  const isLocked = (wpDraft as any)?.is_locked === true;
  const lockedById = (wpDraft as any)?.locked_by as string | null;
  const [lockWarningDismissed, setLockWarningDismissed] = useState(false);
  const [showLockWarning, setShowLockWarning] = useState(false);

  // Reset lock warning dismissal when WP changes
  useEffect(() => { setLockWarningDismissed(false); }, [wpId]);

  // Fetch locker's name
  const { data: lockerProfile } = useQuery({
    queryKey: ['profile-name', lockedById],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', lockedById!)
        .single();
      return data;
    },
    enabled: !!lockedById && isLocked,
  });
  const lockerName = lockerProfile?.full_name || lockerProfile?.email || 'another user';

  // Determine effective canEdit
  const canEdit = useMemo(() => {
    if (!canEditProp) return false;
    if (!isLocked) return true;
    // Locked: coordinators can edit after dismissing warning
    if (isCoordinator) return lockWarningDismissed;
    // Standard users cannot edit locked drafts
    return false;
  }, [canEditProp, isLocked, isCoordinator, lockWarningDismissed]);

  // Populate/snapshot system removed — WP draft sections are no longer locked
  // by populate flags. B3.1 reads live from the source tables.


  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [guidelinesDialogOpen, setGuidelinesDialogOpen] = useState(false);
  // Guidelines are keyed to the focused field (see `data-guideline-key`
  // markers on the WP table / deliverables), falling back to the whole WP.
  const focusedGuidelineKey = useFocusedGuidelineKey();
  const versionTarget = useFocusedVersionTarget();
  const [historyOpen, setHistoryOpen] = useState(false);

  /* Guidance for the focused field, authored against the Drafts section of
     the proposal's own template version. */
  const { data: wpTemplateVersionId } = useProposalTemplateVersion(proposalId);
  const { data: blockGuidelines = [] } = useCardGuidelines(
    focusedGuidelineKey && focusedGuidelineKey.startsWith('drafts.') ? focusedGuidelineKey : null,
    'drafts',
    wpTemplateVersionId,
    proposalId,
  );
  const officialGuidelines = blockGuidelines.filter((g) => g.type !== 'sitra_tip');
  const sitraTips = blockGuidelines.filter((g) => g.type === 'sitra_tip');

  
  // Dialog states for editor features
  const [isCitationOpen, setIsCitationOpen] = useState(false);
  const [isCrossRefOpen, setIsCrossRefOpen] = useState(false);
  const [crossRefFilterType, setCrossRefFilterType] = useState<'figure' | 'table' | undefined>(undefined);
  const [isWPRefOpen, setIsWPRefOpen] = useState(false);
  const [isParticipantRefOpen, setIsParticipantRefOpen] = useState(false);
  const [isFigureDialogOpen, setIsFigureDialogOpen] = useState(false);
  const [isTaskRefOpen, setIsTaskRefOpen] = useState(false);
  const [isDeliverableRefOpen, setIsDeliverableRefOpen] = useState(false);
  const [isMilestoneRefOpen, setIsMilestoneRefOpen] = useState(false);
  const [isCaseRefOpen, setIsCaseRefOpen] = useState(false);
  const [figures, setFigures] = useState<any[]>([]);
  const [wpDrafts, setWpDrafts] = useState<any[]>([]);

  // Fetch proposal acronym + segments + has-cases for dropdown
  const { data: proposalMeta } = useQuery({
    queryKey: ['wp-draft-proposal-meta', proposalId],
    queryFn: async () => {
      const [{ data: proposal }, { count }] = await Promise.all([
        supabase.from('proposals').select('acronym, acronym_segments').eq('id', proposalId).maybeSingle(),
        supabase.from('case_drafts').select('id', { count: 'exact', head: true }).eq('proposal_id', proposalId),
      ]);
      const rawSegs = (proposal?.acronym_segments as { text: string; color: string }[] | null) || [];
      const acronym = (proposal?.acronym as string | null) || '';
      // Fallback: if no colours saved but an acronym exists, use a single all-black segment.
      const acronymSegments = rawSegs.length > 0
        ? rawSegs
        : (acronym ? [{ text: acronym, color: '#000000' }] : []);
      return {
        acronymSegments,
        hasCases: (count || 0) > 0,
      };
    },
    enabled: !!proposalId,
  });
  const acronymSegments = proposalMeta?.acronymSegments || [];
  const hasCases = !!proposalMeta?.hasCases;

  // The toolbar acts on whichever LazyRichField last mounted an editor
  // (MethodologyEditorFocusContext). The legacy contentEditable/execCommand
  // selection bookkeeping is gone — TipTap keeps its own selection.
  const { activeEditor } = useMethodologyEditorFocus();
  const activeEditorRef = useRef(activeEditor);
  activeEditorRef.current = activeEditor;

  const getEditor = useCallback(() => {
    const editor = activeEditorRef.current;
    if (!editor || editor.isDestroyed) return null;
    return editor;
  }, []);

  /** Kept for API compatibility with the shared toolbar. */
  const saveSelection = useCallback(() => {}, []);

  /**
   * Clicking a toolbar button blurs the field. Keep the editor mounted while
   * focus sits inside the page toolbar so the command still has a target.
   */
  const shouldStayMounted = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    return !!active?.closest('[data-wp-draft-toolbar]');
  }, []);

  /** Insert a badge/element by handing its markup to TipTap's parser. */
  const insertNodeAtCursor = useCallback((node: Node) => {
    const editor = getEditor();
    if (!editor) {
      toast.error('Click into a text box first, then insert the reference.');
      return;
    }
    const html =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement).outerHTML
        : (node.textContent || '');
    editor.chain().focus().insertContent(html).run();
  }, [getEditor]);
  
  // Table insertion for toolbar (moved to top with other hooks)
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  
  // Proposal-wide references hook
  const { 
    references: proposalReferences, 
    addReference,
    updateReference,
    findExistingReference,
    getNextCitationNumber 
  } = useProposalReferences(proposalId);
  
  // Editor insertion callbacks. Each builds the same badge markup as before and
  // hands it to the focused TipTap editor, which parses it back into the
  // matching reference NODE — so labels resolve live from ids afterwards.
  const insertCitationAtCursor = useCallback((citationNumber: number) => {
    const citationSpan = document.createElement('sup');
    citationSpan.textContent = `${citationNumber}`;
    citationSpan.setAttribute('data-citation', String(citationNumber));
    citationSpan.style.color = 'blue';
    citationSpan.style.cursor = 'pointer';
    insertNodeAtCursor(citationSpan);
    toast.success(`Citation ${citationNumber} inserted`);
  }, [insertNodeAtCursor]);

  const insertCrossRefAtCursor = useCallback((payload: { refText: string; figureId?: string; tableKey?: string; refKind: 'figure' | 'table' }) => {
    const refSpan = document.createElement('span');
    refSpan.textContent = payload.refText;
    refSpan.setAttribute('data-fig-table-ref', '');
    if (payload.figureId) refSpan.setAttribute('data-figure-id', payload.figureId);
    if (payload.tableKey) refSpan.setAttribute('data-table-key', payload.tableKey);
    if (payload.refKind) refSpan.setAttribute('data-ref-kind', payload.refKind);
    refSpan.style.fontWeight = 'bold';
    refSpan.style.fontStyle = 'normal';
    refSpan.style.fontFamily = "'Times New Roman', Times, serif";
    refSpan.style.cursor = 'pointer';
    insertNodeAtCursor(refSpan);
    toast.success('Cross-reference inserted');
  }, [insertNodeAtCursor]);

  const insertWPRefAtCursor = useCallback((wpNumber: number, wpShortName: string, wpColor: string, wpId: string) => {
    const wpSpan = document.createElement('span');
    wpSpan.textContent = `WP${wpNumber}${wpShortName ? `: ${wpShortName}` : ''}`;
    wpSpan.setAttribute('data-wp-reference', '');
    wpSpan.setAttribute('data-wp-number', String(wpNumber));
    wpSpan.setAttribute('data-wp-id', wpId);
    wpSpan.setAttribute('data-wp-color', wpColor);
    wpSpan.setAttribute('data-wp-short-name', wpShortName || '');
    if (wpShortName) wpSpan.setAttribute('data-wp-show-short-name', 'true');
    markBadgeElement(wpSpan, 'wp');
    insertNodeAtCursor(wpSpan);
    toast.success(`WP${wpNumber} reference inserted`);
  }, [insertNodeAtCursor]);

  const insertParticipantRefAtCursor = useCallback((participantNumber: number, shortName: string, participantId: string) => {
    const partSpan = document.createElement('span');
    partSpan.textContent = shortName || 'Partner';
    partSpan.setAttribute('data-participant-reference', '');
    partSpan.setAttribute('data-participant-number', String(participantNumber));
    partSpan.setAttribute('data-participant-id', participantId);
    partSpan.setAttribute('data-participant-short-name', shortName || '');
    markBadgeElement(partSpan, 'participant');
    insertNodeAtCursor(partSpan);
    toast.success(`${shortName} reference inserted`);
  }, [insertNodeAtCursor]);

  const insertFigureAtCursor = useCallback((figure: any) => {
    const refSpan = document.createElement('span');
    refSpan.textContent = `(see ${figure.figure_number})`;
    refSpan.style.color = 'blue';
    refSpan.style.textDecoration = 'underline';
    insertNodeAtCursor(refSpan);
    toast.success('Figure reference inserted');
  }, [insertNodeAtCursor]);

  const insertTaskRefAtCursor = useCallback((task: { id: string; wp_number: number; number: number; title: string; wp_color?: string }) => {
    const span = document.createElement('span');
    span.textContent = `T${task.wp_number}.${task.number}`;
    span.setAttribute('data-task-reference', '');
    span.setAttribute('data-task-id', task.id);
    // Carry the work-package colour on the inserted markup so the mounted
    // editor's node view paints the chip immediately, instead of falling back
    // to black until the field is blurred and re-rendered from resolved data.
    if (task.wp_color) span.setAttribute('data-wp-color', task.wp_color);
    markBadgeElement(span, 'task');
    insertNodeAtCursor(span);
    toast.success(`T${task.wp_number}.${task.number} reference inserted`);
  }, [insertNodeAtCursor]);

  const insertDeliverableRefAtCursor = useCallback((del: { id: string; number: string; name: string; wp_color?: string }) => {
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-deliverable-reference', '');
    wrapper.setAttribute('data-deliverable-id', del.id);
    wrapper.setAttribute('data-deliverable-label', String(del.number));
    if (del.wp_color) wrapper.setAttribute('data-wp-color', del.wp_color);
    wrapper.textContent = String(del.number);
    markBadgeTree(wrapper, 'deliverable');
    insertNodeAtCursor(wrapper);
    toast.success(`${del.number} reference inserted`);
  }, [insertNodeAtCursor]);

  const insertMilestoneRefAtCursor = useCallback((ms: { id: string; number: number; name: string }) => {
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-milestone-reference', '');
    wrapper.setAttribute('data-milestone-id', ms.id);
    wrapper.setAttribute('data-milestone-number', String(ms.number));
    wrapper.textContent = `MS${Number(ms.number) || 0}`;
    markBadgeTree(wrapper, 'milestone');
    insertNodeAtCursor(wrapper);
    toast.success(`MS${ms.number} reference inserted`);
  }, [insertNodeAtCursor]);

  const insertAcronymRefAtCursor = useCallback(() => {
    if (!acronymSegments || acronymSegments.length === 0) return;
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-acronym-reference', '');
    wrapper.setAttribute('data-acronym-segments', JSON.stringify(acronymSegments));
    acronymSegments.forEach((seg) => {
      const s = document.createElement('span');
      s.style.color = seg.color;
      s.textContent = seg.text;
      wrapper.appendChild(s);
    });
    markBadgeTree(wrapper, 'acronym');
    insertNodeAtCursor(wrapper);
    toast.success('Acronym reference inserted');
  }, [acronymSegments, insertNodeAtCursor]);

  const insertCaseRefAtCursor = useCallback((caseItem: { id: string; number: number; short_name: string | null; case_type: string }) => {
    const prefix = getCaseTypePrefix(caseItem.case_type);
    const label = prefix ? `${prefix}${caseItem.number}` : (caseItem.short_name || String(caseItem.number));
    const span = document.createElement('span');
    span.textContent = label;
    span.setAttribute('data-case-reference', '');
    span.setAttribute('data-case-id', caseItem.id);
    span.setAttribute('data-case-number', String(caseItem.number));
    span.setAttribute('data-case-type', caseItem.case_type);
    if (caseItem.short_name) span.setAttribute('data-case-short-name', caseItem.short_name);
    markBadgeElement(span, 'case');
    insertNodeAtCursor(span);
    toast.success(`${caseWord(caseTypes, { capitalize: true })} reference inserted`);
  }, [insertNodeAtCursor, caseTypes]);



  // Fetch participants, figures, and WP drafts for the proposal
  useEffect(() => {
    const fetchParticipants = async () => {
      const { data } = await supabase
        .from('participants')
        .select('id, organisation_short_name, organisation_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      
      if (data) {
        setParticipants(data);
      }
    };

    const fetchFigures = async () => {
      const { data } = await supabase
        .from('figures')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      
      if (data) {
        setFigures(data);
      }
    };

    const fetchWpDrafts = async () => {
      const { data } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, title, color')
        .eq('proposal_id', proposalId)
        .order('number');
      
      if (data) {
        setWpDrafts(data);
      }
    };

    fetchParticipants();
    fetchFigures();
    fetchWpDrafts();
  }, [proposalId]);

  // Recolor existing task/deliverable cross-ref spans with correct WP colors
  useEffect(() => {
    if (!wpDrafts.length) return;

    const wpColorByNumber = new Map<number, string>();
    for (const wp of wpDrafts) {
      wpColorByNumber.set(wp.number, wp.color || '#73C92D');
    }

    const recolorInContainer = async () => {
      // Build taskId → wpColor map (live from source: wp_draft_tasks)
      const { data: tasks } = await supabase
        .from('wp_draft_tasks')
        .select('id, wp_draft_id')
        .in('wp_draft_id', wpDrafts.map(w => w.id));

      const taskColorMap = new Map<string, string>();
      if (tasks) {
        for (const t of tasks) {
          const wp = wpDrafts.find(w => w.id === t.wp_draft_id);
          if (wp) taskColorMap.set(t.id, wp.color || '#73C92D');
        }
      }

      // Build deliverableId → wpColor map (live from source: wp_draft_deliverables)
      const { data: deliverables } = await supabase
        .from('wp_draft_deliverables')
        .select('id, wp_draft_id')
        .in('wp_draft_id', wpDrafts.map(w => w.id));

      const delColorMap = new Map<string, string>();
      if (deliverables) {
        for (const d of deliverables) {
          const wp = wpDrafts.find(w => w.id === d.wp_draft_id);
          if (wp) delColorMap.set(d.id, wp.color || '#73C92D');
        }
      }

      // Walk DOM and recolor task spans
      document.querySelectorAll('[data-task-id]').forEach(el => {
        const span = el as HTMLElement;
        const taskId = span.getAttribute('data-task-id');
        if (!taskId) return;
        const color = taskColorMap.get(taskId);
        if (color) {
          span.style.borderColor = color;
          span.style.color = color;
        }
      });

      // Walk DOM and recolor deliverable spans
      document.querySelectorAll('[data-deliverable-id]').forEach(el => {
        const wrapper = el as HTMLElement;
        const delId = wrapper.getAttribute('data-deliverable-id');
        if (!delId) return;
        const color = delColorMap.get(delId);
        if (!color) return;
        // Update SVG stroke
        const path = wrapper.querySelector('path');
        if (path) path.setAttribute('stroke', color);
        // Update text color
        const textSpan = wrapper.querySelector('span');
        if (textSpan) (textSpan as HTMLElement).style.color = color;
      });
    };

    // Delay slightly to let editors render their HTML
    const timer = setTimeout(recolorInContainer, 300);
    return () => clearTimeout(timer);
  }, [wpDrafts, proposalId]);


  const handleLockedEditAttempt = useCallback(() => {
    if (isLocked && isCoordinator && !lockWarningDismissed) {
      setShowLockWarning(true);
    }
  }, [isLocked, isCoordinator, lockWarningDismissed]);

  /**
   * Page-wide find and replace over this work package's stored text: the WP
   * narrative fields plus every task and deliverable title and description,
   * including rows whose editors have never mounted. Writes go through
   * `save_versioned_row`, the same version-checked RPC ordinary editing uses.
   */
  const searchFieldsForPage = useCallback((): SearchableField[] => {
    if (!wpDraft) return [];
    const out: SearchableField[] = [];
    const wpLabel = `WP${wpDraft.number}`;
    const editable = canEdit && !isLocked;

    const push = (
      table: 'wp_drafts' | 'wp_draft_tasks' | 'wp_draft_deliverables',
      rowId: string,
      version: number,
      column: string,
      label: string,
      value: string | null,
      format: 'html' | 'text',
      anchorId?: string,
    ) => {
      if (!value) return;
      out.push({
        id: `${table}:${rowId}:${column}`,
        label,
        groupId: rowId,
        groupLabel: wpLabel,
        format,
        value,
        readOnly: !editable,
        reveal: anchorId ? () => jumpToElementId(anchorId) : undefined,
        save: !editable
          ? undefined
          : async (next): Promise<FieldSaveOutcome> => {
              const res = await saveVersionedRow(table, rowId, { [column]: next }, version);
              if (res.conflict) return { ok: false, conflict: true };
              if (!res.ok) return { ok: false, conflict: false, error: res.error };
              await refetchDraft();
              return { ok: true };
            },
      });
    };

    push('wp_drafts', wpDraft.id, wpDraft.version, 'title', `${wpLabel} › title`, wpDraft.title, 'text');
    push('wp_drafts', wpDraft.id, wpDraft.version, 'short_name', `${wpLabel} › short name`, wpDraft.short_name, 'text');
    push('wp_drafts', wpDraft.id, wpDraft.version, 'objectives', `${wpLabel} › objectives`, wpDraft.objectives, 'html');
    push(
      'wp_drafts',
      wpDraft.id,
      wpDraft.version,
      'description_before_tasks',
      `${wpLabel} › description`,
      wpDraft.description_before_tasks,
      'html',
    );

    for (const task of wpDraft.tasks ?? []) {
      const label = `T${wpDraft.number}.${task.number}`;
      const anchor = `wp-task-row-${task.id}`;
      push('wp_draft_tasks', task.id, task.version, 'title', `${label} › title`, task.title, 'text', anchor);
      push('wp_draft_tasks', task.id, task.version, 'description', `${label} › description`, task.description, 'html', anchor);
    }
    for (const d of wpDraft.deliverables ?? []) {
      const label = `D${wpDraft.number}.${d.number}`;
      push('wp_draft_deliverables', d.id, d.version, 'title', `${label} › title`, d.title, 'text');
      push('wp_draft_deliverables', d.id, d.version, 'description', `${label} › description`, d.description, 'html');
    }
    return out;
  }, [wpDraft, canEdit, isLocked, refetchDraft]);

  usePageSearchSource('wp-draft', 'Work package', searchFieldsForPage);
  const pageSearch = usePageSearch();


  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!wpDraft) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Work package not found
      </div>
    );
  }

  const readOnly = !canEdit;

  const leadParticipant = participants.find(p => p.id === wpDraft.lead_participant_id);

  // Toolbar commands now run against the focused TipTap editor instead of
  // document.execCommand, which no longer applies to these fields.
  const execCommand = (command: string, cmdValue?: string) => {
    const editor = getEditor();
    if (!editor) return;
    const chain = editor.chain().focus();
    switch (command) {
      case 'bold': chain.toggleBold().run(); break;
      case 'italic': chain.toggleItalic().run(); break;
      case 'underline': chain.toggleUnderline().run(); break;
      case 'strikeThrough': chain.toggleStrike().run(); break;
      case 'superscript': chain.toggleSuperscript().run(); break;
      case 'subscript': chain.toggleSubscript().run(); break;
      case 'insertUnorderedList': chain.toggleBulletList().run(); break;
      case 'insertOrderedList': chain.toggleOrderedList().run(); break;
      case 'justifyLeft': chain.setTextAlign('left').run(); break;
      case 'justifyCenter': chain.setTextAlign('center').run(); break;
      case 'justifyRight': chain.setTextAlign('right').run(); break;
      case 'justifyFull': chain.setTextAlign('justify').run(); break;
      case 'foreColor': chain.setColor(cmdValue || '#000000').run(); break;
      case 'removeFormat': chain.unsetAllMarks().run(); break;
      case 'insertHTML': chain.insertContent(cmdValue || '').run(); break;
      default: break;
    }
  };

  const insertTable = (rows: number, cols: number) => {
    const editor = getEditor();
    if (!editor) {
      toast.error('Click into a text box first, then insert the table.');
      return;
    }
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    setTablePopoverOpen(false);
  };


  return (
    <div className="h-full">
      {/* One 21 cm column — 18 cm of text plus 1.5 cm margins each side —
          matched exactly to the Part B board (max-w-[calc(21cm+3rem)] with
          p-6), which is the reference because it matches the A4 output. */}
      <div className="mx-auto w-full max-w-[calc(21cm+3rem)] space-y-3 p-6">


        {/* Numbering is maintained by the database resequencing triggers. */}


        {/* Lock warning banner */}
        {isLocked && !canEdit && (

          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm">
            <Lock className="w-4 h-4 text-destructive shrink-0" />
            <span>This work package has been locked by <strong>{lockerName}</strong>. Editing is disabled.</span>
            {isCoordinator && (
              <Button variant="outline" size="sm" className="ml-auto shrink-0 h-7 text-xs" onClick={() => setShowLockWarning(true)}>
                Edit anyway
              </Button>
            )}
          </div>
        )}

        {/* Lock warning dialog for coordinators */}
        <Dialog open={showLockWarning} onOpenChange={setShowLockWarning}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-destructive" />
                Locked draft
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This WP has been locked by <strong>{lockerName}</strong>. As you are a coordinator, you can still edit it, but doing so may result in differences between the draft and Part B. It is recommended to therefore work on Part B instead.
            </p>
            <p className="text-sm font-medium">Do you wish to continue editing the draft?</p>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setShowLockWarning(false)}>Cancel</Button>
              <Button size="sm" onClick={() => { setLockWarningDismissed(true); setShowLockWarning(false); }}>OK</Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* Top Toolbar Row - Guidelines + Formatting (shared component) */}
        {/* The toolbar itself is `sticky top-0`. A plain wrapper that hugs its
            height gives it no room to travel, so the wrapper is
            `display: contents`: the data attribute survives for focus checks
            while the sticky box measures against the page column. */}
        <PageFindReplacePanel />
        <div data-wp-draft-toolbar="1" className="contents">
        <EditorToolbars
          proposalId={proposalId}
          save={{ saving, lastSaved, onSaveNow: () => {} }}
          topBar={{ onFindReplace: pageSearch ? () => pageSearch.setOpen(true) : undefined }}
          fieldBar={{
            onOpenGuidelines: () => setGuidelinesDialogOpen(true),
            /* The toolbar reads the nearest `data-version-target` marker, so
               history works on every WP field without threading a target. */
            onOpenVersionHistory: versionTarget ? () => setHistoryOpen(true) : undefined,
          }}
          formatting={{
            proposalId,
            canManageCustomColors: isCoordinator,
            isReadOnly: readOnly,
            onOpenFigureDialog: () => setIsFigureDialogOpen(true),
            onOpenCitationDialog: () => setIsCitationOpen(true),
            crossRefDropdown: (
              <CrossRefMenu
                disabled={readOnly}
                onSaveSelection={saveSelection}
                items={
                  <>
            <>
              <DropdownMenuItem onClick={() => { setCrossRefFilterType('figure'); setIsCrossRefOpen(true); }} className="flex items-center gap-2">
                <span className="w-16 flex justify-start shrink-0"><ImageLucide className="w-3.5 h-3.5 text-foreground" /></span>
                <span>Figure number</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setCrossRefFilterType('table'); setIsCrossRefOpen(true); }} className="flex items-center gap-2">
                <span className="w-16 flex justify-start shrink-0"><Table2 className="w-3.5 h-3.5 text-foreground" /></span>
                <span>Table number</span>
              </DropdownMenuItem>
              {acronymSegments && acronymSegments.length > 0 && (
                <DropdownMenuItem onClick={insertAcronymRefAtCursor} className="flex items-center gap-2">
                  <span className="w-16 flex justify-start shrink-0">
                    <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: '9px', whiteSpace: 'nowrap' }}>
                      {acronymSegments.map((seg, i) => <span key={i} style={{ color: seg.color }}>{seg.text}</span>)}
                    </span>
                  </span>
                  <span>Acronym</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setIsWPRefOpen(true)} className="flex items-center gap-2">
                <span className="w-16 flex justify-start shrink-0">
                  <span style={{ display: 'inline-block', width: '22px', height: '14px', backgroundColor: '#73C92D', border: '1.5px solid #73C92D', borderRadius: '9999px' }} />
                </span>
                <span>Work package</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsTaskRefOpen(true)} className="flex items-center gap-2">
                <span className="w-16 flex justify-start shrink-0">
                  <span style={{ display: 'inline-block', width: '22px', height: '14px', borderRadius: '9999px', border: '1.5px solid #73C92D', background: '#ffffff' }} />
                </span>
                <span>Task</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsDeliverableRefOpen(true)} className="flex items-center gap-2">
                <span className="w-16 flex justify-start shrink-0">
                  <span style={{ display: 'inline-block', width: '22px', height: '14px', background: '#73C92D', clipPath: 'polygon(0% 0%, calc(100% - 6px) 0%, 100% 50%, calc(100% - 6px) 100%, 0% 100%)', position: 'relative' }}>
                    <span style={{ position: 'absolute', inset: '1.5px', right: '2px', background: '#ffffff', clipPath: 'polygon(0% 0%, calc(100% - 5px) 0%, 100% 50%, calc(100% - 5px) 100%, 0% 100%)' }} />
                  </span>
                </span>
                <span>Deliverable</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsMilestoneRefOpen(true)} className="flex items-center gap-2">
                <span className="w-16 flex justify-start shrink-0">
                  <span style={{ display: 'inline-block', width: '16px', height: '16px', background: '#000', clipPath: 'polygon(100% 0%, 0% 50%, 100% 100%)', margin: '-1px 0' }} />
                </span>
                <span>Milestone</span>
              </DropdownMenuItem>
              {hasCases && (
                <DropdownMenuItem onClick={() => setIsCaseRefOpen(true)} className="flex items-center gap-2">
                  <span className="w-16 flex justify-start shrink-0">
                    <span style={{ display: 'inline-block', width: '22px', height: '14px', border: '1.5px solid #000000', borderRadius: '9999px', background: '#ffffff' }} />
                  </span>
                  <span>{caseWord(caseTypes, { capitalize: true })}</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setIsParticipantRefOpen(true)} className="flex items-center gap-2">
                <span className="w-16 flex justify-start shrink-0">
                  <span style={{ display: 'inline-block', width: '22px', height: '14px', backgroundColor: '#000000', border: '1.5px solid #000000', borderRadius: '9999px' }} />
                </span>
                <span>Participant</span>
              </DropdownMenuItem>
            </>
                  </>
                }
              />
            ),
          }}
        />
            <InsertTDMSReferenceDropdowns
              proposalId={proposalId}
              disabled={readOnly}
              onInsertTask={insertTaskRefAtCursor}
              onInsertDeliverable={insertDeliverableRefAtCursor}
              onInsertMilestone={insertMilestoneRefAtCursor}
              dialogsOnly
              openTask={isTaskRefOpen}
              onOpenTaskChange={setIsTaskRefOpen}
              openDeliverable={isDeliverableRefOpen}
              onOpenDeliverableChange={setIsDeliverableRefOpen}
              openMilestone={isMilestoneRefOpen}
              onOpenMilestoneChange={setIsMilestoneRefOpen}
            />
        </div>



        {/* ── BLOCK 1: WP header ──
            Read-only projection of the WP manager row: the title is owned
            there, so it is displayed (and commentable) but never edited here.
            The leader is a badge only, and the duration is derived from the
            earliest task start and the latest task end. */}
        <div className="space-y-2 -mx-2">
          {/* Full-width pill badge: WPX: Short Name – Title */}
          <div
            className="rounded-full flex items-baseline gap-0"
            data-comment-target={`wp_draft:${wpDraft.id}:title`}
            style={{
              backgroundColor: effectiveColor,
              color: '#FFFFFF',
              border: `1.5px solid ${effectiveColor}`,
              padding: '0px 6px',
              lineHeight: 1,
            }}
          >
            <span
              className="font-bold whitespace-nowrap"
              style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt' }}
            >
              WP{wpDraft.number}:&nbsp;{wpDraft.short_name?.trim() || ''}
              {Boolean(wpDraft.short_name?.trim()) && Boolean(wpDraft.title?.trim()) ? ' – ' : ''}
              {wpDraft.title?.trim() || ''}
            </span>
          </div>

          {/* Metadata row: the leader badge and the derived duration carry no
              headings — the badge and the month range read for themselves. */}
          <div className="flex items-center justify-between px-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {(() => {
                const leader = participants.find((p) => p.id === wpDraft.lead_participant_id);
                if (!leader) {
                  return <span className="text-draft text-muted-foreground italic">Leader not set</span>;
                }
                return (
                  <span
                    className="inline-flex items-center rounded-full font-bold whitespace-nowrap"
                    style={{ backgroundColor: '#000000', color: '#FFFFFF', border: '1.5px solid #000000', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, fontStyle: 'normal', lineHeight: 1, verticalAlign: 'baseline', padding: '0px 5px', height: '17px' }}
                  >
                    <Crown className="w-3 h-3 mr-1 text-white fill-white" />
                    {leader.participant_number}. {leader.organisation_short_name || leader.organisation_name}
                  </span>
                );
              })()}
            </div>
            {/* Auto-calculated duration from tasks (uses whichever tasks have durations) */}
            {(() => {
              const tasks = wpDraft.tasks || [];
              const taskStartMonths = tasks.filter(t => t.start_month != null).map(t => t.start_month!);
              const taskEndMonths = tasks.filter(t => t.end_month != null).map(t => t.end_month!);
              const allMonths = [...taskStartMonths, ...taskEndMonths];

              if (allMonths.length > 0) {
                const startMonth = Math.min(...allMonths);
                const endMonth = Math.max(...allMonths);
                const formatMonth = (m: number) => `M${m.toString().padStart(2, '0')}`;
                return (
                  <span className="text-draft font-medium">
                    {formatMonth(startMonth)}–{formatMonth(endMonth)}
                  </span>
                );
              }
              return <span className="text-draft text-muted-foreground italic">—</span>;
            })()}
          </div>

        </div>


        {/* Version history for whichever WP field owns the toolbar. */}
        {versionTarget && (
          <CardFieldHistoryDialog
            proposalId={proposalId}
            fieldId={versionTarget.targetId}
            textBox={versionTarget.textBox}
            targetType={versionTarget.targetType}
            fieldLabel={versionTarget.label}
            boxLabelOverride={versionTarget.label}
            isOpen={historyOpen}
            canEdit={canEdit}
            onClose={() => setHistoryOpen(false)}
          />
        )}

        {/* Guidelines Dialog */}
        <Dialog open={guidelinesDialogOpen} onOpenChange={setGuidelinesDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw]">
            <DialogHeader>
              <DialogTitle>
                {GUIDELINE_TITLES[focusedGuidelineKey ?? ''] ??
                  `Guidelines for WP${wpDraft.number}: ${wpDraft.title || wpDraft.short_name || 'Work package'}`}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[75vh] pr-4">
              <div className="space-y-4">
                {/* Everything shown here is authored in the backend under
                    Sections & Guidelines → Drafts, against this proposal's own
                    template version. */}
                {officialGuidelines.length > 0 && (
                  <div className="rounded-lg border-2 border-blue-500 bg-blue-50/50 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <BookOpen className="h-5 w-5 flex-shrink-0 text-blue-500" />
                      <span className="text-sm font-bold text-blue-600">
                        Official guidelines from the European Commission
                      </span>
                    </div>
                    <div className="space-y-4">
                      {officialGuidelines.map((g) => (
                        <div key={g.id}>
                          {g.title && (
                            <h4 className="mb-2 font-semibold text-blue-600">{g.title}</h4>
                          )}
                          <div
                            className="text-sm text-muted-foreground [&_a]:underline [&_div]:mt-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(g.content) }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sitraTips.length > 0 && (
                  <div className="rounded-lg border-2 border-gray-800 bg-gray-50/50 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 flex-shrink-0 text-gray-800" />
                      <span className="text-sm font-bold text-gray-900">Sitra&rsquo;s tips</span>
                    </div>
                    <div className="space-y-4">
                      {sitraTips.map((tip, index) => (
                        <div key={tip.id}>
                          {tip.title && (
                            <h4 className="mb-2 font-semibold text-gray-900">{tip.title}</h4>
                          )}
                          <div
                            className="text-sm text-muted-foreground [&_a]:underline [&_div]:mt-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(tip.content) }}
                          />
                          {index < sitraTips.length - 1 && (
                            <div className="mt-4 border-t border-current/10" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {blockGuidelines.length === 0 && (
                  <p className="text-sm italic text-muted-foreground">
                    {focusedGuidelineKey
                      ? 'No guidance has been authored for this field yet.'
                      : 'Place the cursor in a field to see the guidance for it.'}
                  </p>
                )}
              </div>

            </ScrollArea>
          </DialogContent>
        </Dialog>


        {/* WP Table (Objectives & Tasks) */}
        <WPTableSection
          wpNumber={wpDraft.number}
          wpColor={effectiveColor}
          objectives={wpDraft.objectives}
          descriptionBeforeTasks={wpDraft.description_before_tasks}
          introVisible={wpDraft.intro_visible !== false}
          onIntroVisibleChange={(visible) => updateField('intro_visible' as never, visible as never)}
          onIntroPresenceChange={(present) =>
            updateField('description_before_tasks', present ? '' : (null as never))
          }
          onIntroDelete={binIntroField}
          onTasksReorder={reorderTasks}
          onRefetch={refetchDraft}
          tasks={wpDraft.tasks || []}
          participants={participants}
          onObjectivesChange={(value) => updateField('objectives', value)}
          onDescriptionBeforeTasksChange={(value) => updateField('description_before_tasks', value)}
          onTaskUpdate={updateTask}
          onTaskAdd={addTask}
          onTaskDelete={deleteTask}
          onTaskParticipantsChange={setTaskParticipants}
          onTaskMove={moveTaskToWP}
          readOnly={readOnly}
          projectDuration={projectDuration}
          allWpDrafts={wpDrafts}
          currentWpDraftId={wpDraft.id}
          proposalId={proposalId}
          wpDraftId={wpDraft.id}
          shouldStayMounted={shouldStayMounted}
        />


        {/* Deliverables */}
        <div data-guideline-key="wp.deliverables">
        <WPDeliverablesTable
          wpDraftId={wpDraft.id}
          wpNumber={wpDraft.number}
          wpColor={wpDraft.color}
          wpTasks={wpDraft.tasks || []}
          deliverables={wpDraft.deliverables || []}
          participants={participants}
          onDeliverableUpdate={updateDeliverable}
          onDeliverableAdd={addDeliverable}
          onDeliverableDelete={deleteDeliverable}
          onDeliverableMove={moveDeliverableToWP}
          readOnly={readOnly}
          projectDuration={projectDuration}
          allWpDrafts={wpDrafts}
          proposalId={proposalId}
          shouldStayMounted={shouldStayMounted}
        />
        </div>





      </div>
      
      {/* Citation Dialog */}
      <CitationDialog
        isOpen={isCitationOpen}
        onClose={() => setIsCitationOpen(false)}
        onInsertCitation={(reference, formattedCitation, citationNumber) => {
          insertCitationAtCursor(citationNumber);
        }}
        proposalReferences={proposalReferences}
        isLoadingReferences={false}
        nextCitationNumber={getNextCitationNumber()}
        onUpdateReference={updateReference}
      />
      
      {/* Cross-reference Dialog */}
      <InsertCrossReferenceDialog
        isOpen={isCrossRefOpen}
        onClose={() => { setIsCrossRefOpen(false); setCrossRefFilterType(undefined); }}
        proposalId={proposalId}
        sectionNumber=""
        onInsert={insertCrossRefAtCursor}
        filterType={crossRefFilterType}
      />

      {/* Case Reference Dialog */}
      <InsertCaseReferenceDialog
        open={isCaseRefOpen}
        onOpenChange={setIsCaseRefOpen}
        proposalId={proposalId}
        onSelect={(caseItem) => {
          setIsCaseRefOpen(false);
          setTimeout(() => {
            insertCaseRefAtCursor(caseItem);
          }, 100);
        }}
      />
      
      {/* WP Reference Dialog */}
      <InsertWPReferenceDialog
        open={isWPRefOpen}
        onOpenChange={setIsWPRefOpen}
        proposalId={proposalId}
        onSelect={(wp) => {
          setIsWPRefOpen(false);
          setTimeout(() => {
            insertWPRefAtCursor(wp.number, wp.short_name || '', wp.color || '#3b82f6', wp.id);
          }, 100);
        }}
      />
      
      {/* Participant Reference Dialog */}
      <InsertParticipantReferenceDialog
        open={isParticipantRefOpen}
        onOpenChange={setIsParticipantRefOpen}
        proposalId={proposalId}
        onSelect={(participant) => {
          setIsParticipantRefOpen(false);
          setTimeout(() => {
            insertParticipantRefAtCursor(participant.participantNumber, participant.shortName, participant.id);
          }, 100);
        }}
      />
      
      {/* Figure Dialog */}
      <InsertFigureDialog
        isOpen={isFigureDialogOpen}
        onClose={() => setIsFigureDialogOpen(false)}
        proposalId={proposalId}
        currentSectionId=""
        onInsertFigure={insertFigureAtCursor}
      />
    </div>
  );
}
