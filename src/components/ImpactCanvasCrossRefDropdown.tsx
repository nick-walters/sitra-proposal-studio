import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link2 } from 'lucide-react';
import { InsertWPReferenceDialog } from './InsertWPReferenceDialog';
import { InsertCaseReferenceDialog } from './InsertCaseReferenceDialog';
import { InsertTDMSReferenceDropdowns } from './InsertTDMSReferenceDropdowns';

interface Props {
  proposalId: string;
  activeEditor: Editor | null;
  disabled?: boolean;
}

/**
 * Cross-reference dropdown for the Impact Canvas shared cell toolbar.
 * Offers WP / task / deliverable / case ONLY (no participant / figure /
 * acronym — cells are cross-cutting summary blocks, not narrative prose).
 *
 * Reuses the existing insertion dialogs and inserts into the shared
 * `activeEditor` via the standard `insertWPReference` /
 * `insertCaseReference` / `insertTaskReference` /
 * `insertDeliverableReference` TipTap commands.
 *
 * Focus safety: the trigger uses `onMouseDown` + `preventDefault` so
 * clicking it does not blur the currently-focused cell (i.e. does not
 * clear `activeEditor`). Dialogs then take focus intentionally.
 *
 * Dynamic updates: badges are baked at insertion — the cell content is
 * NOT walked by `syncCrossReferences` (which only scans main-editor
 * ProseMirror docs). This matches the A2 PrefixedInlineEditor behaviour.
 */
export function ImpactCanvasCrossRefDropdown({ proposalId, activeEditor, disabled }: Props) {
  const [wpOpen, setWpOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const guardedOpen = (open: () => void) => {
    if (!activeEditor || disabled) return;
    open();
  };

  const insertWP = (wp: { id: string; number: number; short_name: string | null; color: string }) => {
    if (!activeEditor) return;
    activeEditor
      .chain()
      .focus()
      .insertWPReference({
        wpNumber: wp.number,
        wpShortName: wp.short_name || '',
        wpColor: wp.color,
        wpId: wp.id,
      })
      .insertContent(' ')
      .unsetBold()
      .unsetItalic()
      .run();
  };

  const insertCase = (c: {
    id: string;
    number: number;
    short_name: string | null;
    color: string;
    case_type: string;
  }) => {
    if (!activeEditor) return;
    activeEditor
      .chain()
      .focus()
      .insertCaseReference({
        caseNumber: c.number,
        caseShortName: c.short_name || '',
        caseColor: c.color,
        caseId: c.id,
        caseType: c.case_type,
      })
      .insertContent(' ')
      .unsetBold()
      .unsetItalic()
      .run();
  };

  const insertTask = (t: { id: string; wp_number: number; number: number; wp_color?: string }) => {
    if (!activeEditor) return;
    activeEditor
      .chain()
      .focus()
      .insertTaskReference({
        wpNumber: t.wp_number,
        taskNumber: t.number,
        taskId: t.id,
        wpColor: t.wp_color || undefined,
      })
      .insertContent(' ')
      .unsetBold()
      .unsetItalic()
      .run();
  };

  const insertDeliverable = (d: { id: string; number: string; wp_color?: string }) => {
    if (!activeEditor) return;
    activeEditor
      .chain()
      .focus()
      .insertDeliverableReference({
        deliverableNumber: d.number,
        deliverableId: d.id,
        wpColor: d.wp_color || undefined,
      })
      .insertContent(' ')
      .unsetBold()
      .unsetItalic()
      .run();
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const triggerDisabled = !activeEditor || !!disabled;

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1 shrink-0"
            disabled={triggerDisabled}
            // Focus-safe: prevent the cell editor from blurring, then
            // toggle the menu manually (we can't rely on Radix's own
            // pointerdown opener because preventDefault suppresses it).
            onMouseDown={(e) => {
              e.preventDefault();
              if (!triggerDisabled) setMenuOpen((o) => !o);
            }}
            aria-label="Insert cross-reference"
            title="Insert cross-reference (WP / task / deliverable / case)"
            data-impact-canvas-crossref-trigger
          >
            <Link2 className="w-4 h-4" />
            <span className="text-xs">Cross-ref</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuItem onSelect={() => guardedOpen(() => setWpOpen(true))}>
            Work package…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => guardedOpen(() => setTaskOpen(true))}>
            Task…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => guardedOpen(() => setDelOpen(true))}>
            Deliverable…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => guardedOpen(() => setCaseOpen(true))}>
            Case…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <InsertWPReferenceDialog
        open={wpOpen}
        onOpenChange={setWpOpen}
        proposalId={proposalId}
        onSelect={insertWP}
      />
      <InsertCaseReferenceDialog
        open={caseOpen}
        onOpenChange={setCaseOpen}
        proposalId={proposalId}
        onSelect={insertCase}
      />
      {/* Task + Deliverable dialogs — externally controlled, dialogsOnly */}
      <InsertTDMSReferenceDropdowns
        proposalId={proposalId}
        dialogsOnly
        hideMilestone
        openTask={taskOpen}
        onOpenTaskChange={setTaskOpen}
        openDeliverable={delOpen}
        onOpenDeliverableChange={setDelOpen}
        onInsertTask={insertTask}
        onInsertDeliverable={insertDeliverable}
        onInsertMilestone={() => {
          /* not offered — hideMilestone */
        }}
      />
    </>
  );
}
