import { useEffect, useState, useCallback, useMemo } from 'react';
import { useWPDraftEditor } from '@/hooks/useWPDrafts';
import { WPMethodologySection } from '@/components/WPMethodologySection';
import { WPTableSection } from '@/components/WPTableSection';
import { WPPlanningQuestions } from '@/components/WPPlanningQuestions';
import { WPEffortMatrix } from '@/components/WPEffortMatrix';
import { WPDeliverablesTable } from '@/components/WPDeliverablesTable';
import { WPRisksTable } from '@/components/WPRisksTable';
import { WPMilestonesTable } from '@/components/WPMilestonesTable';
import { CitationDialog } from '@/components/CitationDialog';
import { InsertCrossReferenceDialog } from '@/components/InsertCrossReferenceDialog';
import { InsertWPReferenceDialog } from '@/components/InsertWPReferenceDialog';
import { InsertParticipantReferenceDialog } from '@/components/InsertParticipantReferenceDialog';
import { InsertFigureDialog } from '@/components/InsertFigureDialog';
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
  Layers, Building2, Table2, ImageIcon 
} from 'lucide-react';
import { getContrastingTextColor } from '@/lib/wpColors';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { ParticipantSummary } from '@/types/proposal';

interface WPDraftEditorProps {
  wpId: string;
  proposalId: string;
  canEdit: boolean;
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

export function WPDraftEditor({ wpId, proposalId, canEdit, projectDuration = 36 }: WPDraftEditorProps) {
  const {
    wpDraft,
    loading,
    saving,
    updateField,
    addTask,
    updateTask,
    deleteTask,
    reorderTasks,
    updateTaskEffort,
    setTaskParticipants,
    addDeliverable,
    updateDeliverable,
    deleteDeliverable,
    reorderDeliverables,
    addRisk,
    updateRisk,
    deleteRisk,
    reorderRisks,
    addMilestone,
    updateMilestone,
    deleteMilestone,
    reorderMilestones,
  } = useWPDraftEditor(wpId);

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
  const [figures, setFigures] = useState<any[]>([]);
  const [wpDrafts, setWpDrafts] = useState<any[]>([]);
  
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
  
  const insertCrossRefAtCursor = useCallback((refText: string) => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const refSpan = document.createElement('span');
      refSpan.textContent = refText;
      refSpan.style.color = 'blue';
      refSpan.style.textDecoration = 'underline';
      range.insertNode(refSpan);
      range.setStartAfter(refSpan);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    toast.success('Cross-reference inserted');
  }, []);
  
  const insertWPRefAtCursor = useCallback((wpNumber: number, wpShortName: string, wpColor: string, wpId: string) => {
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
        .select('id, number, short_name, title')
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
        <div className="flex items-center gap-2 p-2 border rounded-md bg-card flex-wrap sticky top-0 z-10">
          {/* Guidelines Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGuidelinesDialogOpen(true)}
            className="h-7 px-2 text-xs gap-1 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Guidelines
          </Button>
          
          <Separator orientation="vertical" className="h-5" />
          
          {/* Subheading */}
          {!readOnly && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => { execCommand('bold'); execCommand('underline'); }}
                  >
                    <span className="text-xs font-black underline">Subheading</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Subheading (Bold & Underlined)</TooltipContent>
              </Tooltip>
              
              <Separator orientation="vertical" className="h-5" />
              
              {/* Bold, Italic, Underline */}
              <div className="flex items-center gap-0.5">
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
              </div>
              
              <Separator orientation="vertical" className="h-5" />
              
              {/* Lists */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('insertUnorderedList')}>
                      <List className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Bullet List</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('insertOrderedList')}>
                      <ListOrdered className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Numbered List</TooltipContent>
                </Tooltip>
              </div>
              
              <Separator orientation="vertical" className="h-5" />
              
              {/* Alignment */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyLeft')}>
                      <AlignLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Align Left</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyCenter')}>
                      <AlignCenter className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Align Center</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyRight')}>
                      <AlignRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Align Right</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('justifyFull')}>
                      <AlignJustify className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Justify</TooltipContent>
                </Tooltip>
              </div>
              
              <Separator orientation="vertical" className="h-5" />
              
              {/* Insert tools */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setIsCitationOpen(true)}>
                      <FileText className="h-3.5 w-3.5" />
                      <span className="text-xs">Citation</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Add Citation</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setIsCrossRefOpen(true)}>
                      <Link2 className="h-3.5 w-3.5" />
                      <span className="text-xs">Cross-ref</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Insert Cross-reference</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setIsWPRefOpen(true)}>
                      <Layers className="h-3.5 w-3.5" />
                      <span className="text-xs">WP</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Insert WP Reference</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setIsParticipantRefOpen(true)}>
                      <Building2 className="h-3.5 w-3.5" />
                      <span className="text-xs">Partner</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Insert Partner Reference</TooltipContent>
                </Tooltip>
                <Popover open={tablePopoverOpen} onOpenChange={setTablePopoverOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1">
                          <Table2 className="h-3.5 w-3.5" />
                          <span className="text-xs">Table</span>
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Insert Table</TooltipContent>
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setIsFigureDialogOpen(true)}>
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span className="text-xs">Figure</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Insert Figure</TooltipContent>
                </Tooltip>
              </div>
            </>
          )}
        </div>

        {/* Header with color */}
        <div 
          className="rounded-lg p-4 -mx-2"
          style={{ 
            backgroundColor: effectiveColor,
            color: '#FFFFFF',
          }}
        >
          {/* WPX: Title */}
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">WP{wpDraft.number}:</span>
            <DebouncedInput
              value={wpDraft.title || ''}
              onDebouncedChange={(v) => updateField('title', v)}
              placeholder="Work package title"
              className="bg-white/90 text-foreground flex-1"
              disabled={readOnly}
            />
          </div>
          
          {/* Short name, Lead partner, and Duration */}
          <div className="mt-2 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm opacity-80">Short name:</span>
              <DebouncedInput
                value={wpDraft.short_name || ''}
                onDebouncedChange={(v) => updateField('short_name', v)}
                placeholder="e.g. COORD"
                className="bg-white/90 text-foreground h-7 w-[140px] text-sm"
                disabled={readOnly}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm opacity-80">Lead:</span>
              <Select
                value={wpDraft.lead_participant_id || ''}
                onValueChange={(value) => updateField('lead_participant_id', value || null)}
                disabled={readOnly}
              >
                <SelectTrigger className="bg-white/90 text-foreground h-7 w-[160px] text-sm">
                  <SelectValue placeholder="Select lead..." />
                </SelectTrigger>
                <SelectContent>
                  {participants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.organisation_short_name || p.organisation_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Auto-calculated duration from tasks */}
            {(() => {
              const tasks = wpDraft.tasks || [];
              const taskStartMonths = tasks.filter(t => t.start_month !== null && t.start_month !== undefined).map(t => t.start_month!);
              const taskEndMonths = tasks.filter(t => t.end_month !== null && t.end_month !== undefined).map(t => t.end_month!);
              const hasAllTiming = tasks.length > 0 && taskStartMonths.length === tasks.length && taskEndMonths.length === tasks.length;
              
              if (hasAllTiming) {
                const startMonth = Math.min(...taskStartMonths);
                const endMonth = Math.max(...taskEndMonths);
                const formatMonth = (m: number) => `M${m.toString().padStart(2, '0')}`;
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-sm opacity-80">Duration:</span>
                    <span className="text-sm font-medium">
                      {formatMonth(startMonth)}–{formatMonth(endMonth)}
                    </span>
                  </div>
                );
              } else if (taskStartMonths.length > 0 || taskEndMonths.length > 0) {
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-sm opacity-80">Duration:</span>
                    <span className="text-xs opacity-60 italic">Add dates to all tasks</span>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Guidelines Dialog */}
        <Dialog open={guidelinesDialogOpen} onOpenChange={setGuidelinesDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] w-[90vw]">
            <DialogHeader>
              <DialogTitle>Guidelines for WP{wpDraft.number}: {wpDraft.title || wpDraft.short_name || 'Work Package'}</DialogTitle>
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

        {/* Methodology Section */}
        <WPMethodologySection
          methodology={wpDraft.methodology}
          onChange={(value) => updateField('methodology', value)}
          readOnly={readOnly}
          hideToolbar={true}
        />

        {/* WP Table (Objectives & Tasks) */}
        <WPTableSection
          wpNumber={wpDraft.number}
          objectives={wpDraft.objectives}
          tasks={wpDraft.tasks || []}
          participants={participants}
          onObjectivesChange={(value) => updateField('objectives', value)}
          onTaskUpdate={updateTask}
          onTaskAdd={addTask}
          onTaskDelete={deleteTask}
          onTaskParticipantsChange={setTaskParticipants}
          onTaskReorder={reorderTasks}
          readOnly={readOnly}
          projectDuration={projectDuration}
          hideToolbar={true}
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
          readOnly={readOnly}
          projectDuration={projectDuration}
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
        />

        {/* Staff Effort Matrix */}
        <WPEffortMatrix
          wpNumber={wpDraft.number}
          tasks={wpDraft.tasks || []}
          participants={participants}
          onEffortChange={updateTaskEffort}
          readOnly={readOnly}
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
        content=""
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
