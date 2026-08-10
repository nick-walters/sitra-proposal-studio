import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { Image, Keyboard, Link2, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { caseWord } from "@/lib/caseTypeLabels";
import { useProposalCaseTypes } from "@/hooks/useProposalCaseTypes";
import { B31Pill, WPBubble } from "./B31Pill";
import { InsertCrossReferenceDialog } from "./InsertCrossReferenceDialog";
import { InsertWPReferenceDialog } from "./InsertWPReferenceDialog";
import { InsertCaseReferenceDialog } from "./InsertCaseReferenceDialog";
import { InsertParticipantReferenceDialog } from "./InsertParticipantReferenceDialog";
import { InsertTDMSReferenceDropdowns } from "./InsertTDMSReferenceDropdowns";

export interface PartBCrossRefControlsHandle {
  /** Opens the figure/table cross-reference dialog (unfiltered). */
  openCrossRefDialog: () => void;
  openWPRefDialog: () => void;
  openParticipantRefDialog: () => void;
}

interface PartBCrossRefControlsProps {
  editor: Editor | null;
  proposalId: string;
  sectionNumber?: string;
  disabled?: boolean;
  acronymSegments?: { text: string; color: string }[] | null;
  /** When omitted, the keyboard-shortcuts button is hidden. */
  onOpenShortcuts?: () => void;
  showKeyboardButton?: boolean;
}

/**
 * Reusable Part B cross-referencing controls: the Cross-ref dropdown, the
 * keyboard-shortcuts button and every reference dialog it drives. Behaviour is
 * moved verbatim from DocumentEditor.
 */
export const PartBCrossRefControls = forwardRef<
  PartBCrossRefControlsHandle,
  PartBCrossRefControlsProps
>(function PartBCrossRefControls(
  {
    editor,
    proposalId,
    sectionNumber,
    disabled = false,
    acronymSegments,
    onOpenShortcuts,
    showKeyboardButton = true,
  },
  ref,
) {
  const { data: caseTypes = [] } = useProposalCaseTypes(proposalId);
  const [hasCases, setHasCases] = useState(false);

  const [isCrossRefOpen, setIsCrossRefOpen] = useState(false);
  const [crossRefFilterType, setCrossRefFilterType] = useState<'figure' | 'table' | undefined>(undefined);
  const [isWPRefOpen, setIsWPRefOpen] = useState(false);
  const [isParticipantRefOpen, setIsParticipantRefOpen] = useState(false);
  const [isCaseRefOpen, setIsCaseRefOpen] = useState(false);
  const [isTaskRefOpen, setIsTaskRefOpen] = useState(false);
  const [isDeliverableRefOpen, setIsDeliverableRefOpen] = useState(false);
  const [isMilestoneRefOpen, setIsMilestoneRefOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openCrossRefDialog: () => setIsCrossRefOpen(true),
    openWPRefDialog: () => setIsWPRefOpen(true),
    openParticipantRefDialog: () => setIsParticipantRefOpen(true),
  }), []);

  // Check if proposal has cases
  useEffect(() => {
    if (!proposalId) return;
    supabase
      .from('case_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('proposal_id', proposalId)
      .then(({ count }) => setHasCases((count ?? 0) > 0));
  }, [proposalId]);

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
  const handleInsertCaseRef = useCallback((caseItem: { id: string; number: number; short_name: string | null; color: string; case_type: string; include_number?: boolean; include_abbreviation?: boolean }) => {
    if (!editor) return;
    setTimeout(() => {
      editor.chain().focus().insertCaseReference({
        caseNumber: caseItem.number,
        caseShortName: caseItem.short_name || '',
        // `caseItem.color` is already the resolved outline colour
        // (proposal_case_types.outline_color, or the draft's own colour as
        // fallback) — the dialog resolves it in handleSelect so the badge
        // is inserted in its correct form and does NOT need
        // syncCrossReferences to "correct" it on the next edit.
        caseColor: caseItem.color,
        caseId: caseItem.id,
        caseType: caseItem.case_type,
        includeNumber: caseItem.include_number !== false,
        includeAbbreviation: caseItem.include_abbreviation !== false,
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
    }).insertContent(' ').run();
  }, [editor]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1"
            disabled={disabled}
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
              <WPBubble wpColor="#73C92D" style={{ width: '22px', height: '14px', padding: 0 }}>{' '}</WPBubble>
            </span>
            <span>Work package</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsTaskRefOpen(true)} className="flex items-center gap-2">
            <span className="w-16 flex justify-start shrink-0">
              <B31Pill variant="outline" color="#73C92D" style={{ width: '22px', height: '14px', padding: 0 }}>{' '}</B31Pill>
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
        </DropdownMenuContent>
      </DropdownMenu>
      {showKeyboardButton && onOpenShortcuts && (
        <>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onOpenShortcuts} aria-label="Keyboard" title="Keyboard">
                <Keyboard className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Keyboard shortcuts</TooltipContent>
          </Tooltip>
        </>
      )}
      <InsertTDMSReferenceDropdowns
        proposalId={proposalId}
        disabled={disabled}
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

      <InsertCrossReferenceDialog
        isOpen={isCrossRefOpen}
        onClose={() => { setIsCrossRefOpen(false); setCrossRefFilterType(undefined); }}
        proposalId={proposalId || ''}
        sectionNumber={sectionNumber || ''}
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
    </>
  );
});

export default PartBCrossRefControls;
