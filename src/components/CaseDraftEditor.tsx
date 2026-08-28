import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { saveVersionedRow, saveCaseDraftSubsection, binTargetRow } from '@/lib/versionedSave';
import { useVersionConflict } from '@/hooks/useVersionConflict';
import { markBadgeElement, markBadgeTree } from '@/lib/refBadgeMarkup';
import { fetchCaseSubsections, rowsToSubsectionMap, entryBody, entryHeading } from '@/lib/caseSubsections';

import { EditorToolbars, CrossRefMenu } from '@/components/editor/EditorToolbars';
import { jumpToElementId } from '@/lib/jumpToElement';
import {
  PageSearchProvider,
  usePageSearch,
  usePageSearchSource,
} from '@/lib/findReplace/PageSearchProvider';
import type { FieldSaveOutcome, SearchableField } from '@/lib/findReplace/types';
import { PageFindReplacePanel } from '@/components/findReplace/PageFindReplacePanel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ModuleCommentsProvider,
  ModuleCommentAnchor,
  ModuleCommentButton,
} from '@/components/comments/ModuleComments';
import { RightPanelProvider } from '@/components/panels/RightPanelRegion';
import { caseTarget, caseDraftSectionId } from '@/lib/moduleCommentTargets';
import { CASE_DRAFT_FIELD_EXTENSIONS } from '@/components/cases/caseDraftFieldExtensions';
import {
  MethodologyEditorFocusProvider,
  useMethodologyEditorFocus,
} from '@/components/MethodologyEditorFocusContext';

import { SitraTipsBox } from '@/components/SitraTipsBox';
import { BookOpen, Lock, Image as ImageLucide, Table2, Lightbulb, Plus, Recycle, GripVertical, Crown, Eye, EyeOff, Trash2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { CardLockProvider, useCardLocks } from '@/hooks/useCardLocks';
import { LockTimeoutWarning } from '@/components/cards/LockTimeoutWarning';
import { LockedWPRichField } from '@/components/wp/LockedWPRichField';
import { CollapseChevron } from '@/components/cards/CollapseChevron';
import {
  WP_BLOCK_FRAME,
  WP_BLOCK_HEADER,
  WP_CHEVRON_SIZE,
  WP_CONTROL_STACK,
  WP_DOC_FONT,
  WP_TITLE_INDENT,
} from '@/lib/wpBlockChrome';
import { caseSubsectionCollapseKey } from '@/lib/wpCollapseKeys';
import { useKeyedCollapse } from '@/hooks/useKeyedCollapse';
import { WPBinDialog, useWPBinCount } from '@/components/wp/WPBinDialog';
import { CardFieldHistoryDialog } from '@/components/cards/CardFieldHistoryDialog';
import { useFocusedVersionTarget, versionTargetAttr } from '@/hooks/useFocusedVersionTarget';
import { useFocusedGuidelineKey } from '@/hooks/useFocusedGuidelineKey';
import { useCardGuidelines } from '@/hooks/useCardGuidelines';
import { useProposalTemplateVersion } from '@/hooks/useProposalTemplateVersion';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { InsertCrossReferenceDialog } from '@/components/InsertCrossReferenceDialog';
import { InsertWPReferenceDialog } from '@/components/InsertWPReferenceDialog';
import { InsertParticipantReferenceDialog } from '@/components/InsertParticipantReferenceDialog';
import { InsertCaseReferenceDialog } from '@/components/InsertCaseReferenceDialog';
import { InsertTDMSReferenceDropdowns } from '@/components/InsertTDMSReferenceDropdowns';
import { CitationDialog } from '@/components/CitationDialog';
import { InsertFigureDialog } from '@/components/InsertFigureDialog';
import { useProposalReferences } from '@/hooks/useProposalReferences';
import { useCaseSubsectionTemplates } from '@/hooks/useCaseSubsectionTemplates';
import { toast } from 'sonner';
import type { ParticipantSummary } from '@/types/proposal';

import {
  getCaseTypeLabel,
  getCaseTypePrefix as getCasePrefix,
  buildCaseLabel,
  caseWord,
} from '@/lib/caseTypeLabels';
import { useProposalCaseTypes } from '@/hooks/useProposalCaseTypes';
import { stripWordHtml } from '@/lib/stripWordHtml';



/* Case guidance is DATA, not code: the shared default lives in
   `case_guideline_defaults` and a proposal may override it on its own
   subsection row. The old hardcoded Sitra tips were removed with prompt 109. */

// Subsection templates are now project-wide; loaded via useCaseSubsectionTemplates.
// Legacy per-case heading_*/guideline_* fields are no longer read or written.

interface CaseDraftEditorProps {
  caseId: string;
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
}

export function CaseDraftEditor(props: CaseDraftEditorProps) {
  return (
    <MethodologyEditorFocusProvider>
      {/* Case drafts are not a template section, so lock rows carry no section
          id and streaming uses a case-wide channel — the same arrangement WP
          drafts use. */}
      <RightPanelProvider proposalId={props.proposalId}>
      <CardLockProvider
        proposalId={props.proposalId}
        sectionId={null}
        channelKey={`case-draft:${props.caseId}`}
        enabled
      >
      <PageSearchProvider>
      {/* Module-anchored comments; a case draft is its own comment surface. */}
      <ModuleCommentsProvider
        proposalId={props.proposalId}
        sectionId={caseDraftSectionId(props.caseId)}
        canEdit={props.canEdit}
        isCoordinator={props.isCoordinator}
      >
        <CaseDraftEditorInner {...props} />
        <CaseLockTimeoutWarning />
      </ModuleCommentsProvider>
      </PageSearchProvider>
      </CardLockProvider>
      </RightPanelProvider>
    </MethodologyEditorFocusProvider>
  );
}

/** Idle-timeout warning for whichever case field this client currently holds. */
function CaseLockTimeoutWarning() {
  const { warning } = useCardLocks();
  return warning ? <LockTimeoutWarning secondsLeft={warning.secondsLeft} /> : null;
}

function CaseDraftEditorInner({ caseId, proposalId, canEdit: canEditProp, isCoordinator }: CaseDraftEditorProps) {
  const queryClient = useQueryClient();
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lockWarningDismissed, setLockWarningDismissed] = useState(false);
  const [showLockWarning, setShowLockWarning] = useState(false);

  // Cross-reference dialog states
  const [isCrossRefOpen, setIsCrossRefOpen] = useState(false);
  const [crossRefFilterType, setCrossRefFilterType] = useState<'figure' | 'table' | undefined>(undefined);
  const [isWPRefOpen, setIsWPRefOpen] = useState(false);
  const [isParticipantRefOpen, setIsParticipantRefOpen] = useState(false);
  const [isTaskRefOpen, setIsTaskRefOpen] = useState(false);
  const [isDeliverableRefOpen, setIsDeliverableRefOpen] = useState(false);
  const [isMilestoneRefOpen, setIsMilestoneRefOpen] = useState(false);
  const [isCaseRefOpen, setIsCaseRefOpen] = useState(false);
  const [isCitationOpen, setIsCitationOpen] = useState(false);
  const [isFigureDialogOpen, setIsFigureDialogOpen] = useState(false);

  // Proposal-wide references hook (for citations)
  const {
    references: proposalReferences,
    updateReference,
    getNextCitationNumber,
  } = useProposalReferences(proposalId);

  // Proposal acronym + has-cases for dropdown
  const { data: proposalMeta } = useQuery({
    queryKey: ['case-draft-proposal-meta', proposalId],
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
  const { data: caseTypes = [] } = useProposalCaseTypes(proposalId);


  // The toolbar acts on whichever LazyRichField subsection last mounted an
  // editor (MethodologyEditorFocusContext). Everything below routes through
  // that instance; the legacy contentEditable/execCommand paths are gone.
  const { activeEditor } = useMethodologyEditorFocus();
  const activeEditorRef = useRef(activeEditor);
  activeEditorRef.current = activeEditor;

  const getEditor = useCallback(() => {
    const editor = activeEditorRef.current;
    if (!editor || editor.isDestroyed) return null;
    return editor;
  }, []);

  /** Kept for API compatibility with the toolbar — TipTap keeps its own selection. */
  const saveSelection = useCallback(() => {}, []);

  // Any open insert dialog / picker must keep the focused editor mounted so
  // the insertion has somewhere to land. Read through a ref: the LazyRichField
  // focus-out listener is attached once and would otherwise see stale state.
  const dialogOpenRef = useRef(false);
  dialogOpenRef.current =
    isCrossRefOpen || isWPRefOpen || isParticipantRefOpen || isTaskRefOpen ||
    isDeliverableRefOpen || isMilestoneRefOpen || isCaseRefOpen || isCitationOpen ||
    isFigureDialogOpen || tablePopoverOpen;
  const shouldStayMounted = useCallback(() => dialogOpenRef.current, []);


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


  const insertCrossRefAtCursor = useCallback((payload: { refText: string; figureId?: string; tableKey?: string; refKind: 'figure' | 'table' }) => {
    const span = document.createElement('span');
    span.textContent = payload.refText;
    span.setAttribute('data-fig-table-ref', '');
    if (payload.figureId) span.setAttribute('data-figure-id', payload.figureId);
    if (payload.tableKey) span.setAttribute('data-table-key', payload.tableKey);
    span.setAttribute('data-ref-kind', payload.refKind);
    Object.assign(span.style, { fontWeight: 'bold', fontStyle: 'normal', fontFamily: "'Times New Roman', Times, serif", cursor: 'pointer' });
    insertNodeAtCursor(span);
    toast.success('Cross-reference inserted');
  }, [insertNodeAtCursor]);

  const insertWPRefAtCursor = useCallback((wpNumber: number, wpShortName: string, wpColor: string, wpId: string) => {
    const span = document.createElement('span');
    span.textContent = `WP${wpNumber}${wpShortName ? `: ${wpShortName}` : ''}`;
    span.setAttribute('data-wp-reference', '');
    span.setAttribute('data-wp-number', String(wpNumber));
    span.setAttribute('data-wp-id', wpId);
    span.setAttribute('data-wp-color', wpColor);
    span.setAttribute('data-wp-short-name', wpShortName || '');
    markBadgeElement(span, 'wp');
    Object.assign(span.style, {
      backgroundColor: wpColor, color: '#ffffff', border: `1.5px solid ${wpColor}`,
      padding: '0px 5px', borderRadius: '9999px', fontFamily: "'Times New Roman', Times, serif",
      fontWeight: '700', fontSize: '11pt', lineHeight: '1', verticalAlign: 'baseline',
      display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', userSelect: 'none',
    });
    insertNodeAtCursor(span);
    toast.success(`WP${wpNumber} reference inserted`);
  }, [insertNodeAtCursor]);

  const insertParticipantRefAtCursor = useCallback((participantNumber: number, shortName: string, participantId: string) => {
    const span = document.createElement('span');
    span.textContent = shortName || 'Partner';
    span.setAttribute('data-participant-reference', '');
    span.setAttribute('data-participant-number', String(participantNumber));
    span.setAttribute('data-participant-id', participantId);
    span.setAttribute('data-participant-short-name', shortName || '');
    markBadgeElement(span, 'participant');
    Object.assign(span.style, {
      backgroundColor: '#000000', color: '#ffffff', border: '1.5px solid #000000',
      padding: '0px 5px', borderRadius: '9999px', fontFamily: "'Times New Roman', Times, serif",
      fontWeight: '700', fontSize: '11pt', lineHeight: '1',
      verticalAlign: 'baseline', display: 'inline-flex', alignItems: 'center',
      whiteSpace: 'nowrap', userSelect: 'none',
    });
    span.style.setProperty('font-style', 'normal', 'important');
    insertNodeAtCursor(span);
    toast.success(`${shortName} reference inserted`);
  }, [insertNodeAtCursor]);

  const insertTaskRefAtCursor = useCallback((task: { id: string; wp_number: number; number: number; title: string; wp_color?: string }) => {
    const color = task.wp_color || '#73C92D';
    const span = document.createElement('span');
    span.textContent = `T${task.wp_number}.${task.number}`;
    span.setAttribute('data-task-reference', '');
    span.setAttribute('data-task-id', task.id);
    span.setAttribute('data-wp-color', color);
    markBadgeElement(span, 'task');
    Object.assign(span.style, { display: 'inline-flex', alignItems: 'center', height: '17px', padding: '0 4px', borderRadius: '9999px', border: `1.5px solid ${color}`, color, fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: '700', lineHeight: '1', whiteSpace: 'nowrap', verticalAlign: 'baseline', userSelect: 'none' });
    insertNodeAtCursor(span);
    toast.success(`T${task.wp_number}.${task.number} reference inserted`);
  }, [insertNodeAtCursor]);

  const insertDeliverableRefAtCursor = useCallback((del: { id: string; number: string; name: string; wp_color?: string }) => {
    const rawColor = del.wp_color || '#73C92D';
    const color = /^#[0-9a-fA-F]{3,8}$/.test(rawColor) ? rawColor : '#73C92D';
    const label = String(del.number).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const textWidth = Math.max(36, label.length * 8 + 8);
    const totalWidth = textWidth + 8;
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-deliverable-reference', '');
    wrapper.setAttribute('data-deliverable-id', del.id);
    wrapper.setAttribute('data-deliverable-label', String(del.number));
    wrapper.setAttribute('data-wp-color', color);
    Object.assign(wrapper.style, { display: 'inline-block', verticalAlign: 'baseline', position: 'relative', width: `${totalWidth}px`, height: '17px', userSelect: 'none' });
    wrapper.innerHTML = `<svg width="${totalWidth}" height="17" viewBox="0 0 ${totalWidth} 17" style="position:absolute;top:0;left:0;overflow:visible;"><path d="M 0,0 L ${textWidth},0 L ${totalWidth},8.5 L ${textWidth},17 L 0,17 Z" fill="#ffffff" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg><span style="position:absolute;top:0;left:0;width:${textWidth}px;height:17px;display:flex;align-items:center;justify-content:center;font-family:'Times New Roman',Times,serif;font-size:11pt;font-weight:700;line-height:1;color:${color};white-space:nowrap;">${label}</span>`;
    markBadgeTree(wrapper, 'deliverable');
    insertNodeAtCursor(wrapper);
    toast.success(`${del.number} reference inserted`);
  }, [insertNodeAtCursor]);

  const insertMilestoneRefAtCursor = useCallback((ms: { id: string; number: number; name: string }) => {
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-milestone-reference', '');
    wrapper.setAttribute('data-milestone-id', ms.id);
    wrapper.setAttribute('data-milestone-number', String(ms.number));
    Object.assign(wrapper.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: '#000', color: '#ffffff',
      fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: '700',
      lineHeight: '18px', height: '18px', padding: '0 4px',
      clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
      verticalAlign: 'baseline', whiteSpace: 'nowrap', userSelect: 'none',
    });
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
    Object.assign(wrapper.style, {
      display: 'inline', fontFamily: "'Arial Black', Arial, sans-serif",
      fontWeight: '900', fontSize: 'inherit', whiteSpace: 'nowrap', cursor: 'pointer',
    });
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
    const prefix = getCasePrefix(caseItem.case_type);
    const label = prefix ? `${prefix}${caseItem.number}` : (caseItem.short_name || String(caseItem.number));
    const span = document.createElement('span');
    span.textContent = label;
    span.setAttribute('data-case-reference', '');
    span.setAttribute('data-case-id', caseItem.id);
    span.setAttribute('data-case-number', String(caseItem.number));
    span.setAttribute('data-case-type', caseItem.case_type);
    if (caseItem.short_name) span.setAttribute('data-case-short-name', caseItem.short_name);
    markBadgeElement(span, 'case');
    Object.assign(span.style, {
      display: 'inline-flex', alignItems: 'center', backgroundColor: '#ffffff', color: '#000000',
      border: '1.5px solid #000000', padding: '0 0.4rem', borderRadius: '9999px',
      fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: '700',
      fontStyle: 'normal', lineHeight: '1', whiteSpace: 'nowrap', verticalAlign: 'baseline',
      cursor: 'pointer', userSelect: 'none',
    });
    insertNodeAtCursor(span);
    toast.success(`${caseWord(caseTypes, { capitalize: true })} reference inserted`);
  }, [insertNodeAtCursor, caseTypes]);


  const insertCitationAtCursor = useCallback((citationNumber: number) => {
    const sup = document.createElement('sup');
    sup.textContent = `${citationNumber}`;
    sup.setAttribute('data-citation', String(citationNumber));
    sup.style.color = 'blue';
    sup.style.cursor = 'pointer';
    insertNodeAtCursor(sup);
    toast.success(`Citation ${citationNumber} inserted`);
  }, [insertNodeAtCursor]);

  const insertFigureAtCursor = useCallback((figure: any) => {
    const refSpan = document.createElement('span');
    refSpan.textContent = `(see ${figure.figure_number})`;
    refSpan.style.color = 'blue';
    refSpan.style.textDecoration = 'underline';
    insertNodeAtCursor(refSpan);
    toast.success('Figure reference inserted');
  }, [insertNodeAtCursor]);

  // Scoped TipTap history for the focused subsection editor.
  const handleUndo = useCallback(() => {
    getEditor()?.chain().focus().undo().run();
  }, [getEditor]);
  const handleRedo = useCallback(() => {
    getEditor()?.chain().focus().redo().run();
  }, [getEditor]);





  // Fetch case draft
  const { data: caseDraft, isLoading } = useQuery({
    queryKey: ['case-draft-detail', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_drafts')
        .select('*')
        .eq('id', caseId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  /**
   * Authoritative subsection rows. `case_drafts.subsection_content` remains as
   * a READ-ONLY fallback for a case that has no rows yet (one release only).
   */
  const { data: subsectionRows } = useQuery({
    queryKey: ['case-draft-subsections', caseId],
    queryFn: () => fetchCaseSubsections(caseId),
  });

  const subsectionContent = useMemo<Record<string, any>>(() => {
    if (subsectionRows && subsectionRows.length > 0) return rowsToSubsectionMap(subsectionRows);
    return ((caseDraft as any)?.subsection_content as Record<string, any> | null) || {};
  }, [subsectionRows, caseDraft]);


  // Fetch case type flags (include_number / include_abbreviation / outline_color)
  const { data: caseTypeRow } = useQuery({
    queryKey: ['proposal-case-type', (caseDraft as any)?.case_type_id],
    enabled: !!(caseDraft as any)?.case_type_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_case_types')
        .select('include_number, include_abbreviation, outline_color')
        .eq('id', (caseDraft as any).case_type_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch participants
  const { data: participants = [] } = useQuery({
    queryKey: ['participants-for-case-editor', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, organisation_short_name, organisation_name, participant_number')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return data as ParticipantSummary[];
    },
  });

  // Lock enforcement
  const isLocked = (caseDraft as any)?.is_locked === true;
  const lockedById = (caseDraft as any)?.locked_by as string | null;

  // Reset lock warning dismissal when case changes
  useEffect(() => { setLockWarningDismissed(false); }, [caseId]);

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

  const canEdit = useMemo(() => {
    if (!canEditProp) return false;
    if (!isLocked) return true;
    if (isCoordinator) return lockWarningDismissed;
    return false;
  }, [canEditProp, isLocked, isCoordinator, lockWarningDismissed]);

  // Project-wide subsection templates
  const {
    templates: subsectionTemplates,
    addRow: addSubsection,
    reorder: reorderSubsections,
    updateRow: updateSubsection,
  } = useCaseSubsectionTemplates(proposalId);

  /* Per-user collapse state for the subsection blocks, in the same store WP
     blocks and Part B modules use, so Collapse all behaves identically. */
  const { collapsedKeys, setCollapsed } = useKeyedCollapse(proposalId);
  const toggleCollapsed = useCallback(
    (key: string) => setCollapsed.mutate({ keys: [key], collapsed: !collapsedKeys.has(key) }),
    [collapsedKeys, setCollapsed],
  );
  const allCollapseKeys = useMemo(
    () => subsectionTemplates.map((sub) => caseSubsectionCollapseKey(caseId, sub.key)),
    [subsectionTemplates, caseId],
  );
  const allCollapsed =
    allCollapseKeys.length > 0 && allCollapseKeys.every((k) => collapsedKeys.has(k));

  // Version history for whichever field owns the toolbar (data-version-target).
  const versionTarget = useFocusedVersionTarget();
  const [historyOpen, setHistoryOpen] = useState(false);

  /* Guidance is never printed on a block: it is reached through the Guidelines
     button while a field has focus, keyed `drafts.case.<subsection key>`. */
  const focusedGuidelineKey = useFocusedGuidelineKey();
  const { data: caseTemplateVersionId } = useProposalTemplateVersion(proposalId);
  const { data: blockGuidelines = [] } = useCardGuidelines(
    focusedGuidelineKey && focusedGuidelineKey.startsWith('drafts.') ? focusedGuidelineKey : null,
    'drafts',
    caseTemplateVersionId,
    proposalId,
  );
  const officialGuidelines = blockGuidelines.filter((g) => g.type !== 'sitra_tip');
  const authoredTips = blockGuidelines.filter((g) => g.type === 'sitra_tip');

  /* Sitra guidance for the focused subsection: the proposal's own override
     wins, otherwise the shared default. Coordinators may edit it here. */
  const { data: caseGuidelineDefaults = [] } = useCaseGuidelineDefaults();
  const focusedSubsectionKey = focusedGuidelineKey?.startsWith('drafts.case.')
    ? focusedGuidelineKey.slice('drafts.case.'.length)
    : null;
  const resolvedGuidance = useMemo(
    () => resolveCaseGuidance(focusedSubsectionKey, subsectionTemplates, caseGuidelineDefaults),
    [focusedSubsectionKey, subsectionTemplates, caseGuidelineDefaults],
  );
  const [guidanceEditOpen, setGuidanceEditOpen] = useState(false);

  // 90-day recycle bin. A binned subsection hangs off the proposal, because the
  // subsection set is project-wide rather than owned by one case.
  const [binOpen, setBinOpen] = useState(false);
  const binCount = useWPBinCount(proposalId, 'case_subsection', 'proposal');

  /** Deletes a subsection module into the 90-day bin, restorable in full. */
  const deleteSubsectionToBin = useCallback(
    async (subsectionId: string, heading: string) => {
      const res = await binTargetRow('case_subsection', subsectionId);
      if (!res.ok) {
        toast.error(res.error || 'Could not delete this subsection');
        return;
      }
      toast.success(`“${heading}” moved to the bin`);
      queryClient.invalidateQueries({ queryKey: ['case-subsection-templates', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-bin-count'] });
      queryClient.invalidateQueries({ queryKey: ['case-draft-subsections', caseId] });
    },
    [proposalId, caseId, queryClient],
  );

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleSubsectionDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = subsectionTemplates.map((t) => t.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = [...subsectionTemplates];
    next.splice(to, 0, next.splice(from, 1)[0]);
    reorderSubsections.mutate(next);
  }, [subsectionTemplates, reorderSubsections]);

  // Offers back text refused by the version guard.
  const { reportConflict, dialog: conflictDialog } = useVersionConflict();

  // Baseline bodies for the subsections this session loaded. Per-key checking
  // means two people editing DIFFERENT subsections of the same case both
  // succeed; only the same subsection conflicts. Whole-column checking would
  // make them collide needlessly, since the narrative subsections are
  // independent pieces of text.
  const subsectionBaseline = useRef<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(subsectionContent)) {
      next[k] = entryBody(v);
    }
    // Only seed keys we have not already saved in this session.
    for (const [k, v] of Object.entries(next)) {
      if (!(k in subsectionBaseline.current)) subsectionBaseline.current[k] = v;
    }
  }, [subsectionContent]);

  useEffect(() => { subsectionBaseline.current = {}; }, [caseId]);

  // Update mutation for the scalar columns — guarded by the row version.
  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await saveVersionedRow('case_drafts', caseId, updates, (caseDraft as any)?.version ?? null);
      if (res.conflict) {
        reportConflict(Object.values(updates).find(v => typeof v === 'string' && v.trim() !== '') ?? null);
        throw new Error('conflict');
      }
      if (!res.ok) throw new Error(res.error || 'save failed');
    },
    onSuccess: () => {
      setLastSaved(new Date());
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['case-draft-detail'] });
        queryClient.invalidateQueries({ queryKey: ['case-draft-subsections', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['case-drafts-management', proposalId] });
    },
    onError: (err: Error) => {
      setSaveError(err.message === 'conflict'
        ? 'This case was changed elsewhere — your change was not saved.'
        : 'Failed to save changes');
      queryClient.invalidateQueries({ queryKey: ['case-draft-detail'] });
        queryClient.invalidateQueries({ queryKey: ['case-draft-subsections', caseId] });
    },
  });

  // Update a single scalar column through the version-guarded mutation.
  const updateField = useCallback(
    (field: string, value: any) => {
      updateMutation.mutate({ [field]: value });
    },
    [updateMutation],
  );

  // Write a single subsection's content into the subsection_content jsonb.
  // Guarded PER KEY against the body this session loaded.
  const updateSubsectionContent = useCallback(
    async (key: string, value: string, heading?: string) => {
      const safe = typeof value === 'string' ? stripWordHtml(value) : value;
      const nextHeading = heading || entryHeading(subsectionContent[key]) || '';
      const expected = subsectionBaseline.current[key] ?? null;

      const res = await saveCaseDraftSubsection(caseId, key, safe, nextHeading, expected);
      if (res.conflict) {
        reportConflict(safe);
        setSaveError('This subsection was changed elsewhere — your text was not saved.');
        subsectionBaseline.current[key] = res.value ?? '';
        queryClient.invalidateQueries({ queryKey: ['case-draft-detail'] });
        queryClient.invalidateQueries({ queryKey: ['case-draft-subsections', caseId] });
        return;
      }
      if (!res.ok) {
        setSaveError('Failed to save changes');
        return;
      }
      subsectionBaseline.current[key] = safe;
      /* Snapshot into the shared version store. PostgREST builders are lazy
         thenables, so the promise must be consumed for the request to go out. */
      void supabase
        .rpc('save_target_version', {
          p_target_type: 'case_draft_subsection',
          p_target_id: caseId,
          p_text_box: key,
          p_value: safe,
          p_is_auto_save: true,
        })
        .then(({ error }) => {
          if (error) console.error('save_target_version failed', key, error);
        });
      setLastSaved(new Date());
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['case-draft-detail'] });
        queryClient.invalidateQueries({ queryKey: ['case-draft-subsections', caseId] });
      queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
    },
    [subsectionContent, caseId, proposalId, queryClient, reportConflict],
  );

  /**
   * The shared toolbar still speaks the legacy execCommand vocabulary; map it
   * onto TipTap commands run against the focused subsection editor.
   */
  const execCommand = (command: string, value?: string) => {
    const editor = getEditor();
    if (!editor) return;
    const chain = editor.chain().focus();
    switch (command) {
      case 'bold': chain.toggleBold().run(); break;
      case 'italic': chain.toggleItalic().run(); break;
      case 'underline': chain.toggleUnderline().run(); break;
      case 'insertUnorderedList': chain.toggleBulletList().run(); break;
      case 'insertOrderedList': chain.toggleOrderedList().run(); break;
      case 'justifyLeft': chain.setTextAlign('left').run(); break;
      case 'justifyCenter': chain.setTextAlign('center').run(); break;
      case 'justifyRight': chain.setTextAlign('right').run(); break;
      case 'justifyFull': chain.setTextAlign('justify').run(); break;
      case 'superscript': chain.toggleSuperscript().run(); break;
      case 'subscript': chain.toggleSubscript().run(); break;
      case 'insertHTML': if (value) chain.insertContent(value).run(); break;
      default: break;
    }
  };

  const insertTable = (rows: number, cols: number) => {
    const editor = getEditor();
    setTablePopoverOpen(false);
    if (!editor) {
      toast.error('Click into a text box first, then insert the table.');
      return;
    }
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  };


  /**
   * Find and replace over every subsection of this pilot draft, mounted or
   * not. Writes reuse `save_case_draft_subsection`, so the per-key baseline
   * check that guards ordinary typing also guards a replacement.
   */
  const searchFieldsForPage = useCallback((): SearchableField[] => {
    if (!caseDraft) return [];
    const contentMap = subsectionContent;
    const editable = canEdit;
    return subsectionTemplates
      .map((sub): SearchableField | null => {
        const body = entryBody(contentMap[sub.key]);
        if (!body) return null;
        return {
          id: `case_drafts:${caseId}:${sub.key}`,
          label: sub.heading,
          groupId: caseId,
          groupLabel: 'Pilot draft',
          format: 'html',
          value: body,
          readOnly: !editable,
          reveal: () => jumpToElementId(`case-subsection-${sub.key}`),
          save: !editable
            ? undefined
            : async (next): Promise<FieldSaveOutcome> => {
                const expected = subsectionBaseline.current[sub.key] ?? null;
                const res = await saveCaseDraftSubsection(caseId, sub.key, next, sub.heading, expected);
                if (res.conflict) {
                  subsectionBaseline.current[sub.key] = res.value ?? '';
                  return { ok: false, conflict: true };
                }
                if (!res.ok) return { ok: false, conflict: false, error: res.error };
                subsectionBaseline.current[sub.key] = next;
                queryClient.invalidateQueries({ queryKey: ['case-draft-detail'] });
        queryClient.invalidateQueries({ queryKey: ['case-draft-subsections', caseId] });
                return { ok: true };
              },
        };
      })
      .filter((f): f is SearchableField => f !== null);
  }, [caseDraft, subsectionContent, caseId, canEdit, subsectionTemplates, queryClient]);

  usePageSearchSource('case-draft', 'Pilot draft', searchFieldsForPage);
  const pageSearch = usePageSearch();

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!caseDraft) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {caseWord(caseTypes, { capitalize: true })} not found
      </div>
    );
  }

  const readOnly = !canEdit;
  const prefix = getCasePrefix(caseDraft.case_type, caseDraft.custom_type_name);
  const includeNumber = caseTypeRow?.include_number !== false;
  const includeAbbreviation = caseTypeRow?.include_abbreviation !== false;
  const caseAccent = caseTypeRow?.outline_color || '#000000';
  const headingLabel = buildCaseLabel({
    prefix,
    number: caseDraft.number,
    shortName: caseDraft.short_name,
    includeNumber,
    includeAbbreviation,
    withShortName: false,
  });


  return (
    <TooltipProvider>
    <div className="h-full">
      {/* One 21 cm column — 18 cm of text plus 1.5 cm margins each side —
          identical to WP drafts and the Part B board. */}
      <div className="mx-auto w-full max-w-[calc(21cm+3rem)] space-y-3 p-6">
        {/* Lock warning banner */}
        {isLocked && !canEdit && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm">
            <Lock className="w-4 h-4 text-destructive shrink-0" />
            <span>This {caseWord(caseTypes, { capitalize: false })} has been locked by <strong>{lockerName}</strong>. Editing is disabled.</span>
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
              This {caseWord(caseTypes, { capitalize: false })} has been locked by <strong>{lockerName}</strong>. As you are a coordinator, you can still edit it, but doing so may result in differences between the draft and Part B. It is recommended to therefore work on Part B instead.
            </p>
            <p className="text-sm font-medium">Do you wish to continue editing the draft?</p>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setShowLockWarning(false)}>Cancel</Button>
              <Button size="sm" onClick={() => { setLockWarningDismissed(true); setShowLockWarning(false); }}>OK</Button>
            </div>
          </DialogContent>
        </Dialog>
        <PageFindReplacePanel />
        {/* Top Toolbar Row - Guidelines + Formatting (shared component) */}
        <EditorToolbars
          proposalId={proposalId}
          save={{ saving: updateMutation.isPending, lastSaved, onSaveNow: () => {} }}
          topBar={{
            onFindReplace: pageSearch ? () => pageSearch.setOpen(true) : undefined,
            collapseAll: {
              allCollapsed,
              disabled: setCollapsed.isPending || allCollapseKeys.length === 0,
              onToggle: () =>
                setCollapsed.mutate({ keys: allCollapseKeys, collapsed: !allCollapsed }),
            },
          }}
          fieldBar={{
            onOpenGuidelines: () => setGuidelinesOpen(true),
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


        {/* ── THE CASE DRAFT BLOCK ──
            One block for the whole draft: an uncollapsible header part (a
            read-only projection of the case manager row) followed by one
            collapsible module per subsection. */}
        <section className={WP_BLOCK_FRAME}>
          {/* Block-level controls: add a subsection, restore a deleted one. */}
          {!readOnly && (
            <div className="flex items-center justify-end gap-1 px-[1.5cm] pt-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => addSubsection.mutate()} aria-label="Add a subsection">
                    <Plus className="h-3.5 w-3.5 text-blue-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add a subsection</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setBinOpen(true)}
                    disabled={binCount === 0}
                    aria-label="Restore a deleted subsection"
                  >
                    <Recycle
                      className={cn('h-3.5 w-3.5', binCount === 0 ? 'text-muted-foreground' : 'text-emerald-600')}
                      strokeWidth={2.5}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Restore a deleted subsection</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Header part — never collapsible, never draggable. */}
          <div className="space-y-2 border-b border-border px-[1.5cm] pb-2 pt-2">
            {/* The short name sits in a long pill spanning the text column,
                styled exactly like a case cross-reference chip. */}
            <div
              className="flex w-full items-baseline gap-0 rounded-full"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1.5px solid #000000',
                padding: '0px 6px',
                lineHeight: 1,
              }}
            >
              <span
                className="min-w-0 font-bold"
                style={{ ...WP_DOC_FONT, color: '#000000', overflowWrap: 'anywhere', lineHeight: 1.15 }}
              >
                {headingLabel}
              </span>
            </div>

            {/* The full title is a module of its own: plain bold document text
                with the standard right-hand control row. */}
            <div className="flex items-start gap-1">
              <p
                className="min-w-0 flex-1 font-bold"
                style={{ ...WP_DOC_FONT, overflowWrap: 'anywhere' }}
              >
                {caseDraft.title?.trim() || <span className="italic text-muted-foreground">No title set</span>}
              </p>
              <ModuleCommentButton
                targetKey={caseTarget(caseId, 'title')}
                label={`${headingLabel} title`}
              />
            </div>

            {/* The lead is a badge, not a dropdown — it is changed in the case
                manager. No hover comment control, no type label beside it. */}
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const leader = participants.find((pt) => pt.id === caseDraft.lead_participant_id);
                if (!leader) {
                  return <span className="text-draft italic text-muted-foreground">Lead not set</span>;
                }
                return (
                  <span
                    className="inline-flex items-center whitespace-nowrap rounded-full font-bold"
                    style={{ backgroundColor: '#000000', color: '#FFFFFF', border: '1.5px solid #000000', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, fontStyle: 'normal', lineHeight: 1, verticalAlign: 'baseline', padding: '0px 5px', height: '17px' }}
                  >
                    <Crown className="mr-1 h-3 w-3 fill-white text-white" />
                    {leader.participant_number}. {leader.organisation_short_name || leader.organisation_name}
                  </span>
                );
              })()}
            </div>
          </div>

          {/* ── MODULES: ONE PER SUBSECTION ── */}
          {subsectionTemplates.length === 0 && (
            <p className="px-[1.5cm] py-3 text-sm italic text-muted-foreground">
              No subsections defined for this proposal yet. A coordinator can add them via the
              &ldquo;Edit {caseWord(caseTypes, { capitalize: false })} subsections &amp; guidelines&rdquo; button in the case manager.
            </p>
          )}

          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleSubsectionDragEnd}>
            <SortableContext items={subsectionTemplates.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div>
                {subsectionTemplates.map((sub) => (
                  // Keyed by case AND subsection: switching cases must build fresh
                  // fields rather than rebind a live editor to another case's row.
                  <CaseSubsectionModule
                    key={`${caseId}:${sub.id}`}
                    caseId={caseId}
                    proposalId={proposalId}
                    subsectionId={sub.id}
                    subsectionKey={sub.key}
                    heading={sub.heading}
                    isVisible={sub.is_visible !== false}
                    onToggleVisible={
                      readOnly
                        ? undefined
                        : (next) => updateSubsection.mutate({ id: sub.id, updates: { is_visible: next } })
                    }
                    onDelete={readOnly ? undefined : () => deleteSubsectionToBin(sub.id, sub.heading)}
                    value={entryBody(subsectionContent[sub.key])}
                    onChange={(v) => updateSubsectionContent(sub.key, v, sub.heading)}
                    readOnly={readOnly}
                    collapsed={collapsedKeys.has(caseSubsectionCollapseKey(caseId, sub.key))}
                    onToggleCollapsed={() => toggleCollapsed(caseSubsectionCollapseKey(caseId, sub.key))}
                    shouldStayMounted={shouldStayMounted}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </section>


        {/* Version history for whichever case field owns the toolbar. */}
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

        {/* Guidelines Dialog — authored in Template Management under Drafts. */}
        <Dialog open={guidelinesOpen} onOpenChange={setGuidelinesOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw]">
            <DialogHeader>
              <DialogTitle>
                {focusedGuidelineKey
                  ? `Guidelines: ${subsectionTemplates.find((t) => `drafts.case.${t.key}` === focusedGuidelineKey)?.heading ?? caseWord(caseTypes, { capitalize: true })}`
                  : `Guidelines for ${headingLabel}: ${caseDraft.title || caseDraft.short_name || 'Case'}`}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[75vh] pr-4">
              <div className="space-y-4">
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
                          {g.title && <h4 className="mb-2 font-semibold text-blue-600">{g.title}</h4>}
                          <div
                            className="text-sm text-muted-foreground [&_a]:underline [&_div]:mt-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(g.content) }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {authoredTips.length > 0 && (
                  <div className="rounded-lg border-2 border-gray-800 bg-gray-50/50 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 flex-shrink-0 text-gray-800" />
                      <span className="text-sm font-bold text-gray-900">Sitra&rsquo;s tips</span>
                    </div>
                    <div className="space-y-4">
                      {authoredTips.map((tip) => (
                        <div key={tip.id}>
                          {tip.title && <h4 className="mb-2 font-semibold text-gray-900">{tip.title}</h4>}
                          <div
                            className="text-sm text-muted-foreground [&_a]:underline [&_div]:mt-1"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(tip.content) }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Case guidance: this proposal's override, or the shared default. */}
                {resolvedGuidance && (resolvedGuidance.content || isCoordinator) && (
                  <div className="rounded-lg border-2 border-gray-800 bg-gray-50/50 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 flex-shrink-0 text-gray-800" />
                      <span className="text-sm font-bold text-gray-900">
                        Sitra&rsquo;s tips
                        {resolvedGuidance.isOverride && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (written for this proposal)
                          </span>
                        )}
                      </span>
                      {isCoordinator && resolvedGuidance.templateId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7 px-2"
                          onClick={() => setGuidanceEditOpen(true)}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit for this proposal
                        </Button>
                      )}
                    </div>
                    <h4 className="mb-2 font-semibold text-gray-900">{resolvedGuidance.title}</h4>
                    <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {resolvedGuidance.content || 'No guidance yet — add some for this proposal.'}
                    </div>
                  </div>
                )}

                {blockGuidelines.length === 0 && !resolvedGuidance && (
                  <p className="text-sm text-muted-foreground">
                    {focusedGuidelineKey
                      ? 'No guidance has been authored for this subsection yet.'
                      : 'Place the cursor in a subsection to see the guidance for it.'}
                  </p>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>


        <WPBinDialog
          isOpen={binOpen}
          onClose={() => setBinOpen(false)}
          wpDraftId={proposalId}
          parentType="proposal"
          targetType="case_subsection"
          title="Deleted subsections"
        />
      </div>

      {/* Cross-reference dialogs */}
      <InsertCrossReferenceDialog
        isOpen={isCrossRefOpen}
        onClose={() => { setIsCrossRefOpen(false); setCrossRefFilterType(undefined); }}
        proposalId={proposalId}
        sectionNumber=""
        onInsert={insertCrossRefAtCursor}
        filterType={crossRefFilterType}
      />
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

      {/* Citation Dialog */}
      <CitationDialog
        isOpen={isCitationOpen}
        onClose={() => setIsCitationOpen(false)}
        onInsertCitation={(_reference, _formattedCitation, citationNumber) => {
          insertCitationAtCursor(citationNumber);
        }}
        proposalReferences={proposalReferences}
        isLoadingReferences={false}
        nextCitationNumber={getNextCitationNumber()}
        onUpdateReference={updateReference}
      />

      {/* Figure Dialog */}
      <InsertFigureDialog
        isOpen={isFigureDialogOpen}
        onClose={() => setIsFigureDialogOpen(false)}
        proposalId={proposalId}
        currentSectionId=""
        onInsertFigure={insertFigureAtCursor}
      />
      {conflictDialog}
    </div>
    </TooltipProvider>
  );
}

/**
 * One subsection MODULE inside the single case-draft block: the shared left
 * control stack (chevron above grip), an uneditable bold heading from the
 * project-wide template, the standard right-hand control row (visibility,
 * comment, delete) and a page-styled rich field carrying locking, streaming,
 * version history and guidance markers.
 */
function CaseSubsectionModule({
  caseId,
  proposalId,
  subsectionId,
  subsectionKey,
  heading,
  value,
  onChange,
  readOnly,
  collapsed,
  onToggleCollapsed,
  isVisible,
  onToggleVisible,
  onDelete,
  shouldStayMounted,
}: {
  caseId: string;
  proposalId: string;
  subsectionId: string;
  subsectionKey: string;
  heading: string;
  value: string;
  onChange: (html: string) => void;
  readOnly: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isVisible: boolean;
  onToggleVisible?: (next: boolean) => void;
  onDelete?: () => void;
  shouldStayMounted?: () => boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subsectionId,
  });

  return (
    <div
      ref={setNodeRef}
      id={`case-subsection-${subsectionKey}`}
      className={cn('border-b border-border last:border-b-0', isDragging && 'opacity-60', !isVisible && 'opacity-60')}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      /* Guidance is keyed on the subsection's own template key, so a
         case-type-specific subsection carries its own guidance. */
      data-guideline-key={`drafts.case.${subsectionKey}`}
      data-version-label={heading}
      data-version-target={versionTargetAttr('case_draft_subsection', caseId, subsectionKey)}
    >
      <div className={WP_BLOCK_HEADER}>
        <div className={WP_CONTROL_STACK}>
          <CollapseChevron collapsed={collapsed} onToggle={onToggleCollapsed} className={WP_CHEVRON_SIZE} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="shrink-0 cursor-grab touch-none rounded p-1 hover:bg-muted active:cursor-grabbing"
                aria-label="Drag to reorder this subsection"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4 text-blue-500" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Drag to reorder this subsection</TooltipContent>
          </Tooltip>
        </div>
        <p
          className="min-w-0 flex-1 select-none font-bold"
          style={{ ...WP_DOC_FONT, paddingLeft: WP_TITLE_INDENT }}
        >
          {heading}:
        </p>

        {/* The standard right-hand control row, matching Part B modules. */}
        {onToggleVisible && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-pressed={!isVisible}
                aria-label={isVisible ? 'Hide this module from Part B' : 'Show this module in Part B'}
                onClick={() => onToggleVisible(!isVisible)}
              >
                {isVisible ? (
                  <Eye className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-destructive" strokeWidth={2.5} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isVisible ? 'Hide this module from Part B' : 'Show this module in Part B'}
            </TooltipContent>
          </Tooltip>
        )}

        <ModuleCommentButton targetKey={caseTarget(caseId, subsectionKey)} label={heading} />

        {onDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" aria-label="Delete this module">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete this module</TooltipContent>
              </Tooltip>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{heading}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  The module and its text move to the recycle bin for 90 days and can be restored in full.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {!collapsed && (
        <div className="doc-surface-page bg-white px-[1.5cm] py-[6pt]">
          <ModuleCommentAnchor targetKey={caseTarget(caseId, subsectionKey)} label={heading}>
            <LockedWPRichField
              targetId={caseTarget(caseId, subsectionKey)}
              value={value}
              onChange={onChange}
              disabled={readOnly}
              minHeight="60px"
              proposalId={proposalId}
              staticExtensions={CASE_DRAFT_FIELD_EXTENSIONS}
              documentSurface
              shouldStayMounted={shouldStayMounted}
            />
          </ModuleCommentAnchor>
        </div>
      )}
    </div>
  );
}
