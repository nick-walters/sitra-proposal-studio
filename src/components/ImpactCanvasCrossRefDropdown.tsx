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
import { B31Pill, WPBubble } from './B31Pill';

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
        <DropdownMenuContent align="start" className="w-64 bg-popover z-50">
          <DropdownMenuItem
            onSelect={() => guardedOpen(() => setWpOpen(true))}
            className="flex items-center gap-2"
          >
            <span className="w-16 flex justify-start shrink-0">
              <WPBubble wpColor="#73C92D" style={{ width: '22px', height: '14px', padding: 0 }}>{' '}</WPBubble>
            </span>
            <span>Work package</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => guardedOpen(() => setTaskOpen(true))}
            className="flex items-center gap-2"
          >
            <span className="w-16 flex justify-start shrink-0">
              <B31Pill variant="outline" color="#73C92D" style={{ width: '22px', height: '14px', padding: 0 }}>{' '}</B31Pill>
            </span>
            <span>Task</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => guardedOpen(() => setDelOpen(true))}
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
            onSelect={() => guardedOpen(() => setCaseOpen(true))}
            className="flex items-center gap-2"
          >
            <span className="w-16 flex justify-start shrink-0">
              <span style={{ display: 'inline-block', width: '22px', height: '14px', border: '1.5px solid #000000', borderRadius: '9999px', background: '#ffffff' }} />
            </span>
            <span>Case</span>
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
