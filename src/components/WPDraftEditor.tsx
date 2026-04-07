import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { SaveIndicator } from '@/components/SaveIndicator';
import { useWPDraftEditor } from '@/hooks/useWPDrafts';
import { useWPDraftUndoRedo } from '@/hooks/useWPDraftUndoRedo';
import { WPMethodologySection } from '@/components/WPMethodologySection';
import { WPTableSection } from '@/components/WPTableSection';
import { WPPlanningQuestions } from '@/components/WPPlanningQuestions';

import { WPDeliverablesTable } from '@/components/WPDeliverablesTable';
import { WPRisksTable } from '@/components/WPRisksTable';
import { WPMilestonesTable } from '@/components/WPMilestonesTable';
import { CitationDialog } from '@/components/CitationDialog';
import { InsertCrossReferenceDialog } from '@/components/InsertCrossReferenceDialog';
import { InsertWPReferenceDialog } from '@/components/InsertWPReferenceDialog';
import { InsertParticipantReferenceDialog } from '@/components/InsertParticipantReferenceDialog';
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
  Layers, Building2, Table2, ImageIcon, ChevronDown, Undo2, Redo2, Crown, ChevronsUpDown, Check
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
    addRisk,
    updateRisk,
    deleteRisk: rawDeleteRisk,
    reorderRisks,
    addMilestone,
    updateMilestone,
    deleteMilestone: rawDeleteMilestone,
    reorderMilestones,
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

  const deleteRisk = useCallback(async (riskId: string) => {
    const r = wpDraft?.risks?.find(r => r.id === riskId);
    if (r) recordDelete('risk', r);
    return rawDeleteRisk(riskId);
  }, [rawDeleteRisk, wpDraft, recordDelete]);

  const deleteMilestone = useCallback(async (milestoneId: string) => {
    const m = wpDraft?.milestones?.find(m => m.id === milestoneId);
    if (m) recordDelete('milestone', m);
    return rawDeleteMilestone(milestoneId);
  }, [rawDeleteMilestone, wpDraft, recordDelete]);

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
    return wpDraft?.color || '#2563EB';
  }, [proposalData?.use_wp_themes, themeData, wpDraft?.color]);

  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [guidelinesDialogOpen, setGuidelinesDialogOpen] = useState(false);
  
  // Dialog states for editor features
  const [isCitationOpen, setIsCitationOpen] = useState(false);
  const [isCrossRefOpen, setIsCrossRefOpen] = useState(false);
  const [isWPRefOpen, setIsWPRefOpen] = useState(false);
  const [isParticipantRefOpen, setIsParticipantRefOpen] = useState(false);
  const [isFigureDialogOpen, setIsFigureDialogOpen] = useState(false);
  const [isTaskRefOpen, setIsTaskRefOpen] = useState(false);
  const [isDeliverableRefOpen, setIsDeliverableRefOpen] = useState(false);
  const [figures, setFigures] = useState<any[]>([]);
  const [wpDrafts, setWpDrafts] = useState<any[]>([]);

  // Save the selection range before opening dialogs so we can restore it when inserting
  const savedRangeRef = useRef<Range | null>(null);
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);
  const restoreSelection = useCallback((): Range | null => {
    const range = savedRangeRef.current;
    if (range) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      savedRangeRef.current = null;
      return range;
    }
    return null;
  }, []);
  
  // Table insertion for toolbar (moved to top with other hooks)
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  
  // Proposal-wide references hook
  const { 
    references: proposalReferences, 
    addReference,
    findExistingReference,
    getNextCitationNumber 
  } = useProposalReferences(proposalId);
  
  // Editor insertion callbacks (these insert HTML into active contentEditable)
  const insertCitationAtCursor = useCallback((citationNumber: number) => {
    restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const citationSpan = document.createElement('sup');
      citationSpan.textContent = `[${citationNumber}]`;
      citationSpan.style.color = 'blue';
      citationSpan.style.cursor = 'pointer';
      range.insertNode(citationSpan);
      range.setStartAfter(citationSpan);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    toast.success(`Citation [${citationNumber}] inserted`);
  }, []);
  
  const insertCrossRefAtCursor = useCallback((payload: { refText: string; figureId?: string; tableKey?: string; refKind: 'figure' | 'table' }) => {
    restoreSelection();
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
      refSpan.style.fontStyle = 'italic';
      refSpan.style.fontFamily = "'Times New Roman', Times, serif";
      refSpan.style.cursor = 'pointer';
      range.insertNode(refSpan);
      range.setStartAfter(refSpan);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    toast.success('Cross-reference inserted');
  }, []);
  
  const insertWPRefAtCursor = useCallback((wpNumber: number, wpShortName: string, wpColor: string, wpId: string) => {
    restoreSelection();
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
      // Insert trailing space and move cursor after it
      const space = document.createTextNode(' ');
      range.setStartAfter(wpSpan);
      range.insertNode(space);
      range.setStartAfter(space);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    toast.success(`WP${wpNumber} reference inserted`);
  }, []);

  const insertParticipantRefAtCursor = useCallback((participantNumber: number, shortName: string, participantId: string) => {
    restoreSelection();
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
      partSpan.style.fontStyle = 'italic';
      partSpan.style.fontSize = '11pt';
      partSpan.style.lineHeight = '1';
      partSpan.style.verticalAlign = 'baseline';
      partSpan.style.display = 'inline-flex';
      partSpan.style.alignItems = 'center';
      partSpan.style.whiteSpace = 'nowrap';
      partSpan.style.userSelect = 'none';
      range.insertNode(partSpan);
      // Insert trailing space and move cursor after it
      const space = document.createTextNode(' ');
      range.setStartAfter(partSpan);
      range.insertNode(space);
      range.setStartAfter(space);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    toast.success(`${shortName} reference inserted`);
  }, []);
  
  const insertFigureAtCursor = useCallback((figure: any) => {
    restoreSelection();
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
    }
    toast.success(`Figure reference inserted`);
  }, []);

  // Handle Task reference insertion (contentEditable) - pill bubble
  const insertTaskRefAtCursor = useCallback((task: { id: string; wp_number: number; number: number; title: string }) => {
    restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const span = document.createElement('span');
      span.textContent = `T${task.wp_number}.${task.number}`;
      span.setAttribute('contenteditable', 'false');
      span.setAttribute('data-task-id', task.id);
      Object.assign(span.style, { display: 'inline-flex', alignItems: 'center', height: '17px', padding: '0 4px', borderRadius: '9999px', border: '1.5px solid #000', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: '700', lineHeight: '1', whiteSpace: 'nowrap', verticalAlign: 'baseline', userSelect: 'none' });
      range.insertNode(span);
      const space = document.createTextNode(' ');
      range.setStartAfter(span);
      range.insertNode(space);
      range.setStartAfter(space);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    toast.success(`T${task.wp_number}.${task.number} reference inserted`);
  }, []);

  // Handle Deliverable reference insertion - pentagon bubble matching 3.1.c
  const insertDeliverableRefAtCursor = useCallback((del: { id: string; number: string; name: string }) => {
    restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const label = del.number;
      const textWidth = Math.max(36, label.length * 8 + 8);
      const totalWidth = textWidth + 8;
      const wrapper = document.createElement('span');
      wrapper.setAttribute('contenteditable', 'false');
      wrapper.setAttribute('data-deliverable-id', del.id);
      Object.assign(wrapper.style, { display: 'inline-block', verticalAlign: 'baseline', position: 'relative', width: `${totalWidth}px`, height: '17px', userSelect: 'none' });
      wrapper.innerHTML = `<svg width="${totalWidth}" height="17" viewBox="0 0 ${totalWidth} 17" style="position:absolute;top:0;left:0;overflow:visible;"><path d="M 0,0 L ${textWidth},0 L ${totalWidth},8.5 L ${textWidth},17 L 0,17 Z" fill="#ffffff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg><span style="position:absolute;top:0;left:0;width:${textWidth}px;height:17px;display:flex;align-items:center;justify-content:center;font-family:'Times New Roman',Times,serif;font-size:11pt;font-weight:700;line-height:1;color:#000;white-space:nowrap;">${label}</span>`;
      range.insertNode(wrapper);
      const space = document.createTextNode(' ');
      range.setStartAfter(wrapper);
      range.insertNode(space);
      range.setStartAfter(space);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    toast.success(`${del.number} reference inserted`);
  }, []);

  // Handle Milestone reference insertion - triangle bubble matching 3.1.d
  const insertMilestoneRefAtCursor = useCallback((ms: { id: string; number: number; name: string }) => {
    restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const wrapper = document.createElement('span');
      wrapper.setAttribute('contenteditable', 'false');
      wrapper.setAttribute('data-milestone-id', ms.id);
      Object.assign(wrapper.style, { display: 'inline-block', verticalAlign: 'baseline', position: 'relative', width: '21px', height: '21px', userSelect: 'none' });
      wrapper.innerHTML = `<svg width="21" height="21" viewBox="0 0 21 21" style="position:absolute;top:0;left:0;overflow:visible;"><path d="M 0,0 L 21,10.5 L 0,21 Z" fill="#000000"/></svg><span style="position:absolute;top:0;left:-1px;width:15px;height:21px;display:flex;align-items:center;justify-content:center;font-family:'Times New Roman',Times,serif;font-size:11pt;font-weight:700;line-height:1;color:#ffffff;letter-spacing:-0.7px;white-space:nowrap;">${ms.number}</span>`;
      range.insertNode(wrapper);
      const space = document.createTextNode(' ');
      range.setStartAfter(wrapper);
      range.insertNode(space);
      range.setStartAfter(space);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    toast.success(`MS${ms.number} reference inserted`);
  }, []);

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
        {/* Top Toolbar Row - Guidelines + Formatting */}
        <div className="p-2 border rounded-md bg-card sticky top-0 z-10 space-y-1.5">
          {/* Row 1: Guidelines + Save */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGuidelinesDialogOpen(true)}
              className="h-7 px-2 text-xs gap-1 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Guidelines
            </Button>
            <SaveIndicator
              saving={saving}
              lastSaved={lastSaved}
              saveError={saveError}
              onSaveNow={() => {}}
            />
          </div>
          {/* Row 2: Formatting toolbar */}
          <div className="flex items-center gap-0.5 flex-wrap">

          {/* Undo / Redo */}
          {!readOnly && (
            <>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={!canUndo}
                    onClick={handleUndo}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">{undoLabel}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={!canRedo}
                    onClick={handleRedo}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">{redoLabel}</TooltipContent>
              </Tooltip>
            </>
          )}
          
          <Separator orientation="vertical" className="h-5 mx-1.5" />
          
          {/* Subheading */}
          {!readOnly && (
            <>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1">
                        <span className="text-xs font-black underline">Subheading</span>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Insert subheading</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuItem onClick={() => {
                    const wpNum = wpDraft?.number || 1;
                    const editorEl = document.activeElement?.closest('[contenteditable]') as HTMLElement | null;
                    const h3s = editorEl?.querySelectorAll('h3') || [];
                    const nextNum = h3s.length + 1;
                    document.execCommand('formatBlock', false, 'h3');
                    document.execCommand('insertText', false, `1.3.${wpNum}.${nextNum}. `);
                  }}>
                    <span className="text-sm font-semibold">Numbered subheading</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    execCommand('bold');
                    execCommand('underline');
                  }}>
                    <span className="text-sm font-bold underline">Unnumbered subheading</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Bold, Italic, Underline */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('bold')}>
                    <span className="font-black text-sm">B</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Bold (Ctrl+B)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('italic')}>
                    <Italic className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Italic (Ctrl+I)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('underline')}>
                    <Underline className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Underline (Ctrl+U)</TooltipContent>
              </Tooltip>
              
              <Separator orientation="vertical" className="h-5 mx-1.5" />
              
              {/* Lists */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('insertUnorderedList')}>
                    <List className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Bullet list</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('insertOrderedList')}>
                    <ListOrdered className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Numbered list</TooltipContent>
              </Tooltip>
              
              <Separator orientation="vertical" className="h-5 mx-1.5" />
              
              {/* Alignment */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyLeft')}>
                    <AlignLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Align left</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyCenter')}>
                    <AlignCenter className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Align center</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyRight')}>
                    <AlignRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Align right</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyFull')}>
                    <AlignJustify className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Justify</TooltipContent>
              </Tooltip>
              
              <Separator orientation="vertical" className="h-5 mx-1.5" />
              
              {/* Table */}
              <Popover open={tablePopoverOpen} onOpenChange={setTablePopoverOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1">
                        <Table2 className="h-4 w-4" />
                        <span className="text-xs">Table</span>
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Insert table</TooltipContent>
                </Tooltip>
                <PopoverContent className="w-auto p-2" align="start">
                  <div className="text-xs text-muted-foreground mb-2">
                    {hoveredCell ? `${hoveredCell.row} × ${hoveredCell.col}` : 'Select size'}
                  </div>
                  <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                    {Array.from({ length: 8 }, (_, row) =>
                      Array.from({ length: 8 }, (_, col) => {
                        const isHighlighted = hoveredCell && row < hoveredCell.row && col < hoveredCell.col;
                        const isFirstRow = row === 0;
                        return (
                          <button
                            key={`${row}-${col}`}
                            className={cn(
                              "w-4 h-4 border border-border rounded-sm transition-colors",
                              isHighlighted
                                ? isFirstRow
                                  ? "bg-foreground"
                                  : "bg-primary/40"
                                : "bg-background hover:bg-muted"
                            )}
                            onMouseEnter={() => setHoveredCell({ row: row + 1, col: col + 1 })}
                            onMouseLeave={() => setHoveredCell(null)}
                            onClick={() => insertTable(row + 1, col + 1)}
                          />
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* Figure */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setIsFigureDialogOpen(true)} onMouseDown={saveSelection}>
                    <ImageIcon className="h-4 w-4" />
                    <span className="text-xs">Figure</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Insert figure</TooltipContent>
              </Tooltip>
              
              {/* Citations */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setIsCitationOpen(true)} onMouseDown={saveSelection}>
                    <FileText className="h-4 w-4" />
                    <span className="text-xs">Citations</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Manage citations</TooltipContent>
              </Tooltip>
              
              {/* Cross-ref dropdown */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onMouseDown={saveSelection}>
                        <Link2 className="w-4 h-4" />
                        <span className="text-xs">Cross-ref</span>
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Insert cross-reference</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="w-64 bg-popover z-50">
                  <DropdownMenuItem onClick={() => setIsCrossRefOpen(true)} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0"><ImageIcon className="w-3.5 h-3.5 text-foreground" /></span>
                    <span>Figure / Table number</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsWPRefOpen(true)} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0">
                      <span style={{ display: 'inline-block', width: '22px', height: '14px', backgroundColor: '#2563EB', border: '1.5px solid #2563EB', borderRadius: '9999px' }} />
                    </span>
                    <span>Work package</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsTaskRefOpen(true)} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0">
                      <span style={{ display: 'inline-block', width: '22px', height: '14px', borderRadius: '9999px', border: '1.5px solid #2563EB', background: '#ffffff' }} />
                    </span>
                    <span>Task</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsDeliverableRefOpen(true)} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0">
                      <span style={{ display: 'inline-block', width: '22px', height: '14px', background: '#2563EB', clipPath: 'polygon(0% 0%, calc(100% - 6px) 0%, 100% 50%, calc(100% - 6px) 100%, 0% 100%)', position: 'relative' }}>
                        <span style={{ position: 'absolute', inset: '1.5px', right: '2px', background: '#ffffff', clipPath: 'polygon(0% 0%, calc(100% - 5px) 0%, 100% 50%, calc(100% - 5px) 100%, 0% 100%)' }} />
                      </span>
                    </span>
                    <span>Deliverable</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsParticipantRefOpen(true)} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0">
                      <span style={{ display: 'inline-block', width: '22px', height: '14px', backgroundColor: '#000000', border: '1.5px solid #000000', borderRadius: '9999px' }} />
                    </span>
                    <span>Participant</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

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
                hideMilestone
              />
            </>
          )}
          </div>
        </div>

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
                            className="inline-flex items-center rounded-full font-bold italic whitespace-nowrap"
                            style={{ backgroundColor: '#000000', color: '#FFFFFF', border: '1.5px solid #000000', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, fontStyle: 'italic', lineHeight: 1, verticalAlign: 'baseline', padding: '0px 5px', height: '17px' }}
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

        {/* Objectives & Ambition + Methodologies Sections */}
        <WPMethodologySection
          backgroundKnowledge={wpDraft.background_knowledge}
          onBackgroundKnowledgeChange={(value) => updateField('background_knowledge', value)}
          approachSummary={wpDraft.approach_summary}
          onApproachSummaryChange={(value) => updateField('approach_summary', value)}
          methodologiesList={wpDraft.methodologies_list}
          onMethodologiesListChange={(value) => updateField('methodologies_list', value)}
          foreseenChallenges={wpDraft.foreseen_challenges}
          onForeseenChallengesChange={(value) => updateField('foreseen_challenges', value)}
          readOnly={readOnly}
          hideToolbar={true}
        />

        {/* WP Table (Objectives & Tasks) */}
        <WPTableSection
          wpNumber={wpDraft.number}
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
          wpNumber={wpDraft.number}
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
          currentWpDraftId={wpDraft.id}
        />

        {/* Task Interactions & Bottlenecks */}
        <WPPlanningQuestions
          inputs={wpDraft.inputs_question}
          outputs={wpDraft.outputs_question}
          bottlenecks={wpDraft.bottlenecks_question}
          onInputsChange={(value) => updateField('inputs_question', value)}
          onOutputsChange={(value) => updateField('outputs_question', value)}
          onBottlenecksChange={(value) => updateField('bottlenecks_question', value)}
          readOnly={readOnly}
        />

        {/* Milestones */}
        <WPMilestonesTable
          wpNumber={wpDraft.number}
          milestones={wpDraft.milestones || []}
          onMilestoneUpdate={updateMilestone}
          onMilestoneAdd={addMilestone}
          onMilestoneDelete={deleteMilestone}
          onMilestoneReorder={reorderMilestones}
          readOnly={readOnly}
          projectDuration={projectDuration}
          allWpDrafts={wpDrafts}
        />

        {/* Risks */}
        <WPRisksTable
          wpNumber={wpDraft.number}
          risks={wpDraft.risks || []}
          onRiskUpdate={updateRisk}
          onRiskAdd={addRisk}
          onRiskDelete={deleteRisk}
          onRiskReorder={reorderRisks}
          readOnly={readOnly}
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
      />
      
      {/* Cross-reference Dialog */}
      <InsertCrossReferenceDialog
        isOpen={isCrossRefOpen}
        onClose={() => setIsCrossRefOpen(false)}
        proposalId={proposalId}
        sectionNumber=""
        onInsert={insertCrossRefAtCursor}
      />
      
      {/* WP Reference Dialog */}
      <InsertWPReferenceDialog
        open={isWPRefOpen}
        onOpenChange={setIsWPRefOpen}
        proposalId={proposalId}
        onSelect={(wp) => {
          insertWPRefAtCursor(wp.number, wp.short_name || '', wp.color || '#3b82f6', wp.id);
          setIsWPRefOpen(false);
        }}
      />
      
      {/* Participant Reference Dialog */}
      <InsertParticipantReferenceDialog
        open={isParticipantRefOpen}
        onOpenChange={setIsParticipantRefOpen}
        proposalId={proposalId}
        onSelect={(participant) => {
          insertParticipantRefAtCursor(participant.participantNumber, participant.shortName, participant.id);
          setIsParticipantRefOpen(false);
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
