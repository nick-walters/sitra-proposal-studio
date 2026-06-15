import { ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SaveIndicator } from '@/components/SaveIndicator';
import { ParagraphSpacingExecPopover } from '@/components/ParagraphSpacingExecPopover';
import {
  BookOpen, List, ListOrdered,
  ImageIcon, FileText, Link2, Undo2, Redo2,
} from 'lucide-react';
import {
  ToolbarButton,
  TextFormattingGroup,
  AlignmentGroup,
  TableGridPicker,
  SubheadingDropdown,
  type Alignment,
} from './toolbar';

export interface DraftToolbarSaveProps {
  saving: boolean;
  lastSaved: Date | null;
  saveError?: string | null;
  onSaveNow?: () => void;
}

export interface DraftFormattingToolbarTableProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hoveredCell: { row: number; col: number } | null;
  onHoverCell: (cell: { row: number; col: number } | null) => void;
  onInsert: (rows: number, cols: number) => void;
}

export interface DraftFormattingToolbarProps {
  /** Callback to open the guidelines dialog. Required when showGuidelinesRow is true. */
  onOpenGuidelines?: () => void;
  /** Save state passed through to <SaveIndicator />. Required when showGuidelinesRow is true. */
  save?: DraftToolbarSaveProps;
  /** If true, the toolbar renders only the guidelines + save row. */
  isReadOnly?: boolean;
  /** If true, render nothing at all. */
  hideToolbar?: boolean;
  /** If true, disable all formatting buttons. */
  disabled?: boolean;
  /** Show the Guidelines + Save row (default true). */
  showGuidelinesRow?: boolean;

  // Subheading dropdown (optional — WPSimpleEditor uses this)
  showSubheading?: boolean;
  onSubheadingNumbered?: () => void;
  onSubheadingUnnumbered?: () => void;

  // Undo / Redo (optional — only WP has these)
  undo?: {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    undoLabel?: string;
    redoLabel?: string;
  };

  // Formatting commands — caller decides how (execCommand for both drafts today)
  onCommand: (command: string, value?: string) => void;

  // Table picker — when omitted, toolbar manages its own popover state and inserts via onCommand('insertHTML', ...)
  table?: DraftFormattingToolbarTableProps;

  // Paragraph-spacing popover container (optional — WP only)
  paragraphSpacingContainer?: () => HTMLElement | null;

  // Cross-ref / figure / citation handlers (all optional)
  onSaveSelection?: () => void;
  onOpenFigureDialog?: () => void;
  onOpenCitationDialog?: () => void;
  /** Cross-ref dropdown menu items rendered inside the toolbar's Cross-ref dropdown. */
  crossRefMenuItems?: ReactNode;
  /** Extra trailing nodes (e.g. <InsertTDMSReferenceDropdowns dialogsOnly />). */
  trailing?: ReactNode;
}

function buildDefaultTableHtml(rows: number, cols: number): string {
  let html = '<table style="width:100%; border-collapse:collapse; margin:8px 0;">';
  for (let r = 0; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) {
      if (r === 0) {
        html += '<th style="border:1px solid #000; padding:4px; background:#000; color:#fff; font-weight:bold;">&nbsp;</th>';
      } else {
        html += '<td style="border:1px solid #000; padding:4px;">&nbsp;</td>';
      }
    }
    html += '</tr>';
  }
  html += '</table><p><br></p>';
  return html;
}

export function DraftFormattingToolbar({
  onOpenGuidelines,
  save,
  isReadOnly = false,
  hideToolbar = false,
  disabled = false,
  showGuidelinesRow = true,
  showSubheading = false,
  onSubheadingNumbered,
  onSubheadingUnnumbered,
  undo,
  onCommand,
  table,
  paragraphSpacingContainer,
  onSaveSelection,
  onOpenFigureDialog,
  onOpenCitationDialog,
  crossRefMenuItems,
  trailing,
}: DraftFormattingToolbarProps) {
  if (hideToolbar) return null;

  const exec = (cmd: string, value?: string) => onCommand(cmd, value);

  // Internal table-popover state used only when `table` prop is not supplied.
  const [internalTableOpen, setInternalTableOpen] = useState(false);
  const [internalHoveredCell, setInternalHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const effectiveTable: DraftFormattingToolbarTableProps = table ?? {
    open: internalTableOpen,
    onOpenChange: setInternalTableOpen,
    hoveredCell: internalHoveredCell,
    onHoverCell: setInternalHoveredCell,
    onInsert: (rows, cols) => {
      onCommand('insertHTML', buildDefaultTableHtml(rows, cols));
      setInternalTableOpen(false);
    },
  };

  const containerClass = showGuidelinesRow
    ? 'p-2 border rounded-md bg-card sticky top-0 z-10 space-y-1.5'
    : 'p-1.5 border-b bg-muted/30';

  const row2Class = showGuidelinesRow
    ? 'flex items-center gap-0.5 flex-wrap'
    : 'flex items-center gap-0 flex-wrap';

  return (
    <div className={containerClass}>
      {/* Row 1: Guidelines + Save */}
      {showGuidelinesRow && (
        <div className="flex items-center gap-2">
          {onOpenGuidelines && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenGuidelines}
              className="h-7 px-2 text-xs gap-1 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Guidelines
            </Button>
          )}
          {save && (
            <SaveIndicator
              saving={save.saving}
              lastSaved={save.lastSaved}
              saveError={save.saveError ?? null}
              onSaveNow={save.onSaveNow}
            />
          )}
        </div>
      )}

      {/* Row 2: Formatting toolbar */}
      {!isReadOnly && (
        <div className={row2Class}>
          {undo && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={disabled || !undo.canUndo}
                    onClick={undo.onUndo}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">{undo.undoLabel ?? 'Undo'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={disabled || !undo.canRedo}
                    onClick={undo.onRedo}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">{undo.redoLabel ?? 'Redo'}</TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="h-5 mx-1.5" />
            </>
          )}

          {/* Subheading dropdown */}
          {showSubheading && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" disabled={disabled}>
                      <span className="text-xs font-black underline">Subheading</span>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Insert subheading</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="w-64">
                {onSubheadingNumbered && (
                  <DropdownMenuItem onClick={onSubheadingNumbered}>
                    <span className="text-sm font-semibold">Numbered subheading</span>
                  </DropdownMenuItem>
                )}
                {onSubheadingUnnumbered && (
                  <DropdownMenuItem onClick={onSubheadingUnnumbered}>
                    <span className="text-sm font-bold underline">Unnumbered subheading</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Bold / Italic / Underline */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled} onClick={() => exec('bold')}>
                <span className="font-black text-sm">B</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Bold (Ctrl+B)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled} onClick={() => exec('italic')}>
                <Italic className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Italic (Ctrl+I)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled} onClick={() => exec('underline')}>
                <Underline className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Underline (Ctrl+U)</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-5 mx-1.5" />

          {/* Lists */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled} onClick={() => exec('insertUnorderedList')}>
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Bullet list</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled} onClick={() => exec('insertOrderedList')}>
                <ListOrdered className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Numbered list</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-5 mx-1.5" />

          {/* Alignment */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled} onClick={() => exec('justifyLeft')}>
                <AlignLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Align left</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled} onClick={() => exec('justifyCenter')}>
                <AlignCenter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Align center</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled} onClick={() => exec('justifyRight')}>
                <AlignRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Align right</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled} onClick={() => exec('justifyFull')}>
                <AlignJustify className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Justify</TooltipContent>
          </Tooltip>

          {paragraphSpacingContainer && (
            <ParagraphSpacingExecPopover getContainer={paragraphSpacingContainer} />
          )}

          <Separator orientation="vertical" className="h-5 mx-1.5" />

          {/* Table picker */}
          <Popover open={effectiveTable.open} onOpenChange={effectiveTable.onOpenChange}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" disabled={disabled}>
                    <Table2 className="h-4 w-4" />
                    <span className="text-xs">Table</span>
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Insert table</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="text-xs text-muted-foreground mb-2">
                {effectiveTable.hoveredCell ? `${effectiveTable.hoveredCell.row} × ${effectiveTable.hoveredCell.col}` : 'Select size'}
              </div>
              <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                {Array.from({ length: 8 }, (_, row) =>
                  Array.from({ length: 8 }, (_, col) => {
                    const isHighlighted = effectiveTable.hoveredCell && row < effectiveTable.hoveredCell.row && col < effectiveTable.hoveredCell.col;
                    const isFirstRow = row === 0;
                    return (
                      <button
                        key={`${row}-${col}`}
                        className={cn(
                          "w-4 h-4 border border-border rounded-sm transition-colors",
                          isHighlighted
                            ? isFirstRow ? "bg-foreground" : "bg-primary/40"
                            : "bg-background hover:bg-muted"
                        )}
                        onMouseEnter={() => effectiveTable.onHoverCell({ row: row + 1, col: col + 1 })}
                        onMouseLeave={() => effectiveTable.onHoverCell(null)}
                        onClick={() => effectiveTable.onInsert(row + 1, col + 1)}
                      />
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Figure */}
          {onOpenFigureDialog && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" disabled={disabled} onClick={onOpenFigureDialog} onMouseDown={onSaveSelection}>
                  <ImageIcon className="h-4 w-4" />
                  <span className="text-xs">Figure</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Insert figure</TooltipContent>
            </Tooltip>
          )}

          {/* Citations */}
          {onOpenCitationDialog && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" disabled={disabled} onClick={onOpenCitationDialog} onMouseDown={onSaveSelection}>
                  <FileText className="h-4 w-4" />
                  <span className="text-xs">Citations</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Manage citations</TooltipContent>
            </Tooltip>
          )}

          {/* Cross-ref dropdown */}
          {crossRefMenuItems && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" disabled={disabled} onMouseDown={onSaveSelection}>
                      <Link2 className="w-4 h-4" />
                      <span className="text-xs">Cross-ref</span>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Insert cross-reference</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="w-64 bg-popover z-50">
                {crossRefMenuItems}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {trailing}
        </div>
      )}
    </div>
  );
}
