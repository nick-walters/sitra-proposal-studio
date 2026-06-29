import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { SaveIndicator } from '@/components/SaveIndicator';
import { getCaseTypePrefix } from '@/lib/caseTypeLabels';
import { DraftFormattingToolbar } from '@/components/DraftFormattingToolbar';
import { useWPDraftEditor } from '@/hooks/useWPDrafts';
import { useWPDraftUndoRedo } from '@/hooks/useWPDraftUndoRedo';
import { WPTableSection } from '@/components/WPTableSection';
import { ParagraphSpacingExecPopover } from '@/components/ParagraphSpacingExecPopover';

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

import { Input } from '@/components/ui/input';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { 
  BookOpen, Lightbulb, Bold, Italic, Underline, List, ListOrdered, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify, FileText, Link2, 
  Layers, Building2, Table2, ImageIcon, Image as ImageLucide, ChevronDown, Undo2, Redo2, Crown, ChevronsUpDown, Check, Lock
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getContrastingTextColor } from '@/lib/wpColors';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { ParticipantSummary } from '@/types/proposal';

interface WPDraftEditorProps {
  wpId: string;
  proposalId: string;
  canEdit: boolean;
  isCoordinator?: boolean;
  projectDuration?: number;
}

const SITRA_TIPS = [
  {
    id: 'sitra-1',
    title: 'Structure your WP clearly',
    content: 'Each WP should have clear objectives, well-defined tasks, and measurable deliverables. Evaluators appreciate logical flow and clear dependencies.',
  },
  {
    id: 'sitra-2',
    title: 'Balance the workload',
    content: 'Ensure effort is distributed appropriately among partners. Check that WP leaders have sufficient resources and expertise for their roles.',
  },
  {
    id: 'sitra-3',
    title: 'Consider timing carefully',
    content: 'Plan task timing to avoid bottlenecks. Allow buffer for unexpected delays, especially for external dependencies and approval processes.',
  },
  {
    id: 'sitra-methodology-1',
    title: 'Be specific about your choices',
    content: 'Explain WHY you chose these particular methods over alternatives. Evaluators want to see that you\'ve considered options and made informed decisions.',
  },
  {
    id: 'sitra-methodology-2',
    title: 'Reference state-of-the-art',
    content: 'Show awareness of current best practices and explain how your approach builds on or improves existing methodologies.',
  },
  {
    id: 'sitra-methodology-3',
    title: 'Acknowledge limitations',
    content: 'Being honest about methodological limitations and explaining your mitigation strategies demonstrates maturity and credibility.',
  },
  {
    id: 'sitra-methodology-4',
    title: 'Link to objectives',
    content: 'Explicitly connect your methods to the objectives they support. Show evaluators that every methodological choice serves a purpose.',
  },
];

const EC_GUIDELINES = [
  {
    id: 'ec-methodology',
    title: 'Methodology',
    content: 'Describe and explain the methodologies used in this WP, including the concepts, models and assumptions that underpin your work. Explain how they will enable you to deliver your project\'s objectives. Refer to any important challenges you may have identified in the chosen methodologies and how you intend to overcome them.',
  },
  {
    id: 'ec-objectives',
    title: 'Objectives',
    content: 'State the objectives for this work package in a manner that is verifiable and measurable. They should be consistent with the overall project objectives.',
  },
  {
    id: 'ec-tasks',
    title: 'Tasks',
    content: 'For each task, provide:\n• A description of the work\n• The partner(s) involved and the task leader\n• Start month and end month\n• Links to other tasks and work packages',
  },
  {
    id: 'ec-deliverables',
    title: 'Deliverables',
    content: 'For each deliverable, provide:\n• A short name and description\n• The nature of the deliverable (Report, Demonstrator, Data management, etc.)\n• The dissemination level (Public, Sensitive, or Classified: EU-RES, EU-CON, EU-SEC)\n• The delivery date (project month)\n• The partner responsible',
  },
  {
    id: 'ec-risks',
    title: 'Critical risks',
    content: 'Describe any critical risks relating to project implementation that the stated project objectives may not be achieved. Detail:\n• A description of the risk\n• The work package(s) involved\n• Proposed risk-mitigation measures',
  },
];

// Parse content to handle bullet points
function parseGuidelineContent(content: string): React.ReactNode {
  const lines = content.split('\n');
  
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const cleanLine = line.trim();
        
        if (cleanLine.startsWith('•') || cleanLine.startsWith('-') || cleanLine.startsWith('–')) {
          const bulletContent = cleanLine.replace(/^[•\-–]\s*/, '');
          return (
            <div key={index} className="flex items-start gap-1.5">
              <span className="text-muted-foreground mt-0.5">•</span>
              <span className="text-sm text-muted-foreground">{bulletContent}</span>
            </div>
          );
        }
        
        if (cleanLine) {
          return (
            <p key={index} className="text-sm text-muted-foreground">{cleanLine}</p>
          );
        }
        
        return null;
      })}
    </div>
  );
}




export function WPDraftEditor({ wpId, proposalId, canEdit: canEditProp, isCoordinator = false, projectDuration = 36 }: WPDraftEditorProps) {
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
    updateWPEffort,
    setTaskParticipants,
    moveTaskToWP,
    addDeliverable,
    updateDeliverable,
    deleteDeliverable: rawDeleteDeliverable,
    reorderDeliverables,
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

  // Fetch proposal's use_wp_themes flag
  const { data: proposalData } = useQuery({
    queryKey: ['proposal-themes-flag', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('use_wp_themes')
        .eq('id', proposalId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!proposalId,
  });

  // Fetch theme if WP has a theme_id
  const { data: themeData } = useQuery({
    queryKey: ['wp-theme', wpDraft?.theme_id],
    queryFn: async () => {
      if (!wpDraft?.theme_id) return null;
      const { data, error } = await supabase
        .from('wp_themes')
        .select('*')
        .eq('id', wpDraft.theme_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!wpDraft?.theme_id,
  });

  // Compute effective color: use theme color if themes enabled and WP has a theme
  const effectiveColor = useMemo(() => {
    if (proposalData?.use_wp_themes && themeData) {
      return themeData.color;
    }
    return wpDraft?.color || '#73C92D';
  }, [proposalData?.use_wp_themes, themeData, wpDraft?.color]);

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

  // Fetch proposal acronym segments + has-cases for dropdown
  const { data: proposalMeta } = useQuery({
    queryKey: ['wp-draft-proposal-meta', proposalId],
    queryFn: async () => {
      const [{ data: proposal }, { count }] = await Promise.all([
        supabase.from('proposals').select('acronym_segments').eq('id', proposalId).maybeSingle(),
        supabase.from('case_drafts').select('id', { count: 'exact', head: true }).eq('proposal_id', proposalId),
      ]);
      return {
        acronymSegments: (proposal?.acronym_segments as { text: string; color: string }[] | null) || [],
        hasCases: (count || 0) > 0,
      };
    },
    enabled: !!proposalId,
  });
  const acronymSegments = proposalMeta?.acronymSegments || [];
  const hasCases = !!proposalMeta?.hasCases;

  // Save the selection range before opening dialogs so we can restore it when inserting
  const savedRangeRef = useRef<Range | null>(null);
  const savedEditorRef = useRef<HTMLElement | null>(null);
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const node = sel.anchorNode;
      if (node) {
        const el = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
        const editable = el?.closest('[contenteditable="true"]') as HTMLElement | null;

        if (editable) {
          savedRangeRef.current = sel.getRangeAt(0).cloneRange();
          savedEditorRef.current = editable;
        }
      }
    }
  }, []);
  const restoreSelection = useCallback((): { range: Range | null; editorEl: HTMLElement | null } => {
    const range = savedRangeRef.current;
    const editorEl = savedEditorRef.current;
    const clearSavedSelection = () => {
      savedRangeRef.current = null;
      savedEditorRef.current = null;
    };

    if (range && editorEl && document.body.contains(editorEl)) {
      // Validate that the range's containers are still in the DOM
      if (document.body.contains(range.startContainer)) {
        editorEl.focus({ preventScroll: true });
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        clearSavedSelection();
        return { range, editorEl };
      }
      // Range is stale – place cursor at end of the editor element instead
      editorEl.focus({ preventScroll: true });
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        const fallbackRange = document.createRange();
        fallbackRange.selectNodeContents(editorEl);
        fallbackRange.collapse(false);
        sel.addRange(fallbackRange);
        clearSavedSelection();
        return { range: fallbackRange, editorEl };
      }
    }
    clearSavedSelection();
    return { range: null, editorEl: null };
  }, []);

  const notifyEditorInput = useCallback((editorEl: HTMLElement | null) => {
    if (!editorEl || !document.body.contains(editorEl)) return;
    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  }, []);
  
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
  
  // Editor insertion callbacks (these insert HTML into active contentEditable)
  const insertCitationAtCursor = useCallback((citationNumber: number) => {
    const { editorEl } = restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const citationSpan = document.createElement('sup');
      citationSpan.textContent = `${citationNumber}`;
      citationSpan.setAttribute('data-citation', String(citationNumber));
      citationSpan.style.color = 'blue';
      citationSpan.style.cursor = 'pointer';
      range.insertNode(citationSpan);
      range.setStartAfter(citationSpan);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      notifyEditorInput(editorEl);
    }
    toast.success(`Citation ${citationNumber} inserted`);
  }, [notifyEditorInput, restoreSelection]);
  
  const insertCrossRefAtCursor = useCallback((payload: { refText: string; figureId?: string; tableKey?: string; refKind: 'figure' | 'table' }) => {
    const { editorEl } = restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
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
      range.insertNode(refSpan);
      range.setStartAfter(refSpan);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      notifyEditorInput(editorEl);
    }
    toast.success('Cross-reference inserted');
  }, [notifyEditorInput, restoreSelection]);
  
  const insertWPRefAtCursor = useCallback((wpNumber: number, wpShortName: string, wpColor: string, wpId: string) => {
    const { editorEl } = restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const wpSpan = document.createElement('span');
      wpSpan.textContent = `WP${wpNumber}${wpShortName ? `: ${wpShortName}` : ''}`;
      wpSpan.setAttribute('data-wp-reference', '');
      wpSpan.setAttribute('data-wp-number', String(wpNumber));
      wpSpan.setAttribute('data-wp-id', wpId);
      wpSpan.setAttribute('data-wp-color', wpColor);
      wpSpan.setAttribute('data-wp-short-name', wpShortName || '');
      wpSpan.setAttribute('contenteditable', 'false');
      wpSpan.style.backgroundColor = wpColor;
      wpSpan.style.color = '#ffffff';
      wpSpan.style.border = `1.5px solid ${wpColor}`;
      wpSpan.style.padding = '0px 5px';
      wpSpan.style.borderRadius = '9999px';
      wpSpan.style.fontFamily = "'Times New Roman', Times, serif";
      wpSpan.style.fontWeight = '700';
      wpSpan.style.fontSize = '11pt';
      wpSpan.style.lineHeight = '1';
      wpSpan.style.verticalAlign = 'baseline';
      wpSpan.style.display = 'inline-flex';
      wpSpan.style.alignItems = 'center';
      wpSpan.style.whiteSpace = 'nowrap';
      wpSpan.style.userSelect = 'none';
      range.insertNode(wpSpan);
      range.setStartAfter(wpSpan);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      notifyEditorInput(editorEl);
    }
    toast.success(`WP${wpNumber} reference inserted`);
  }, [notifyEditorInput, restoreSelection]);

  const insertParticipantRefAtCursor = useCallback((participantNumber: number, shortName: string, participantId: string) => {
    const { editorEl } = restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const partSpan = document.createElement('span');
      partSpan.textContent = shortName || 'Partner';
      partSpan.setAttribute('data-participant-reference', '');
      partSpan.setAttribute('data-participant-number', String(participantNumber));
      partSpan.setAttribute('data-participant-id', participantId);
      partSpan.setAttribute('data-participant-short-name', shortName || '');
      partSpan.setAttribute('contenteditable', 'false');
      partSpan.style.backgroundColor = '#000000';
      partSpan.style.color = '#ffffff';
      partSpan.style.border = '1.5px solid #000000';
      partSpan.style.padding = '0px 5px';
      partSpan.style.borderRadius = '9999px';
      partSpan.style.fontFamily = "'Times New Roman', Times, serif";
      partSpan.style.fontWeight = '700';
      partSpan.style.setProperty('font-style', 'normal', 'important');
      partSpan.style.fontSize = '11pt';
      partSpan.style.lineHeight = '1';
      partSpan.style.verticalAlign = 'baseline';
      partSpan.style.display = 'inline-flex';
      partSpan.style.alignItems = 'center';
      partSpan.style.whiteSpace = 'nowrap';
      partSpan.style.userSelect = 'none';
      range.insertNode(partSpan);
      range.setStartAfter(partSpan);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      notifyEditorInput(editorEl);
    }
    toast.success(`${shortName} reference inserted`);
  }, [notifyEditorInput, restoreSelection]);
  
  const insertFigureAtCursor = useCallback((figure: any) => {
    const { editorEl } = restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      // Insert just a cross-reference text
      const refSpan = document.createElement('span');
      refSpan.textContent = `(see ${figure.figure_number})`;
      refSpan.style.color = 'blue';
      refSpan.style.textDecoration = 'underline';
      range.insertNode(refSpan);
      range.setStartAfter(refSpan);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      notifyEditorInput(editorEl);
    }
    toast.success(`Figure reference inserted`);
  }, [notifyEditorInput, restoreSelection]);

  // Handle Task reference insertion (contentEditable) - pill bubble
  const insertTaskRefAtCursor = useCallback((task: { id: string; wp_number: number; number: number; title: string; wp_color?: string }) => {
    const { editorEl } = restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const color = task.wp_color || '#73C92D';
      const span = document.createElement('span');
      span.textContent = `T${task.wp_number}.${task.number}`;
      span.setAttribute('contenteditable', 'false');
      span.setAttribute('data-task-id', task.id);
      Object.assign(span.style, { display: 'inline-flex', alignItems: 'center', height: '17px', padding: '0 4px', borderRadius: '9999px', border: `1.5px solid ${color}`, color: color, fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: '700', lineHeight: '1', whiteSpace: 'nowrap', verticalAlign: 'baseline', userSelect: 'none' });
      range.insertNode(span);
      range.setStartAfter(span);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      notifyEditorInput(editorEl);
    }
    toast.success(`T${task.wp_number}.${task.number} reference inserted`);
  }, [notifyEditorInput, restoreSelection]);

  // Handle Deliverable reference insertion - pentagon bubble matching 3.1.c
  const insertDeliverableRefAtCursor = useCallback((del: { id: string; number: string; name: string; wp_color?: string }) => {
    const { editorEl } = restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rawColor = del.wp_color || '#73C92D';
      const color = /^#[0-9a-fA-F]{3,8}$/.test(rawColor) ? rawColor : '#73C92D';
      const label = String(del.number).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const textWidth = Math.max(36, label.length * 8 + 8);
      const totalWidth = textWidth + 8;
      const wrapper = document.createElement('span');
      wrapper.setAttribute('contenteditable', 'false');
      wrapper.setAttribute('data-deliverable-id', del.id);
      Object.assign(wrapper.style, { display: 'inline-block', verticalAlign: 'baseline', position: 'relative', width: `${totalWidth}px`, height: '17px', userSelect: 'none' });
      wrapper.innerHTML = `<svg width="${totalWidth}" height="17" viewBox="0 0 ${totalWidth} 17" style="position:absolute;top:0;left:0;overflow:visible;"><path d="M 0,0 L ${textWidth},0 L ${totalWidth},8.5 L ${textWidth},17 L 0,17 Z" fill="#ffffff" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg><span style="position:absolute;top:0;left:0;width:${textWidth}px;height:17px;display:flex;align-items:center;justify-content:center;font-family:'Times New Roman',Times,serif;font-size:11pt;font-weight:700;line-height:1;color:${color};white-space:nowrap;">${label}</span>`;
      range.insertNode(wrapper);
      range.setStartAfter(wrapper);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      notifyEditorInput(editorEl);
    }
    toast.success(`${del.number} reference inserted`);
  }, [notifyEditorInput, restoreSelection]);

  // Handle Milestone reference insertion - triangle bubble matching 3.1.d
  const insertMilestoneRefAtCursor = useCallback((ms: { id: string; number: number; name: string }) => {
    const { editorEl } = restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const wrapper = document.createElement('span');
      wrapper.setAttribute('contenteditable', 'false');
      wrapper.setAttribute('data-milestone-id', ms.id);
      Object.assign(wrapper.style, { display: 'inline-block', verticalAlign: 'baseline', position: 'relative', width: '21px', height: '21px', userSelect: 'none' });
      wrapper.innerHTML = `<svg width="21" height="21" viewBox="0 0 21 21" style="position:absolute;top:0;left:0;overflow:visible;"><path d="M 0,0 L 21,10.5 L 0,21 Z" fill="#000000"/></svg><span style="position:absolute;top:0;left:-1px;width:15px;height:21px;display:flex;align-items:center;justify-content:center;font-family:'Times New Roman',Times,serif;font-size:11pt;font-weight:700;line-height:1;color:#ffffff;letter-spacing:-0.7px;white-space:nowrap;">${Number(ms.number) || 0}</span>`;
      range.insertNode(wrapper);
      range.setStartAfter(wrapper);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      notifyEditorInput(editorEl);
    }
    toast.success(`MS${ms.number} reference inserted`);
  }, [notifyEditorInput, restoreSelection]);

  // Handle Acronym reference insertion - colored letters mimicking AcronymReference extension
  const insertAcronymRefAtCursor = useCallback(() => {
    if (!acronymSegments || acronymSegments.length === 0) return;
    const { editorEl } = restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const wrapper = document.createElement('span');
      wrapper.setAttribute('data-acronym-reference', '');
      wrapper.setAttribute('contenteditable', 'false');
      wrapper.setAttribute('data-acronym-segments', JSON.stringify(acronymSegments));
      Object.assign(wrapper.style, {
        display: 'inline',
        fontFamily: "'Arial Black', Arial, sans-serif",
        fontWeight: '900',
        fontSize: 'inherit',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      });
      acronymSegments.forEach((seg) => {
        const s = document.createElement('span');
        s.style.color = seg.color;
        s.textContent = seg.text;
        wrapper.appendChild(s);
      });
      range.insertNode(wrapper);
      range.setStartAfter(wrapper);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      notifyEditorInput(editorEl);
    }
    toast.success('Acronym reference inserted');
  }, [acronymSegments, notifyEditorInput, restoreSelection]);

  // Handle Case reference insertion - rounded outline badge matching CaseReferenceMark
  const insertCaseRefAtCursor = useCallback((caseItem: { id: string; number: number; short_name: string | null; case_type: string }) => {
    const { editorEl } = restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const prefix = getCaseTypePrefix(caseItem.case_type);
      const label = prefix ? `${prefix}${caseItem.number}` : (caseItem.short_name || String(caseItem.number));
      const span = document.createElement('span');
      span.textContent = label;
      span.setAttribute('data-case-reference', '');
      span.setAttribute('data-case-id', caseItem.id);
      span.setAttribute('data-case-number', String(caseItem.number));
      span.setAttribute('data-case-type', caseItem.case_type);
      if (caseItem.short_name) span.setAttribute('data-case-short-name', caseItem.short_name);
      span.setAttribute('contenteditable', 'false');
      Object.assign(span.style, {
        display: 'inline-flex', alignItems: 'center', backgroundColor: '#ffffff', color: '#000000',
        border: '1.5px solid #000000', padding: '0 0.4rem', borderRadius: '9999px',
        fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: '700',
        fontStyle: 'normal', lineHeight: '1', whiteSpace: 'nowrap', verticalAlign: 'baseline',
        cursor: 'pointer', userSelect: 'none',
      });
      range.insertNode(span);
      range.setStartAfter(span);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      notifyEditorInput(editorEl);
    }
    toast.success('Case reference inserted');
  }, [notifyEditorInput, restoreSelection]);


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

  const execCommand = (command: string, cmdValue?: string) => {
    document.execCommand(command, false, cmdValue);
  };
  
  const insertTable = (rows: number, cols: number) => {
    let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:8px 0;">';
    for (let r = 0; r < rows; r++) {
      tableHtml += '<tr>';
      for (let c = 0; c < cols; c++) {
        if (r === 0) {
          tableHtml += '<th style="border:1px solid #000; padding:4px; background:#000; color:#fff; font-weight:bold;">&nbsp;</th>';
        } else {
          tableHtml += '<td style="border:1px solid #000; padding:4px;">&nbsp;</td>';
        }
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</table><p><br></p>';
    execCommand('insertHTML', tableHtml);
    setTablePopoverOpen(false);
  };


  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
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
        <DraftFormattingToolbar
          onOpenGuidelines={() => setGuidelinesDialogOpen(true)}
          save={{ saving, lastSaved, saveError, onSaveNow: () => {} }}
          isReadOnly={readOnly}
          undo={{
            canUndo,
            canRedo,
            onUndo: handleUndo,
            onRedo: handleRedo,
            undoLabel,
            redoLabel,
          }}
          onCommand={execCommand}
          table={{
            open: tablePopoverOpen,
            onOpenChange: setTablePopoverOpen,
            hoveredCell,
            onHoverCell: setHoveredCell,
            onInsert: insertTable,
          }}
          paragraphSpacingContainer={() =>
            document.querySelector('.wp-draft-editor [contenteditable="true"]') as HTMLElement | null
          }
          onSaveSelection={saveSelection}
          onOpenFigureDialog={() => setIsFigureDialogOpen(true)}
          onOpenCitationDialog={() => setIsCitationOpen(true)}
          crossRefMenuItems={
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
                  <span>Case</span>
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
          trailing={
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
          }
        />


        {/* Header: pill badge + metadata row */}
        <div className="space-y-2 -mx-2">
          {/* Full-width pill badge: WPX: Short Name – Title */}
          <div
            className="rounded-full flex items-baseline gap-0"
            style={{
              backgroundColor: effectiveColor,
              color: '#FFFFFF',
              border: `1.5px solid ${effectiveColor}`,
              padding: '0px 6px',
              lineHeight: 1,
            }}
          >
            <span
              className="font-bold whitespace-nowrap shrink-0"
              style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt' }}
            >
              WP{wpDraft.number}:&nbsp;
            </span>
            <DebouncedInput
              value={wpDraft.short_name?.trim() || ''}
              onDebouncedChange={(v) => updateField('short_name', v.trim())}
              placeholder="SHORT"
              className="bg-transparent text-white placeholder:text-white/40 border-none shadow-none focus-visible:ring-0 h-auto p-0 font-bold shrink-0 min-w-0"
              style={{
                fontFamily: "'Times New Roman', Times, serif",
                fontSize: '11pt',
                width: `${Math.max(5, (wpDraft.short_name?.trim() || '').length)}ch`,
              }}
              disabled={readOnly}
            />
            {Boolean(wpDraft.short_name?.trim()) && (Boolean(wpDraft.title?.trim()) || !readOnly) && (
              <span
                className="font-bold whitespace-nowrap shrink-0"
                style={{
                  fontFamily: "'Times New Roman', Times, serif",
                  fontSize: '11pt',
                  marginLeft: '0.25em',
                  marginRight: '0.25em',
                }}
              >
                –
              </span>
            )}
            <DebouncedInput
              value={wpDraft.title?.trim() || ''}
              onDebouncedChange={(v) => updateField('title', v.trim())}
              placeholder="Work package title"
              className="bg-transparent text-white placeholder:text-white/40 border-none shadow-none focus-visible:ring-0 h-auto p-0 font-bold flex-1 min-w-0"
              style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt' }}
              disabled={readOnly}
            />
          </div>

          {/* Metadata row: WP Leader (left) + Duration (right) */}
          <div className="flex items-center justify-between px-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-draft text-muted-foreground">WP Leader:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80" disabled={readOnly}>
                    {(() => {
                      const leader = participants.find(p => p.id === wpDraft.lead_participant_id);
                      if (leader) {
                        return (
                          <span
                            className="inline-flex items-center rounded-full font-bold whitespace-nowrap"
                            style={{ backgroundColor: '#000000', color: '#FFFFFF', border: '1.5px solid #000000', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, fontStyle: 'normal', lineHeight: 1, verticalAlign: 'baseline', padding: '0px 5px', height: '17px' }}
                          >
                            <Crown className="w-3 h-3 mr-1 text-white fill-white" />
                            {leader.participant_number}. {leader.organisation_short_name || leader.organisation_name}
                          </span>
                        );
                      }
                      return <span className="text-draft text-muted-foreground italic">Select</span>;
                    })()}
                    <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <div className="max-h-[200px] overflow-y-auto">
                    {participants.map(p => (
                      <button
                        key={p.id}
                        className={cn(
                          'flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
                          p.id === wpDraft.lead_participant_id && 'bg-accent',
                        )}
                        onClick={() => updateField('lead_participant_id', p.id)}
                      >
                        <div
                          className={cn(
                            'flex h-4 w-4 items-center justify-center rounded-full border',
                            p.id === wpDraft.lead_participant_id ? 'bg-primary border-primary' : 'border-muted-foreground',
                          )}
                        >
                          {p.id === wpDraft.lead_participant_id && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <span
                          className="inline-flex items-center justify-center rounded-full font-bold whitespace-nowrap"
                          style={{ backgroundColor: '#000000', color: '#ffffff', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, padding: '0px 5px', height: '17px' }}
                        >
                          {p.participant_number}. {p.organisation_short_name || p.organisation_name}
                        </span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
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
                  <div className="flex items-center gap-2">
                    <span className="text-draft text-muted-foreground">Duration:</span>
                    <span className="text-draft font-medium">
                      {formatMonth(startMonth)}–{formatMonth(endMonth)}
                    </span>
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-2">
                  <span className="text-draft text-muted-foreground">Duration:</span>
                  <span className="text-draft text-muted-foreground italic">—</span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Guidelines Dialog */}
        <Dialog open={guidelinesDialogOpen} onOpenChange={setGuidelinesDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw]">
            <DialogHeader>
              <DialogTitle>Guidelines for WP{wpDraft.number}: {wpDraft.title || wpDraft.short_name || 'Work package'}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[75vh] pr-4">
              <div className="space-y-4">
                {/* Official EC Guidelines */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-foreground">Official guidelines</h4>
                  {EC_GUIDELINES.map((guideline) => (
                    <div key={guideline.id} className="space-y-1">
                      <h5 className="font-medium text-sm text-muted-foreground">{guideline.title}</h5>
                      {parseGuidelineContent(guideline.content)}
                    </div>
                  ))}
                </div>

                {/* Sitra's Tips Box - matching Part B style */}
                <div
                  className={cn(
                    "rounded-lg border-2 p-4",
                    "border-gray-800",
                    "bg-gray-50/50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-shrink-0 text-gray-800">
                      <Lightbulb className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-bold text-gray-900">
                      Sitra's tips
                    </span>
                  </div>
                  
                  <div className="space-y-4">
                    {SITRA_TIPS.map((tip, index) => (
                      <div key={tip.id}>
                        {tip.title && (
                          <h4 className="font-semibold mb-2 text-gray-900">
                            {tip.title}
                          </h4>
                        )}
                        {parseGuidelineContent(tip.content)}
                        {index < SITRA_TIPS.length - 1 && (
                          <div className="mt-4 border-t border-current/10" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
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
          tasks={wpDraft.tasks || []}
          participants={participants}
          onObjectivesChange={(value) => updateField('objectives', value)}
          onDescriptionBeforeTasksChange={(value) => updateField('description_before_tasks', value)}
          onTaskUpdate={updateTask}
          onTaskAdd={addTask}
          onTaskDelete={deleteTask}
          onTaskParticipantsChange={setTaskParticipants}
          onTaskReorder={reorderTasks}
          onTaskMove={moveTaskToWP}
          readOnly={readOnly}
          projectDuration={projectDuration}
          hideToolbar={true}
          allWpDrafts={wpDrafts}
          currentWpDraftId={wpDraft.id}
        />

        {/* Deliverables */}
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
          onDeliverableReorder={reorderDeliverables}
          onDeliverableMove={moveDeliverableToWP}
          readOnly={readOnly}
          projectDuration={projectDuration}
          allWpDrafts={wpDrafts}
        />




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
    </ScrollArea>
  );
}
