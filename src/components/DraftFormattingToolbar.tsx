import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SaveIndicator } from '@/components/SaveIndicator';
import { ParagraphSpacingExecPopover } from '@/components/ParagraphSpacingExecPopover';
import {
  BookOpen, Italic, Underline, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Table2, ImageIcon, FileText, Link2, Undo2, Redo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DraftToolbarSaveProps {
  saving: boolean;
  lastSaved: Date | null;
  saveError?: string | null;
  onSaveNow?: () => void;
}

export interface DraftFormattingToolbarProps {
  /** Callback to open the guidelines dialog. */
  onOpenGuidelines: () => void;
  /** Save state passed through to <SaveIndicator />. */
  save: DraftToolbarSaveProps;
  /** If true, the toolbar renders only the guidelines + save row. */
  isReadOnly?: boolean;

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

  // Table picker
  table: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    hoveredCell: { row: number; col: number } | null;
    onHoverCell: (cell: { row: number; col: number } | null) => void;
    onInsert: (rows: number, cols: number) => void;
  };

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

export function DraftFormattingToolbar({
  onOpenGuidelines,
  save,
  isReadOnly = false,
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
  const exec = (cmd: string, value?: string) => onCommand(cmd, value);

  return (
    <div className="p-2 border rounded-md bg-card sticky top-0 z-10 space-y-1.5">
      {/* Row 1: Guidelines + Save */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenGuidelines}
          className="h-7 px-2 text-xs gap-1 text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Guidelines
        </Button>
        <SaveIndicator
          saving={save.saving}
          lastSaved={save.lastSaved}
          saveError={save.saveError ?? null}
          onSaveNow={save.onSaveNow}
        />
      </div>

      {/* Row 2: Formatting toolbar */}
      {!isReadOnly && (
        <div className="flex items-center gap-0.5 flex-wrap">
          {undo && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={!undo.canUndo}
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
                    disabled={!undo.canRedo}
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

          {/* Bold / Italic / Underline */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('bold')}>
                <span className="font-black text-sm">B</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Bold (Ctrl+B)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('italic')}>
                <Italic className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Italic (Ctrl+I)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('underline')}>
                <Underline className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Underline (Ctrl+U)</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-5 mx-1.5" />

          {/* Lists */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('insertUnorderedList')}>
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Bullet list</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('insertOrderedList')}>
                <ListOrdered className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Numbered list</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-5 mx-1.5" />

          {/* Alignment */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('justifyLeft')}>
                <AlignLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Align left</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('justifyCenter')}>
                <AlignCenter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Align center</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('justifyRight')}>
                <AlignRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Align right</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('justifyFull')}>
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
          <Popover open={table.open} onOpenChange={table.onOpenChange}>
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
                {table.hoveredCell ? `${table.hoveredCell.row} × ${table.hoveredCell.col}` : 'Select size'}
              </div>
              <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                {Array.from({ length: 8 }, (_, row) =>
                  Array.from({ length: 8 }, (_, col) => {
                    const isHighlighted = table.hoveredCell && row < table.hoveredCell.row && col < table.hoveredCell.col;
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
                        onMouseEnter={() => table.onHoverCell({ row: row + 1, col: col + 1 })}
                        onMouseLeave={() => table.onHoverCell(null)}
                        onClick={() => table.onInsert(row + 1, col + 1)}
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
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={onOpenFigureDialog} onMouseDown={onSaveSelection}>
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
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={onOpenCitationDialog} onMouseDown={onSaveSelection}>
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
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onMouseDown={onSaveSelection}>
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
