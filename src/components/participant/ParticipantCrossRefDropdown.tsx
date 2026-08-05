import { useCallback, useRef, useState } from 'react';
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
import { buildCaseLabel, getCaseTypePrefix } from '@/lib/caseTypeLabels';
import {
  buildWPBadge,
  buildTaskBadge,
  buildDeliverableBadge,
  buildCaseBadge,
  buildParticipantBadge,
  buildAcronymBadge,
  buildMilestoneBadge,
  type AcronymSegment,
} from '@/lib/contentEditableRefBadges';

interface Props {
  proposalId: string;
  disabled?: boolean;
  /** Acronym segments used to build the acronym reference badge. */
  acronymSegments?: AcronymSegment[];
  /** Keeps the parent toolbar visible while a dialog/menu is open. */
  onOpenChange?: (open: boolean) => void;
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
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [wpOpen, setWpOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [participantOpen, setParticipantOpen] = useState(false);
  const hasAcronym = (acronymSegments ?? []).length > 0;

  const savedRangeRef = useRef<Range | null>(null);
  const savedEditorRef = useRef<HTMLElement | null>(null);

  const notifyOpen = useCallback(
    (open: boolean) => {
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    if (!node) return;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    const editable = el?.closest('[contenteditable="true"]') as HTMLElement | null;
    if (!editable) return;
    savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    savedEditorRef.current = editable;
  }, []);

  /** Insert a badge element at the saved caret, then notify the editor. */
  const insertNode = useCallback((node: HTMLElement) => {
    const editorEl = savedEditorRef.current;
    const range = savedRangeRef.current;
    if (!editorEl || !document.body.contains(editorEl)) return;

    editorEl.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    if (range && document.body.contains(range.startContainer)) {
      sel.addRange(range);
    } else {
      const fallback = document.createRange();
      fallback.selectNodeContents(editorEl);
      fallback.collapse(false);
      sel.addRange(fallback);
    }

    const active = sel.getRangeAt(0);
    active.deleteContents();
    active.insertNode(node);
    // Trailing space so the caret has a normal text position after the badge.
    const spacer = document.createTextNode('\u00a0');
    node.after(spacer);
    const after = document.createRange();
    after.setStart(spacer, 1);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);

    savedRangeRef.current = after.cloneRange();
    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  }, []);

  const openDialog = (setter: (v: boolean) => void) => {
    notifyOpen(true);
    setter(true);
  };

  const closeDialog = (setter: (v: boolean) => void) => (open: boolean) => {
    setter(open);
    if (!open) notifyOpen(false);
  };

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(o) => {
          setMenuOpen(o);
          notifyOpen(o);
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
              saveSelection();
              setMenuOpen((o) => {
                notifyOpen(!o);
                return !o;
              });
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
                if (acronymSegments) {
                  insertNode(buildAcronymBadge(acronymSegments));
                }
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
          insertNode(buildWPBadge({ id: wp.id, number: wp.number, short_name: wp.short_name, color: wp.color }));
        }}
      />

      <InsertCaseReferenceDialog
        open={caseOpen}
        onOpenChange={closeDialog(setCaseOpen)}
        proposalId={proposalId}
        onSelect={(c) => {
          const label = buildCaseLabel({
            prefix: getCaseTypePrefix(c.case_type),
            number: c.number,
            shortName: c.short_name,
            includeNumber: c.include_number !== false,
            includeAbbreviation: c.include_abbreviation !== false,
            withShortName: false,
          });
          insertNode(
            buildCaseBadge({
              id: c.id,
              number: c.number,
              short_name: c.short_name,
              case_type: c.case_type,
              color: c.color,
              label,
            }),
          );
        }}
      />

      <InsertParticipantReferenceDialog
        open={participantOpen}
        onOpenChange={closeDialog(setParticipantOpen)}
        proposalId={proposalId}
        onSelect={(p) => insertNode(buildParticipantBadge(p))}
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
        onInsertTask={(t) => insertNode(buildTaskBadge(t))}
        onInsertDeliverable={(d) => insertNode(buildDeliverableBadge(d))}
        onInsertMilestone={(m) => insertNode(buildMilestoneBadge(m))}
      />
    </>
  );
}

export default ParticipantCrossRefDropdown;
