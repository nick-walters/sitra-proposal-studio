import { TextSelection } from '@tiptap/pm/state';
import { Section } from "@/types/proposal";
import { supabase } from "@/integrations/supabase/client";
import DOMPurify from "dompurify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, BookOpen, Route, History, Info, Image, Lock, Unlock, MessageSquare, PanelRightClose, PanelRight, UserPlus, CalendarClock, User, FileText, X, Search, GitCompare, Keyboard, Wand2, FileCode, SplitSquareHorizontal, Layers, Building2, FlaskConical, Check, Link2, Table2 } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { FormattingToolbar, useRichTextEditor } from "./RichTextEditor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditorContent } from "@tiptap/react";

import { CitationDialog } from "./CitationDialog";
import { InsertFigureDialog } from "./InsertFigureDialog";
import { InsertCrossReferenceDialog } from "./InsertCrossReferenceDialog";
import { InsertWPReferenceDialog } from "./InsertWPReferenceDialog";
import { InsertCaseReferenceDialog } from "./InsertCaseReferenceDialog";
import { InsertParticipantReferenceDialog } from "./InsertParticipantReferenceDialog";
import { InsertTDMSReferenceDropdowns } from "./InsertTDMSReferenceDropdowns";
import { CommentsSidebar } from "./CommentsSidebar";
import { SectionAssignmentDialog } from "./SectionAssignmentDialog";
import { ImpactPathwayGenerator } from "./ImpactPathwayGenerator";
import { SectionVersionHistoryDialog } from "./SectionVersionHistoryDialog";
import { GuidelinesDialog } from "./GuidelinesDialog";
import { SaveIndicator } from "./SaveIndicator";
import { useSectionContent } from "@/hooks/useSectionContent";
import { useSectionLocking } from "@/hooks/useSectionLocking";
import { useSectionAssignment } from "@/hooks/useSectionAssignment";
import { useCollaborativeCursors } from "@/hooks/useCollaborativeCursors";
import { useBlockLocking } from "@/hooks/useBlockLocking";
import { renumberFootnotes } from "@/lib/captionRenumbering";
import { syncCrossReferences } from "@/lib/syncCrossReferences";
import { renumberCaptionsInEditor } from "@/lib/renumberCaptionsInEditor";
import { useProposalReferences } from "@/hooks/useProposalReferences";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { CollaborativeCursors } from "./CollaborativeCursors";
import { BlockLockIndicator } from "./BlockLockIndicator";
import { TrackChangesToolbar } from "./TrackChangesToolbar";
import { TrackChangeTooltip } from "./TrackChangeTooltip";
import { SearchReplaceDialog } from "./SearchReplaceDialog";
import { TableFormulaDialog } from "./TableFormulaDialog";
import { VersionComparisonDialog } from "./VersionComparisonDialog";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import { WritingAssistantDialog } from "./WritingAssistantDialog";
import { SnippetsDialog } from "./SnippetsDialog";
import { SplitViewPanel } from "./SplitViewPanel";
import { B31DeliverablesTable, B31MilestonesTable, B31RisksTable } from "./B31TablesEditor";
import { B31SectionContent } from "./B31SectionContent";
import { TrackChange } from "@/extensions/TrackChanges";
// usePageEstimate moved to ExportDialog
import { EditorZoomBar } from "./EditorZoomBar";
import { useAuth } from "@/hooks/useAuth";
import { useTrackedChanges } from "@/hooks/useTrackedChanges";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Reference {
  authors: string[];
  year: number | null;
  title: string;
  journal: string | null;
  volume: string | null;
  pages: string | null;
  doi: string | null;
}

interface DocumentEditorProps {
  section: Section | null;
  proposalId: string;
  proposalAcronym: string;
  proposalTitle?: string;
  proposalType?: string;
  topicTitle?: string;
  readOnly?: boolean;
  topicId?: string;
  topicUrl?: string;
  workProgramme?: string;
  destination?: string;
  allSections?: Section[];
  acronymSegments?: { text: string; color: string }[];
}

export function DocumentEditor({ 
  section, 
  proposalId, 
  proposalAcronym, 
  proposalTitle,
  proposalType,
  topicTitle,
  readOnly = false,
  topicId,
  topicUrl,
  workProgramme,
  destination,
  allSections = [],
  acronymSegments,
}: DocumentEditorProps) {
  const { user } = useAuth();
  const [isCitationOpen, setIsCitationOpen] = useState(false);
  const [isFigureDialogOpen, setIsFigureDialogOpen] = useState(false);
  const [isCrossRefOpen, setIsCrossRefOpen] = useState(false);
  const [isImpactPathwayOpen, setIsImpactPathwayOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
  const [collaborationTab, setCollaborationTab] = useState<'comments' | 'changes'>('comments');
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | undefined>();
  const [footnotes, setFootnotes] = useState<Array<{ number: number; citation: string }>>([]);
  
  // Proposal-wide references hook
  const { 
    references: proposalReferences, 
    isLoading: isLoadingReferences, 
    addReference,
    findExistingReference,
    getNextCitationNumber 
  } = useProposalReferences(proposalId);
  
  // Track changes persistence hook — remember last setting per user, default ON
  const [trackChangesEnabled, setTrackChangesEnabled] = useState(() => {
    if (!user?.id) return true;
    const stored = localStorage.getItem(`track-changes-${user.id}`);
    return stored !== null ? stored === 'true' : true;
  });
  const handleSetTrackChangesEnabled = useCallback((enabled: boolean) => {
    setTrackChangesEnabled(enabled);
    if (user?.id) {
      localStorage.setItem(`track-changes-${user.id}`, String(enabled));
    }
  }, [user?.id]);
  const [zoomLevel, setZoomLevel] = useState(100);
  const {
    changes: trackedChanges,
    loading: trackChangesLoading,
    handleChangesUpdate: setTrackedChanges,
  } = useTrackedChanges({
    proposalId: proposalId || '',
    sectionId: section?.id || '',
    enabled: trackChangesEnabled,
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFormulaOpen, setIsFormulaOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isWritingAssistantOpen, setIsWritingAssistantOpen] = useState(false);
  const [isSnippetsOpen, setIsSnippetsOpen] = useState(false);
  const [isSplitViewOpen, setIsSplitViewOpen] = useState(false);
  const [deleteBlockConfirm, setDeleteBlockConfirm] = useState<{ isOpen: boolean; onConfirm: () => void } | null>(null);
  const [isWPRefOpen, setIsWPRefOpen] = useState(false);
  const [isParticipantRefOpen, setIsParticipantRefOpen] = useState(false);
  const [isCaseRefOpen, setIsCaseRefOpen] = useState(false);
  const [crossRefFilterType, setCrossRefFilterType] = useState<'figure' | 'table' | undefined>(undefined);
  const [isTaskRefOpen, setIsTaskRefOpen] = useState(false);
  const [isDeliverableRefOpen, setIsDeliverableRefOpen] = useState(false);
  const [isMilestoneRefOpen, setIsMilestoneRefOpen] = useState(false);
  const [hasCases, setHasCases] = useState(false);
  
  // Editor container ref for cursor overlays
  const editorContainerRef = useRef<HTMLDivElement>(null);
  
  // Collaborative cursors hook
  const { 
    collaboratorsInSection, 
    updateCursorPosition,
    getColorForUser 
  } = useCollaborativeCursors({
    proposalId: proposalId || '',
    currentSectionId: section?.id || null,
  });

  // Create a temporary editor ref for block locking initialization
  const editorRef = useRef<any>(null);

  // Get user color for track changes
  const userColor = user ? getColorForUser(user.id) : '#3B82F6';
  // Use the section content hook for database persistence and real-time updates
  // IMPORTANT: Always call hooks with the same parameters to avoid "rendered more hooks" error
  const sectionContentHook = useSectionContent({
    proposalId: proposalId || '',
    sectionId: section?.id || '',
    sectionNumber: section?.number,
    placeholderContent: section?.placeholderContent,
  });
  
  // Use section locking hook
  const sectionLockingHook = useSectionLocking({
    proposalId: proposalId || '',
    sectionId: section?.id || '',
  });

  // Use section assignment hook
  const sectionAssignmentHook = useSectionAssignment({
    proposalId: proposalId || '',
    sectionId: section?.number || '',
  });

  const { 
    isLocked, 
    lockedByName, 
    lockedAt, 
    lockReason, 
    canManageLock,
    canEditWhenLocked,
    isLockedByMe, 
    toggleLock, 
    updating: lockUpdating 
  } = sectionLockingHook;

  const {
    assignmentInfo,
    teamMembers,
    canManageAssignment,
    isAssignedToMe,
    assignSection,
    clearAssignment,
    updating: assignmentUpdating,
  } = sectionAssignmentHook;

  // Determine if section is effectively read-only (prop or locked)
  // Admins/owners can always edit locked sections
  const isEffectivelyReadOnly = readOnly || (isLocked && !canEditWhenLocked);

  // Helper to get due date display info
  const getDueDateInfo = () => {
    if (!assignmentInfo.dueDate) return null;
    const dueDate = new Date(assignmentInfo.dueDate);
    const isOverdue = isPast(dueDate) && !isToday(dueDate);
    const daysUntil = differenceInDays(dueDate, new Date());
    const isDueSoon = daysUntil >= 0 && daysUntil <= 3;
    return { dueDate, isOverdue, isDueSoon, daysUntil };
  };

  const dueDateInfo = getDueDateInfo();

  const { content, setContent, loading, saving, lastSaved, lastCitationMapping, isPlaceholder, clearPlaceholder } = sectionContentHook;

  // Track unsaved changes: content changed since last save
  const lastSavedContentRef = useRef<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  useEffect(() => {
    if (lastSaved) {
      lastSavedContentRef.current = content;
      setHasUnsavedChanges(false);
    }
  }, [lastSaved]);
  
  useEffect(() => {
    if (lastSavedContentRef.current && content !== lastSavedContentRef.current) {
      setHasUnsavedChanges(true);
    }
  }, [content]);

  // Sync footnotes when citations are renumbered
  useEffect(() => {
    if (lastCitationMapping && lastCitationMapping.size > 0 && footnotes.length > 0) {
      const renumberedFootnotes = renumberFootnotes(footnotes, lastCitationMapping);
      // Only update if there's an actual change
      const hasChanges = renumberedFootnotes.some((fn, idx) => 
        fn.number !== footnotes[idx]?.number || fn.citation !== footnotes[idx]?.citation
      );
      if (hasChanges) {
        setFootnotes(renumberedFootnotes);
      }
    }
  }, [lastCitationMapping]);

  // Helper to get reference by citation number for tooltip display
  const getReference = useCallback((citationNumber: number) => {
    const footnote = footnotes.find(fn => fn.number === citationNumber);
    return footnote ? { citation: footnote.citation } : undefined;
  }, [footnotes]);

  // Block locking refs for editor integration
  const blockLocksRef = useRef<Map<string, { userId: string; blockId: string; blockType: string }>>(new Map());
  const getLockedBlocksForEditor = useCallback(() => {
    return Array.from(blockLocksRef.current.values());
  }, []);
  const getCurrentUserIdForEditor = useCallback(() => user?.id || null, [user?.id]);

  // Use the editor hook for external toolbar control with citation tooltips
  const editor = useRichTextEditor({
    content,
    onChange: isEffectivelyReadOnly ? () => {} : (newContent) => setContent(newContent),
    getReference,
    trackChanges: {
      enabled: trackChangesEnabled,
      authorId: user?.id || '',
      authorName: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Anonymous',
      authorColor: userColor,
      onChangesUpdate: setTrackedChanges,
    },
    blockLocking: {
      getLockedBlocks: getLockedBlocksForEditor,
      getCurrentUserId: getCurrentUserIdForEditor,
    },
    onBlockDeleteRequest: (deleteCallback) => {
      setDeleteBlockConfirm({
        isOpen: true,
        onConfirm: () => {
          deleteCallback();
          setDeleteBlockConfirm(null);
        },
      });
    },
  });

  // Sync cross-references when editor content loads, section changes, or external data changes
  const [syncTrigger, setSyncTrigger] = useState(0);
  
  useEffect(() => {
    const handleCrossRefDataChanged = () => setSyncTrigger(prev => prev + 1);
    const handleBlockReordered = () => {
      // Renumber captions first, then sync cross-references
      if (editor && section?.number) {
        renumberCaptionsInEditor(editor, section.number);
      }
      setSyncTrigger(prev => prev + 1);
    };
    window.addEventListener('cross-ref-data-changed', handleCrossRefDataChanged);
    window.addEventListener('block-reordered', handleBlockReordered);
    return () => {
      window.removeEventListener('cross-ref-data-changed', handleCrossRefDataChanged);
      window.removeEventListener('block-reordered', handleBlockReordered);
    };
  }, [editor, section?.number]);

  useEffect(() => {
    if (!editor || !proposalId || loading) return;
    const timer = setTimeout(() => {
      syncCrossReferences(editor, proposalId);
    }, 500);
    return () => clearTimeout(timer);
  }, [editor, proposalId, section?.id, loading, syncTrigger]);

  // Check if proposal has cases
  useEffect(() => {
    if (!proposalId) return;
    supabase
      .from('case_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('proposal_id', proposalId)
      .then(({ count }) => setHasCases((count ?? 0) > 0));
  }, [proposalId]);

  // Block locking hook - needs editor for position tracking
  const {
    blockLocks,
    updateCurrentBlock,
    getLockedBlocks,
  } = useBlockLocking({
    proposalId: proposalId || '',
    sectionId: section?.id || null,
    editor,
  });

  // Keep blockLocksRef in sync with blockLocks
  useEffect(() => {
    blockLocksRef.current = blockLocks;
  }, [blockLocks]);

  // Track cursor position for collaboration AND block locking
  useEffect(() => {
    if (!editor) return;
    
    const handleSelectionUpdate = () => {
      const { from, to } = editor.state.selection;
      // Update collaborative cursor position
      updateCursorPosition(
        { line: 0, ch: to }, // Use 'to' as cursor position
        from !== to ? { from, to } : null // Include selection range if text is selected
      );
      // Update block lock position
      updateCurrentBlock(from);
    };
    
    editor.on('selectionUpdate', handleSelectionUpdate);
    editor.on('focus', handleSelectionUpdate);
    
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
      editor.off('focus', handleSelectionUpdate);
    };
  }, [editor, updateCursorPosition, updateCurrentBlock]);

  // Keyboard shortcuts for dialogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+/ or Ctrl+? to open shortcuts dialog
      if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        setIsShortcutsOpen(true);
      }
      // Ctrl+F to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleInsertCitation = useCallback(async (reference: Reference, formattedCitation: string, citationNumber: number) => {
    if (!editor) return;
    
    // Insert superscript citation at cursor position
    editor.chain().focus().insertContent(`<sup>[${citationNumber}]</sup>`).run();
    
    // Check if this reference already exists in the proposal
    const existingRef = findExistingReference(reference);
    
    if (!existingRef) {
      // Add to database for proposal-wide tracking
      await addReference(reference, formattedCitation, citationNumber);
      // Update local footnotes
      setFootnotes(prev => [...prev, { number: citationNumber, citation: formattedCitation }]);
    }
  }, [editor, findExistingReference, addReference]);

  // Helper to extract section number without "B" prefix (e.g., "1.1" from "B1.1" or just "1.1")
  const getSectionNumberWithoutPrefix = useCallback((sectionNum: string) => {
    // Remove any letter prefix (B, A, etc.) from the section number
    return sectionNum.replace(/^[A-Za-z]+/, '');
  }, []);

  // Format section heading for display: "B1" -> "1.", "B1.1" -> "1.1."
  const formatSectionHeading = useCallback((sectionNum: string) => {
    // Remove letter prefix and add trailing period
    const numPart = sectionNum.replace(/^[A-Za-z]+/, '');
    return numPart ? `${numPart}.` : '';
  }, []);

  // Helper to get the next figure letter for the current section
  const getNextFigureLetter = useCallback((sectionNumber: string) => {
    // Count existing figures in content for this section (without B prefix)
    const cleanSectionNum = getSectionNumberWithoutPrefix(sectionNumber);
    const figurePattern = new RegExp(`Figure ${cleanSectionNum.replace('.', '\\.')}\\.([a-z])`, 'g');
    const matches = content.match(figurePattern) || [];
    const nextLetterCode = 'a'.charCodeAt(0) + matches.length;
    return String.fromCharCode(nextLetterCode);
  }, [content, getSectionNumberWithoutPrefix]);

  // Handle inserting a figure image into the document
  const handleInsertFigureImage = useCallback((figure: { figureNumber: string; title: string; content: any }) => {
    if (!editor) return;
    
    const imageUrl = figure.content?.imageUrl;
    if (!imageUrl) {
      // For non-image figures, just insert a reference
      editor.chain().focus().insertContent(
        `<span class="figure-reference text-primary cursor-pointer hover:underline">(see Figure ${figure.figureNumber})</span>`
      ).run();
      return;
    }
    
    // Check if there is any content before the cursor position (including empty paragraphs)
    const cursorPos = editor.state.selection.from;
    const hasContentBefore = cursorPos > 1; // pos 0 is doc start, pos 1 is inside first empty paragraph
    
    // Insert image and caption together
    const figureLabel = `Figure ${figure.figureNumber}`;
    
    // Build content array
    const contentToInsert: any[] = [];
    
    if (!hasContentBefore) {
      // No content at all before cursor — add an empty paragraph so figure isn't the first node
      contentToInsert.push({
        type: 'paragraph',
      });
    }
    
    // Add the figure image with default 100% width for proper PDF export
    contentToInsert.push({
      type: 'image',
      attrs: { src: imageUrl, alt: figure.title, widthPercent: 100, alignment: 'center' }
    });
    
    // Add the caption
    contentToInsert.push({
      type: 'paragraph',
      attrs: { class: 'figure-caption', textAlign: 'center' },
      content: [
        {
          type: 'text',
          marks: [{ type: 'italic' }, { type: 'bold' }],
          text: figureLabel + '.'
        },
        {
          type: 'text',
          marks: [{ type: 'italic' }],
          text: ' ' + (figure.title || '')
        }
      ]
    });
    
    editor.chain()
      .focus()
      .insertContent(contentToInsert)
      .run();
  }, [editor]);

  const handleApplyGrammarSuggestion = useCallback((original: string, replacement: string) => {
    setContent(content.replace(original, replacement));
  }, [content, setContent]);

  const handleInsertImpactContent = useCallback((impactContent: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(impactContent).run();
  }, [editor]);

  // Handle figure reference insertion (text link only)
  const handleInsertFigureReference = useCallback((figure: { figureNumber: string; title: string }) => {
    if (!editor) return;
    editor.chain().focus().insertContent(
      `<span class="figure-reference text-primary cursor-pointer hover:underline">(see Figure ${figure.figureNumber})</span>`
    ).run();
  }, [editor]);

  const handleRestoreVersion = useCallback((restoredContent: string) => {
    setContent(restoredContent);
  }, [setContent]);

  // Handle cross-reference insertion (figures/tables as marked bold italic)
  const handleInsertCrossRef = useCallback((payload: { refText: string; figureId?: string; tableKey?: string; refKind: 'figure' | 'table' }) => {
    if (!editor) return;
    // Use setTimeout to ensure Radix dialog has fully unmounted and released focus
    setTimeout(() => {
      editor.commands.focus();
      editor.commands.insertFigureTableReference({
        refText: payload.refText,
        figureId: payload.figureId,
        tableKey: payload.tableKey,
        refKind: payload.refKind,
      });

      // Insert a plain space (no marks) after the reference badge and
      // place the cursor right after it so subsequent typing is unstyled.
      const { tr, schema } = editor.state;
      const pos = tr.selection.from;
      const spaceNode = schema.text(' ');  // no marks → plain text
      tr.insert(pos, spaceNode);
      // Place cursor after the space we just inserted
      tr.setSelection(TextSelection.create(tr.doc, pos + 1));
      tr.setStoredMarks([]);
      editor.view.dispatch(tr);
    }, 150);
  }, [editor]);
  
  // Handle WP reference insertion
  const handleInsertWPRef = useCallback((wp: { id: string; number: number; short_name: string | null; color: string }) => {
    if (!editor) return;
    setTimeout(() => {
      editor.chain().focus().insertWPReference({
        wpNumber: wp.number,
        wpShortName: wp.short_name || '',
        wpColor: wp.color,
        wpId: wp.id,
      }).insertContent(' ').unsetBold().unsetItalic().run();
    }, 150);
  }, [editor]);
  
  // Handle Participant reference insertion
  const handleInsertParticipantRef = useCallback((participant: { id: string; participantNumber: number; shortName: string }) => {
    if (!editor) return;
    setTimeout(() => {
      editor.chain().focus().insertParticipantReference({
        participantNumber: participant.participantNumber,
        shortName: participant.shortName,
        participantId: participant.id,
      }).insertContent(' ').unsetBold().unsetItalic().run();
    }, 150);
  }, [editor]);
  
  // Handle Case reference insertion
  const handleInsertCaseRef = useCallback((caseItem: { id: string; number: number; short_name: string | null; color: string; case_type: string }) => {
    if (!editor) return;
    setTimeout(() => {
      editor.chain().focus().insertCaseReference({
        caseNumber: caseItem.number,
        caseShortName: caseItem.short_name || '',
        caseColor: caseItem.color,
        caseId: caseItem.id,
        caseType: caseItem.case_type,
      }).insertContent(' ').unsetBold().unsetItalic().run();
    }, 150);
  }, [editor]);

  // Handle Acronym reference insertion
  const handleInsertAcronymRef = useCallback(() => {
    if (!editor || !acronymSegments || acronymSegments.length === 0) return;
    // Use longer timeout — acronym is inserted from dropdown menu which needs time to unmount
    setTimeout(() => {
      editor.commands.insertAcronymReference({ segments: acronymSegments });

      // Insert a plain space and clear stored marks via direct transaction
      const { tr } = editor.state;
      const spaceNode = editor.schema.text(' ');
      tr.insert(tr.selection.from, spaceNode);
      tr.setSelection(TextSelection.near(tr.doc.resolve(tr.selection.from + 1)));
      tr.setStoredMarks([]);
      editor.view.dispatch(tr);

      // Schedule focus after dropdown fully unmounts
      requestAnimationFrame(() => {
        editor.commands.focus();
      });
    }, 200);
  }, [editor, acronymSegments]);

  // Handle Task reference insertion - pill bubble
  const handleInsertTaskRef = useCallback((task: { id: string; wp_number: number; number: number; title: string; wp_color?: string }) => {
    if (!editor) return;
    editor.chain().focus().insertTaskReference({
      wpNumber: task.wp_number,
      taskNumber: task.number,
      taskId: task.id,
      wpColor: task.wp_color || undefined,
    }).insertContent(' ').unsetBold().unsetItalic().run();
  }, [editor]);

  // Handle Deliverable reference insertion - pentagon bubble
  const handleInsertDeliverableRef = useCallback((del: { id: string; number: string; name: string; wp_color?: string }) => {
    if (!editor) return;
    editor.chain().focus().insertDeliverableReference({
      deliverableNumber: del.number,
      deliverableId: del.id,
      wpColor: del.wp_color || undefined,
    }).insertContent(' ').unsetBold().unsetItalic().run();
  }, [editor]);

  // Handle Milestone reference insertion - triangle bubble
  const handleInsertMilestoneRef = useCallback((ms: { id: string; number: number; name: string }) => {
    if (!editor) return;
    editor.chain().focus().insertMilestoneReference({
      milestoneNumber: ms.number,
      milestoneId: ms.id,
    }).insertContent(' ').unsetBold().unsetItalic().run();
  }, [editor]);

  const handleApplySuggestion = useCallback((originalText: string, suggestedText: string) => {
    if (!originalText || !suggestedText || !content) return;
    const newContent = content.replace(originalText, suggestedText);
    setContent(newContent);
  }, [content, setContent]);

  // Handle text selection for comments
  const handleTextSelection = useCallback(() => {
    if (!editor) return;
    
    const { from, to } = editor.state.selection;
    if (from === to) {
      // No selection
      setSelectedText('');
      setSelectionRange(undefined);
      return;
    }

    const text = editor.state.doc.textBetween(from, to, ' ');
    if (text.trim()) {
      setSelectedText(text);
      setSelectionRange({ start: from, end: to });
    }
  }, [editor]);

  // Track selection changes
  useEffect(() => {
    if (!editor) return;
    
    editor.on('selectionUpdate', handleTextSelection);
    return () => {
      editor.off('selectionUpdate', handleTextSelection);
    };
  }, [editor, handleTextSelection]);

  // Check if this is the B2.1 section (impact pathways)
  const isImpactSection = section?.id === 'b2-1' || section?.number === '2.1';
  // Strip HTML for grammar checking
  const plainText = content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

   // Page estimate removed - now shown in ExportDialog

  // State for collaboration panel - must be before early return
  const [isCollaborationPanelOpen, setIsCollaborationPanelOpen] = useState(true);

  if (!section) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Info className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground">Select a section to begin editing</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Choose a section from the navigation panel on the left
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
      {/* Fixed toolbar container */}
      <div className="sticky top-0 z-10 bg-background">
        {/* Row 1: Guidelines | Autosaved | Find | Split Compare | Lock History | Shortcuts Comments/Panel */}
        <div className="px-2 py-1 border-b border-border bg-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 px-2 text-xs gap-1 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setIsGuidelinesOpen(true)}
              >
                <Info className="w-3 h-3" />
                Guidelines
              </Button>
              
              <Separator orientation="vertical" className="h-4 mx-1" />
              
              {!isEffectivelyReadOnly && <SaveIndicator saving={saving} lastSaved={lastSaved} hasUnsavedChanges={hasUnsavedChanges} />}
              
              <Separator orientation="vertical" className="h-4 mx-1" />
              
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => setIsSearchOpen(true)}>
                <Search className="w-3 h-3" />
                Find
              </Button>
              
              <Separator orientation="vertical" className="h-4 mx-1" />
              
              <Button 
                variant={isSplitViewOpen ? "default" : "outline"}
                size="sm" 
                className="h-6 px-2 text-xs gap-1"
                onClick={() => setIsSplitViewOpen(!isSplitViewOpen)}
              >
                <SplitSquareHorizontal className="w-3 h-3" />
                Split
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 px-2 text-xs gap-1" 
                onClick={() => setIsComparisonOpen(true)}
              >
                <GitCompare className="w-3 h-3" />
                Compare
              </Button>
              
              <Separator orientation="vertical" className="h-4 mx-1" />
              
              {canManageLock && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant={isLocked ? "default" : "outline"}
                      size="sm" 
                      className={`h-6 px-2 text-xs gap-1 ${isLocked ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
                      onClick={() => toggleLock()}
                      disabled={lockUpdating}
                    >
                      {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      {isLocked ? 'Unlock' : 'Lock'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isLocked ? 'Unlock this section' : 'Lock this section'}
                  </TooltipContent>
                </Tooltip>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 px-2 text-xs gap-1" 
                onClick={() => setIsVersionHistoryOpen(true)}
              >
                <History className="w-3 h-3" />
                History
              </Button>
              
              <Separator orientation="vertical" className="h-4 mx-1" />
              
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 px-2 text-xs gap-1"
                onClick={() => setIsWritingAssistantOpen(true)}
                disabled={!editor || isEffectivelyReadOnly}
              >
                <Wand2 className="w-3 h-3" />
                AI tools
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 px-2 text-xs gap-1"
                onClick={() => setIsSnippetsOpen(true)}
                disabled={!editor || isEffectivelyReadOnly}
              >
                <FileCode className="w-3 h-3" />
                Snippets
              </Button>
              {isImpactSection && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-6 px-2 text-xs gap-1 bg-primary/5 border-primary/30 hover:bg-primary/10" 
                  onClick={() => setIsImpactPathwayOpen(true)}
                  disabled={isEffectivelyReadOnly}
                >
                  <Route className="w-3 h-3" />
                  Impact Mapper
                </Button>
              )}
            </div>
            
            {/* Right side: shortcuts */}
            <div className="flex items-center gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsShortcutsOpen(true)}>
                    <Keyboard className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Keyboard shortcuts</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Assignment info banner - show when section is assigned */}

        {/* Assignment info banner - show when section is assigned */}
        {assignmentInfo.assignedTo && (
          <Alert className={`mx-0 rounded-none border-x-0 ${
            dueDateInfo?.isOverdue 
              ? 'bg-destructive/10 border-destructive/30 dark:bg-destructive/20' 
              : dueDateInfo?.isDueSoon 
                ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
                : 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800'
          }`}>
            <div className="flex items-center gap-3 w-full">
              <Avatar className="h-6 w-6">
                <AvatarImage src={assignmentInfo.assignedToAvatar || undefined} />
                <AvatarFallback className="text-xs bg-blue-500 text-white">
                  {assignmentInfo.assignedToName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || <User className="h-3 w-3" />}
                </AvatarFallback>
              </Avatar>
              <AlertDescription className={`flex-1 ${
                dueDateInfo?.isOverdue 
                  ? 'text-destructive dark:text-destructive' 
                  : dueDateInfo?.isDueSoon 
                    ? 'text-amber-800 dark:text-amber-200'
                    : 'text-blue-800 dark:text-blue-200'
              }`}>
                <span className="font-medium">{assignmentInfo.assignedToName}</span>
                {isAssignedToMe && <Badge variant="secondary" className="ml-2 text-xs">You</Badge>}
                {dueDateInfo && (
                  <span className="ml-2">
                    <CalendarClock className="inline h-3.5 w-3.5 mr-1" />
                    Due {format(dueDateInfo.dueDate, 'MMM d, yyyy')}
                    {dueDateInfo.isOverdue && <Badge variant="destructive" className="ml-2 text-xs">Overdue</Badge>}
                    {dueDateInfo.isDueSoon && !dueDateInfo.isOverdue && <Badge className="ml-2 text-xs bg-amber-500">Due soon</Badge>}
                  </span>
                )}
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* Locked section banner - show to non-admin users */}
        {isLocked && !canEditWhenLocked && (
          <Alert className="mx-0 rounded-none border-x-0 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <Lock className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              This section is locked{lockedByName ? ` by ${lockedByName}` : ''} 
              {lockReason ? `: ${lockReason}` : ' for review'}. 
              Editing is disabled.
            </AlertDescription>
          </Alert>
        )}

        {/* Placeholder content banner - show when section has template placeholder text */}
        {isPlaceholder && !isEffectivelyReadOnly && (
          <Alert className="mx-0 rounded-none border-x-0 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
            <FileText className="h-4 w-4 text-blue-600" />
            <AlertDescription className="flex-1 flex items-center justify-between text-blue-800 dark:text-blue-200">
              <span>
                <span className="font-medium">Template placeholder text.</span> Edit to replace with your own content, or clear to start fresh.
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 h-6 text-blue-600 hover:text-blue-800 hover:bg-blue-100 dark:text-blue-400 dark:hover:text-blue-200 dark:hover:bg-blue-900"
                onClick={clearPlaceholder}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Formatting Toolbar - immediately below Features toolbar */}
        <FormattingToolbar 
          editor={editor} 
          sectionNumber={section?.number}
          content={content}
          onOpenFigureDialog={() => setIsFigureDialogOpen(true)}
          onOpenFormulaDialog={() => setIsFormulaOpen(true)}
          onOpenCitationDialog={() => setIsCitationOpen(true)}
          onOpenCrossRefDialog={() => setIsCrossRefOpen(true)}
          onOpenWPRefDialog={() => setIsWPRefOpen(true)}
          onOpenParticipantRefDialog={() => setIsParticipantRefOpen(true)}
          isPartB={section && !section.isPartA}
          isReadOnly={isEffectivelyReadOnly}
          hideTableInsert={section?.number === 'B3.1'}
          crossRefDropdown={section && !section.isPartA ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1"
                    disabled={isEffectivelyReadOnly}
                  >
                    <Link2 className="w-4 h-4" />
                    <span className="text-xs">Cross-ref</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 bg-popover z-50">
                  <DropdownMenuItem onClick={() => { setCrossRefFilterType('figure'); setIsCrossRefOpen(true); }} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0"><Image className="w-3.5 h-3.5 text-foreground" /></span>
                    <span>Figure number</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setCrossRefFilterType('table'); setIsCrossRefOpen(true); }} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0"><Table2 className="w-3.5 h-3.5 text-foreground" /></span>
                    <span>Table number</span>
                  </DropdownMenuItem>
                  {acronymSegments && acronymSegments.length > 0 && (
                    <DropdownMenuItem onClick={handleInsertAcronymRef} className="flex items-center gap-2">
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
                </DropdownMenuContent>
              </DropdownMenu>
              <InsertTDMSReferenceDropdowns
                proposalId={proposalId}
                disabled={isEffectivelyReadOnly}
                onInsertTask={handleInsertTaskRef}
                onInsertDeliverable={handleInsertDeliverableRef}
                onInsertMilestone={handleInsertMilestoneRef}
                dialogsOnly
                openTask={isTaskRefOpen}
                onOpenTaskChange={setIsTaskRefOpen}
                openDeliverable={isDeliverableRefOpen}
                onOpenDeliverableChange={setIsDeliverableRefOpen}
                openMilestone={isMilestoneRefOpen}
                onOpenMilestoneChange={setIsMilestoneRefOpen}
              />
            </>
          ) : undefined}
        />
      </div>

      <div className="flex-1 flex min-w-0">
        <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Main content area */}
        <div className={`flex-1 min-w-0 overflow-auto p-6 bg-muted/30 transition-all`}>
          <div className="mx-auto space-y-6" style={{ maxWidth: '56rem', zoom: `${zoomLevel}%` }}>
            {/* Section Header - word/page limits and page estimate */}
            {(section.wordLimit || section.pageLimit) && (
              <div className="flex items-center gap-3 mb-6">
                {section.wordLimit && (
                  <Badge variant="secondary">Word limit: {section.wordLimit}</Badge>
                )}
                {section.pageLimit && (
                  <Badge variant="secondary">Page limit: {section.pageLimit}</Badge>
                )}
              </div>
            )}

            {/* Document Page with Rich Text Editor */}
            <div className="document-page animate-fade-in">
              {/* Page Header - centered, shows Topic ID: Topic title (type of action) */}
              <div className="document-page-header">
                <span className="w-full text-center">
                  {topicId ? `${topicId}: ` : ''}{topicTitle || ''}{proposalType ? ` (${proposalType})` : ''}
                </span>
              </div>

              <h1 className={`document-h1 text-foreground ${(section.id === 'b3-1' || section.number === 'B3.1' || section.number === '3.1') ? 'mb-2' : 'mb-6'}`}>{formatSectionHeading(section.number)} {section.title}</h1>
              
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : (
                <div ref={editorContainerRef} className={`relative tiptap-editor-container overflow-visible ${(section.id === 'b3-1' || section.number === 'B3.1' || section.number === '3.1') ? 'b31-editor-container' : ''}`}>
                  <EditorContent 
                    editor={editor} 
                    className={`document-content outline-none prose prose-sm max-w-none ${isEffectivelyReadOnly ? 'pointer-events-none opacity-75' : ''} ${(section.id === 'b3-1' || section.number === 'B3.1' || section.number === '3.1') ? '' : 'min-h-[400px]'}`}
                    style={{ fontFamily: '"Times New Roman", Times, serif' }}
                  />
                  {/* Track change inline tooltip */}
                  <TrackChangeTooltip
                    editor={editor}
                    containerRef={editorContainerRef}
                  />
                  {/* Block lock indicators */}
                  <BlockLockIndicator
                    editor={editor}
                    blockLocks={blockLocks}
                    containerRef={editorContainerRef}
                  />
                  {/* Collaborative cursors overlay */}
                  <CollaborativeCursors
                    editor={editor}
                    collaborators={collaboratorsInSection}
                    containerRef={editorContainerRef}
                  />
                </div>
              )}

              {/* B3.1 Section Content - auto-populated figures, tables, and structured content */}
              {(section.id === 'b3-1' || section.number === 'B3.1' || section.number === '3.1') && (
                <B31SectionContent proposalId={proposalId} />
              )}

              {/* Footnotes */}
              {footnotes.length > 0 && (
                <div className="mt-8 pt-4 border-t border-border">
                  <div className="space-y-1">
                    {footnotes.map((fn) => {
                      // Build sanitized citation HTML
                      let citationHtml = DOMPurify.sanitize(
                        `<sup>${fn.number}</sup> ${fn.citation.replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}`,
                        { ALLOWED_TAGS: ['em', 'strong', 'sup', 'span'], ALLOWED_ATTR: ['style'] }
                      );
                      // Replace acronym occurrences with colored version
                      if (proposalAcronym && acronymSegments && acronymSegments.length > 0) {
                        const coloredAcronym = acronymSegments
                          .map(seg => `<span style="color:${seg.color};font-family:'Arial Black',Arial,sans-serif;font-weight:900;">${seg.text}</span>`)
                          .join('');
                        citationHtml = citationHtml.replace(
                          new RegExp(`\\b${proposalAcronym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
                          coloredAcronym
                        );
                      }
                      return (
                        <p key={fn.number} className="text-[8pt] text-muted-foreground" 
                         dangerouslySetInnerHTML={{ __html: citationHtml }} 
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Page Footer - centered: "ACRONYM (Stage 1 of 2) | Part BX.X. Subsection title | Page X of X" */}
              <div className="document-page-footer">
                <span className="w-full text-center">
                  <strong style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900 }}>
                    {acronymSegments && acronymSegments.length > 0
                      ? acronymSegments.map((seg, i) => <span key={i} style={{ color: seg.color }}>{seg.text}</span>)
                      : proposalAcronym}
                  </strong>
                  {' (Stage 1 of 2) | Part '}
                  {section.number}. {section.title}
                  {' | Page 1 of 1'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Split View Panel */}
        {isSplitViewOpen && (
          <SplitViewPanel
            proposalId={proposalId}
            currentSectionId={section?.id || ''}
            sections={allSections}
            onClose={() => setIsSplitViewOpen(false)}
          />
        )}
        </div>{/* end inner overflow-hidden wrapper */}

        {/* Right-hand Collaboration Panel */}
        {isCollaborationPanelOpen ? (
          <div className="w-80 shrink-0 h-full border-l border-border bg-card flex flex-col">
            {/* Panel Header with close button */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Collaboration</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCollaborationPanelOpen(false)}>
                    <PanelRightClose className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Hide panel</TooltipContent>
              </Tooltip>
            </div>
            {/* Panel Tabs */}
            <div className="flex border-b border-border">
              <button
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  collaborationTab === 'comments'
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setCollaborationTab('comments')}
              >
                <MessageSquare className="w-3 h-3 inline mr-1.5" />
                Comments
              </button>
              <button
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  collaborationTab === 'changes'
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setCollaborationTab('changes')}
              >
                <GitCompare className="w-3 h-3 inline mr-1.5" />
                Track Changes
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 ml-auto"
                    onClick={() => setIsCollaborationPanelOpen(false)}
                  >
                    <PanelRightClose className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Hide panel</TooltipContent>
              </Tooltip>
            </div>

            {/* Panel Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {collaborationTab === 'comments' && (
                <div className="h-full flex flex-col">
                  <ScrollArea className="flex-1">
                    <div className="p-3 space-y-3">
                      <CommentsSidebar
                        proposalId={proposalId}
                        sectionId={section?.id || ''}
                      />
                    </div>
                  </ScrollArea>
                </div>
              )}
              {collaborationTab === 'changes' && (
                <div className="h-full flex flex-col">
                  <div className="p-2 border-b border-border">
                    <TrackChangesToolbar
                      editor={editor}
                      enabled={trackChangesEnabled}
                      onToggle={handleSetTrackChangesEnabled}
                      changes={trackedChanges}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="shrink-0 h-full border-l border-border bg-card flex flex-col items-center py-2 w-8">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsCollaborationPanelOpen(true)}
                >
                  <PanelRight className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Show panel</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {/* GrammarChecker removed - now integrated into WritingAssistantDialog */}
      <CitationDialog
        isOpen={isCitationOpen}
        onClose={() => setIsCitationOpen(false)}
        onInsertCitation={handleInsertCitation}
        proposalReferences={proposalReferences}
        isLoadingReferences={isLoadingReferences}
        nextCitationNumber={getNextCitationNumber()}
      />
      <InsertFigureDialog
        isOpen={isFigureDialogOpen}
        onClose={() => setIsFigureDialogOpen(false)}
        proposalId={proposalId}
        currentSectionId={section?.id || ''}
        onInsertFigure={handleInsertFigureReference}
        onInsertFigureImage={handleInsertFigureImage}
      />
      <ImpactPathwayGenerator
        isOpen={isImpactPathwayOpen}
        onClose={() => setIsImpactPathwayOpen(false)}
        proposalId={proposalId}
        topicId={topicId}
        topicUrl={topicUrl}
        workProgramme={workProgramme}
        destination={destination}
        onInsertContent={handleInsertImpactContent}
      />
      <SectionVersionHistoryDialog
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        proposalId={proposalId}
        sectionId={section?.id || ''}
        sectionTitle={`${section?.number || ''} ${section?.title || ''}`}
        onRestoreVersion={handleRestoreVersion}
      />
      <GuidelinesDialog
        isOpen={isGuidelinesOpen}
        onClose={() => setIsGuidelinesOpen(false)}
        sectionTitle={`${section?.number || ''} ${section?.title || ''}`}
        guidelines={section?.guidelinesArray || []}
      />
      <InsertCrossReferenceDialog
        isOpen={isCrossRefOpen}
        onClose={() => { setIsCrossRefOpen(false); setCrossRefFilterType(undefined); }}
        proposalId={proposalId || ''}
        sectionNumber={section?.number || ''}
        onInsert={handleInsertCrossRef}
        filterType={crossRefFilterType}
      />
      <InsertWPReferenceDialog
        open={isWPRefOpen}
        onOpenChange={setIsWPRefOpen}
        proposalId={proposalId || ''}
        onSelect={handleInsertWPRef}
      />
      <InsertParticipantReferenceDialog
        open={isParticipantRefOpen}
        onOpenChange={setIsParticipantRefOpen}
        proposalId={proposalId || ''}
        onSelect={handleInsertParticipantRef}
      />
      <InsertCaseReferenceDialog
        open={isCaseRefOpen}
        onOpenChange={setIsCaseRefOpen}
        proposalId={proposalId || ''}
        onSelect={handleInsertCaseRef}
      />
      <SectionAssignmentDialog
        open={isAssignmentDialogOpen}
        onOpenChange={setIsAssignmentDialogOpen}
        sectionTitle={section?.title || ''}
        sectionNumber={section?.number || ''}
        assignmentInfo={assignmentInfo}
        teamMembers={teamMembers}
        updating={assignmentUpdating}
        onAssign={assignSection}
        onClearAssignment={clearAssignment}
      />
      <SearchReplaceDialog
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        editor={editor}
      />
      <TableFormulaDialog
        isOpen={isFormulaOpen}
        onClose={() => setIsFormulaOpen(false)}
        editor={editor}
      />
      <VersionComparisonDialog
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
        proposalId={proposalId}
        sectionId={section?.id || ''}
        sectionTitle={`${section?.number || ''} ${section?.title || ''}`}
        currentContent={content}
      />
      <KeyboardShortcutsDialog
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
      <WritingAssistantDialog
        isOpen={isWritingAssistantOpen}
        onClose={() => setIsWritingAssistantOpen(false)}
        selectedText={selectedText}
        plainText={plainText}
        onApplyGrammarSuggestion={handleApplyGrammarSuggestion}
        onApply={(newText) => {
          if (editor && selectionRange) {
            // When AI assistant applies changes, add as tracked change with "AI Assistant" as author
            const trackChangesStorage = (editor.storage as any)?.trackChanges;
            if (trackChangesEnabled && trackChangesStorage) {
              const originalAuthorId = 'ai-assistant';
              const originalAuthorName = 'AI Assistant';
              const originalAuthorColor = '#8B5CF6'; // Purple for AI
              
              // Add the change tracking manually for AI
              const changeId = `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              
              // Store deletion as AI tracked change
              if (selectedText.trim()) {
                trackChangesStorage.changes.push({
                  id: `${changeId}-del`,
                  type: 'deletion',
                  authorId: originalAuthorId,
                  authorName: originalAuthorName,
                  authorColor: originalAuthorColor,
                  timestamp: new Date(),
                  from: selectionRange.start,
                  to: selectionRange.start,
                  content: selectedText,
                });
              }
            }
            
            editor.chain()
              .focus()
              .setTextSelection({ from: selectionRange.start, to: selectionRange.end })
              .deleteSelection()
              .insertContent(newText)
              .run();
            
            // If track changes is enabled, the insertion will be automatically tracked
            const postStorage = (editor.storage as any)?.trackChanges;
            if (trackChangesEnabled && postStorage) {
              const lastChange = postStorage.changes[postStorage.changes.length - 1];
              if (lastChange && lastChange.type === 'insertion') {
                lastChange.authorId = 'ai-assistant';
                lastChange.authorName = 'AI Assistant';
                lastChange.authorColor = '#8B5CF6';
              }
              setTrackedChanges([...postStorage.changes]);
            }
          }
        }}
      />
      <SnippetsDialog
        isOpen={isSnippetsOpen}
        onClose={() => setIsSnippetsOpen(false)}
        sectionId={section?.id || section?.number || ''}
        onInsert={(snippetContent) => {
          if (editor) {
            editor.chain().focus().insertContent(snippetContent).run();
          }
          setIsSnippetsOpen(false);
        }}
      />

      {/* Block Delete Confirmation Dialog */}
      <AlertDialog 
        open={deleteBlockConfirm?.isOpen || false} 
        onOpenChange={(open) => !open && setDeleteBlockConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Block</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this block? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteBlockConfirm(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteBlockConfirm?.onConfirm()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Zoom Bar */}
      <EditorZoomBar zoom={zoomLevel} onZoomChange={setZoomLevel} />
    </div>
  );
}