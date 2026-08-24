import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { saveVersionedRow, saveCaseDraftSubsection } from '@/lib/versionedSave';
import { useVersionConflict } from '@/hooks/useVersionConflict';
import { markBadgeElement, markBadgeTree } from '@/lib/refBadgeMarkup';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LazyRichField } from '@/components/participant/LazyRichField';
import { DebouncedRichField } from '@/components/participant/DebouncedRichField';
import { CASE_DRAFT_FIELD_EXTENSIONS } from '@/components/cases/caseDraftFieldExtensions';
import {
  MethodologyEditorFocusProvider,
  useMethodologyEditorFocus,
} from '@/components/MethodologyEditorFocusContext';
import { getEditorCapabilities } from '@/lib/fieldCapabilities';

import { SitraTipsBox } from '@/components/SitraTipsBox';
import { BookOpen, Lock, Image as ImageLucide, Table2 } from 'lucide-react';
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
import { ParticipantBubble } from '@/components/B31Pill';

import {
  getCaseTypeLabel,
  getCaseTypePrefix as getCasePrefix,
  buildCaseLabel,
  caseWord,
} from '@/lib/caseTypeLabels';
import { useProposalCaseTypes } from '@/hooks/useProposalCaseTypes';
import { stripWordHtml } from '@/lib/stripWordHtml';



const SITRA_CASE_TIPS = [
  {
    id: 'sitra-case-1',
    title: 'Make each case distinct',
    content: 'Each case should address a clearly different context, sector, or geography. Avoid overlap — evaluators want to see breadth and complementarity across cases.',
  },
  {
    id: 'sitra-case-2',
    title: 'Ground cases in real needs',
    content: 'Cases are most convincing when rooted in genuine, documented needs of end-users or stakeholders. Reference existing evidence or engagement activities.',
  },
  {
    id: 'sitra-case-3',
    title: 'Show the path to impact',
    content: 'For each case, make the connection from activities to outcomes to wider impact explicit. This helps evaluators see how results will materialise beyond the project.',
  },
  {
    id: 'sitra-case-4',
    title: 'Plan for replicability early',
    content: 'Describe how lessons learned and solutions developed in each case can be transferred to other contexts. This strengthens the overall impact narrative of the proposal.',
  },
];

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
      <PageSearchProvider>
      <CaseDraftEditorInner {...props} />
      </PageSearchProvider>
    </MethodologyEditorFocusProvider>
  );
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
  const { templates: subsectionTemplates } = useCaseSubsectionTemplates(proposalId);

  // Offers back text refused by the version guard.
  const { reportConflict, dialog: conflictDialog } = useVersionConflict();

  // Baseline bodies for the subsections this session loaded. Per-key checking
  // means two people editing DIFFERENT subsections of the same case both
  // succeed; only the same subsection conflicts. Whole-column checking would
  // make them collide needlessly, since the narrative subsections are
  // independent pieces of text.
  const subsectionBaseline = useRef<Record<string, string>>({});
  useEffect(() => {
    const stored = ((caseDraft as any)?.subsection_content as Record<string, any> | null) || {};
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(stored)) {
      next[k] = typeof v === 'string' ? v : String(v?.body ?? '');
    }
    // Only seed keys we have not already saved in this session.
    for (const [k, v] of Object.entries(next)) {
      if (!(k in subsectionBaseline.current)) subsectionBaseline.current[k] = v;
    }
  }, [caseDraft]);
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
      queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['case-drafts-management', proposalId] });
    },
    onError: (err: Error) => {
      setSaveError(err.message === 'conflict'
        ? 'This case was changed elsewhere — your change was not saved.'
        : 'Failed to save changes');
      queryClient.invalidateQueries({ queryKey: ['case-draft-detail'] });
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
      const current = ((caseDraft as any)?.subsection_content as Record<string, any> | null) || {};
      const safe = typeof value === 'string' ? stripWordHtml(value) : value;
      const existing = current[key];
      const existingHeading =
        existing && typeof existing === 'object' ? existing.heading : undefined;
      const nextHeading = heading || existingHeading || '';
      const expected = subsectionBaseline.current[key] ?? null;

      const res = await saveCaseDraftSubsection(caseId, key, safe, nextHeading, expected);
      if (res.conflict) {
        reportConflict(safe);
        setSaveError('This subsection was changed elsewhere — your text was not saved.');
        subsectionBaseline.current[key] = res.value ?? '';
        queryClient.invalidateQueries({ queryKey: ['case-draft-detail'] });
        return;
      }
      if (!res.ok) {
        setSaveError('Failed to save changes');
        return;
      }
      subsectionBaseline.current[key] = safe;
      setLastSaved(new Date());
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['case-draft-detail'] });
      queryClient.invalidateQueries({ queryKey: ['case-drafts', proposalId] });
    },
    [caseDraft, caseId, proposalId, queryClient, reportConflict],
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
    const contentMap = ((caseDraft as any).subsection_content as Record<string, any> | null) || {};
    const editable = canEdit;
    return subsectionTemplates
      .map((sub): SearchableField | null => {
        const raw = contentMap[sub.key];
        const body =
          typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? String(raw.body ?? '') : '';
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
                return { ok: true };
              },
        };
      })
      .filter((f): f is SearchableField => f !== null);
  }, [caseDraft, caseId, canEdit, subsectionTemplates, queryClient]);

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
  const headingLabel = buildCaseLabel({
    prefix,
    number: caseDraft.number,
    shortName: caseDraft.short_name,
    includeNumber,
    includeAbbreviation,
    withShortName: false,
  });


  return (
    <div className="h-full">
      <div className="space-y-3 p-4">
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
          topBar={{ onFindReplace: pageSearch ? () => pageSearch.setOpen(true) : undefined }}
          fieldBar={{ onOpenGuidelines: () => setGuidelinesOpen(true) }}
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


        {/* Header with white bg + black outline (case bubble style) */}
        <div
          className="rounded-lg p-4 bg-white border-[1.5px] border-black"
        >
          {/* Row 1: Short name + Leader */}
          <div className="flex items-center gap-4 flex-wrap mb-2">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-black">Short name:</span>
              <DebouncedInput
                value={caseDraft.short_name || ''}
                onDebouncedChange={(v) => updateField('short_name', v)}
                placeholder="e.g. Barcelona"
                className="h-8 w-[160px] text-base font-bold"
                disabled={readOnly}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-black">{getCaseTypeLabel(caseDraft.case_type, caseDraft.custom_type_name)} Leader:</span>
              <Select
                value={caseDraft.lead_participant_id || ''}
                onValueChange={(value) => updateField('lead_participant_id', value || null)}
                disabled={readOnly}
              >
                <SelectTrigger className="h-8 w-[160px] text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {participants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <ParticipantBubble>
                        {p.organisation_short_name || p.organisation_name}
                      </ParticipantBubble>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Row 2: Badge + Title */}
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-black">{headingLabel}:</span>
            <DebouncedInput
              value={caseDraft.title || ''}
              onDebouncedChange={(v) => updateField('title', v)}
              placeholder={`Full ${caseWord(caseTypes, { capitalize: false })} title`}
              className="flex-1 text-base font-bold"
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Guidelines Dialog */}
        <Dialog open={guidelinesOpen} onOpenChange={setGuidelinesOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw]">
            <DialogHeader>
              <DialogTitle>Guidelines for {headingLabel}: {caseDraft.title || caseDraft.short_name || 'Case'}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[75vh] pr-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  There are no official EC guidelines for {caseWord(caseTypes, { plural: true, capitalize: false })} descriptions. Use the Sitra tips below for guidance.
                </p>
                <SitraTipsBox tips={SITRA_CASE_TIPS} />
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Subsections — driven by project-wide template */}
        {subsectionTemplates.length === 0 && (
          <p className="text-sm text-muted-foreground italic px-1">
            No subsections defined for this proposal yet. A coordinator can add them via the
            &ldquo;Edit {caseWord(caseTypes, { capitalize: false })} subsections &amp; guidelines&rdquo; button in the case manager.
          </p>
        )}
        {subsectionTemplates.map((sub) => {
          const contentMap = ((caseDraft as any).subsection_content as Record<string, any> | null) || {};
          const rawEntry = contentMap[sub.key];
          const content =
            typeof rawEntry === 'string'
              ? rawEntry
              : (rawEntry && typeof rawEntry === 'object' ? (rawEntry.body || '') : '');
          const guideline = sub.guideline || '';

          return (
            <Card key={sub.id} id={`case-subsection-${sub.key}`}>
              <CardHeader className="py-2 px-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-4 w-4" />
                  <span>{sub.heading}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-3 pb-3 pt-0">
                {guideline && (
                  <p className="text-xs text-muted-foreground italic px-1">{guideline}</p>
                )}

                <DebouncedRichField
                  value={content}
                  onChange={(v) => updateSubsectionContent(sub.key, v, sub.heading)}
                  disabled={readOnly}
                  minHeight="150px"
                  proposalId={proposalId}
                  staticExtensions={CASE_DRAFT_FIELD_EXTENSIONS}
                  shouldStayMounted={shouldStayMounted}
                />

              </CardContent>
            </Card>
          );
        })}
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
  );
}