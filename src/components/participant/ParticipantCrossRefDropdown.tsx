import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link2 } from 'lucide-react';
import { InsertWPReferenceDialog } from '@/components/InsertWPReferenceDialog';
import { InsertCaseReferenceDialog } from '@/components/InsertCaseReferenceDialog';
import { InsertParticipantReferenceDialog } from '@/components/InsertParticipantReferenceDialog';
import { InsertTDMSReferenceDropdowns } from '@/components/InsertTDMSReferenceDropdowns';
import { WPBubble, B31Pill } from '@/components/B31Pill';
import type { AcronymSegment } from '@/extensions/AcronymReference';
import type { Editor } from '@tiptap/react';

interface Props {
  proposalId: string;
  disabled?: boolean;
  /** Acronym segments used to build the acronym reference badge. */
  acronymSegments?: AcronymSegment[];
  /** Keeps the parent toolbar visible while a dialog/menu is open. */
  onOpenChange?: (open: boolean) => void;
  /**
   * When supplied, references are inserted as TipTap nodes into this editor
   * instead of as static badge markup into a contentEditable. Used by the
   * migrated A2 participant-description fields (LazyRichField).
   */
  editor?: Editor | null;
}

/**
 * Cross-reference insert dropdown for the A2 participant-description
 * contentEditable fields (PrefixedInlineEditor). Mirrors the cross-ref
 * button used elsewhere, but inserts static badge markup into the saved
 * caret position instead of TipTap nodes.
 */
export function ParticipantCrossRefDropdown({
  proposalId,
  disabled,
  acronymSegments,
  onOpenChange,
  editor,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [wpOpen, setWpOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [participantOpen, setParticipantOpen] = useState(false);
  const hasAcronym = (acronymSegments ?? []).length > 0;

  const notifyOpen = useCallback(
    (open: boolean) => {
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  // Keep the parent toolbar mounted for the entire menu -> dialog transition.
  // Radix closes the dropdown as an item is selected; notifying the parent
  // directly from that close event can unmount this component before the
  // item's onSelect handler inserts the acronym or opens its dialog.
  useEffect(() => {
    notifyOpen(
      menuOpen ||
        wpOpen ||
        taskOpen ||
        delOpen ||
        milestoneOpen ||
        caseOpen ||
        participantOpen,
    );
  }, [
    menuOpen,
    wpOpen,
    taskOpen,
    delOpen,
    milestoneOpen,
    caseOpen,
    participantOpen,
    notifyOpen,
  ]);

  /** Every surface now inserts into TipTap; nothing to do without an editor. */
  const hasEditor = Boolean(editor && !editor.isDestroyed);

  const openDialog = (setter: (v: boolean) => void) => {
    setter(true);
  };

  const closeDialog = (setter: (v: boolean) => void) => (open: boolean) => {
    setter(open);
  };

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(o) => {
          setMenuOpen(o);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1 shrink-0"
            disabled={disabled}
            onMouseDown={(e) => {
              // Keep the caret in the focused description field.
              e.preventDefault();
              if (disabled) return;
              setMenuOpen((o) => !o);
            }}
            aria-label="Insert cross-reference"
            title="Insert cross-reference"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span className="text-xs">Cross-ref</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 bg-popover z-50">
          {hasAcronym && (
            <DropdownMenuItem
              onSelect={() => {
                if (!acronymSegments) return;
                if (!hasEditor) return;
                editor!.chain().focus().insertAcronymReference({ segments: acronymSegments })
                  .insertContent(' ').run();
              }}
              className="flex items-center gap-2"
            >
              <span className="w-16 flex justify-start shrink-0">
                <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: '9px', whiteSpace: 'nowrap' }}>
                  {acronymSegments!.map((seg, i) => (
                    <span key={i} style={{ color: seg.color }}>{seg.text}</span>
                  ))}
                </span>
              </span>
              <span>Acronym</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => openDialog(setWpOpen)}
            className="flex items-center gap-2"
          >
            <span className="w-16 flex justify-start shrink-0">
              <WPBubble wpColor="#73C92D" style={{ width: '22px', height: '14px', padding: 0 }}>{' '}</WPBubble>
            </span>
            <span>Work package</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => openDialog(setTaskOpen)}
            className="flex items-center gap-2"
          >
            <span className="w-16 flex justify-start shrink-0">
              <B31Pill variant="outline" color="#73C92D" style={{ width: '22px', height: '14px', padding: 0 }}>{' '}</B31Pill>
            </span>
            <span>Task</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => openDialog(setDelOpen)}
            className="flex items-center gap-2"
          >
            <span className="w-16 flex justify-start shrink-0">
              <span style={{ display: 'inline-block', width: '22px', height: '14px', background: '#73C92D', clipPath: 'polygon(0% 0%, calc(100% - 6px) 0%, 100% 50%, calc(100% - 6px) 100%, 0% 100%)', position: 'relative' }}>
                <span style={{ position: 'absolute', inset: '1.5px', right: '2px', background: '#ffffff', clipPath: 'polygon(0% 0%, calc(100% - 5px) 0%, 100% 50%, calc(100% - 5px) 100%, 0% 100%)' }} />
              </span>
            </span>
            <span>Deliverable</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => openDialog(setMilestoneOpen)}
            className="flex items-center gap-2"
          >
            <span className="w-16 flex justify-start shrink-0">
              <span style={{ display: 'inline-block', width: '22px', height: '14px', background: '#000000', clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)' }} />
            </span>
            <span>Milestone</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => openDialog(setCaseOpen)}
            className="flex items-center gap-2"
          >
            <span className="w-16 flex justify-start shrink-0">
              <span style={{ display: 'inline-block', width: '22px', height: '14px', border: '1.5px solid #000000', borderRadius: '9999px', background: '#ffffff' }} />
            </span>
            <span>Case</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => openDialog(setParticipantOpen)}
            className="flex items-center gap-2"
          >
            <span className="w-16 flex justify-start shrink-0">
              <span style={{ display: 'inline-block', width: '22px', height: '14px', border: '1.5px solid #000000', borderRadius: '9999px', background: '#000000' }} />
            </span>
            <span>Participant</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <InsertWPReferenceDialog
        open={wpOpen}
        onOpenChange={closeDialog(setWpOpen)}
        proposalId={proposalId}
        onSelect={(wp) => {
          if (!hasEditor) return;
          editor!.chain().focus().insertWPReference({
            wpNumber: wp.number,
            wpShortName: wp.short_name || '',
            wpColor: wp.color,
            wpId: wp.id,
          }).insertContent(' ').unsetBold().unsetItalic().run();
        }}
      />

      <InsertCaseReferenceDialog
        open={caseOpen}
        onOpenChange={closeDialog(setCaseOpen)}
        proposalId={proposalId}
        onSelect={(c) => {
          if (!hasEditor) return;
          editor!.chain().focus().insertCaseReference({
            caseNumber: c.number,
            caseShortName: c.short_name || '',
            caseColor: c.color,
            caseId: c.id,
            caseType: c.case_type,
            includeNumber: c.include_number !== false,
            includeAbbreviation: c.include_abbreviation !== false,
          }).insertContent(' ').unsetBold().unsetItalic().run();
        }}
      />

      <InsertParticipantReferenceDialog
        open={participantOpen}
        onOpenChange={closeDialog(setParticipantOpen)}
        proposalId={proposalId}
        onSelect={(p) => {
          if (!hasEditor) return;
          editor!.chain().focus().insertParticipantReference({
            participantNumber: p.participantNumber,
            shortName: p.shortName,
            participantId: p.id,
          }).insertContent(' ').unsetBold().unsetItalic().run();
        }}
      />

      <InsertTDMSReferenceDropdowns
        proposalId={proposalId}
        dialogsOnly
        openTask={taskOpen}
        onOpenTaskChange={closeDialog(setTaskOpen)}
        openDeliverable={delOpen}
        onOpenDeliverableChange={closeDialog(setDelOpen)}
        openMilestone={milestoneOpen}
        onOpenMilestoneChange={closeDialog(setMilestoneOpen)}
        onInsertTask={(t) => {
          if (!hasEditor) return;
          editor!.chain().focus().insertTaskReference({
            wpNumber: t.wp_number,
            taskNumber: t.number,
            taskId: t.id,
            wpColor: t.wp_color || undefined,
          }).insertContent(' ').unsetBold().unsetItalic().run();
        }}
        onInsertDeliverable={(d) => {
          if (!hasEditor) return;
          editor!.chain().focus().insertDeliverableReference({
            deliverableNumber: d.number,
            deliverableId: d.id,
            wpColor: d.wp_color || undefined,
          }).insertContent(' ').unsetBold().unsetItalic().run();
        }}
        onInsertMilestone={(m) => {
          if (!hasEditor) return;
          editor!.chain().focus().insertMilestoneReference({
            milestoneNumber: m.number,
            milestoneId: m.id,
          }).insertContent(' ').run();
        }}
      />
    </>
  );
}

export default ParticipantCrossRefDropdown;
