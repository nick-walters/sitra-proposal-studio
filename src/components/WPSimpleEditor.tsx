import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, FileText, Link2, Table2, ImageIcon, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InsertTDMSReferenceDropdowns } from '@/components/InsertTDMSReferenceDropdowns';

interface WPSimpleEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minHeight?: string;
  hideToolbar?: boolean;
  proposalId?: string;
  // Dialog handlers for advanced features
  onOpenCitationDialog?: () => void;
  onOpenCrossRefDialog?: () => void;
  onOpenWPRefDialog?: () => void;
  onOpenParticipantRefDialog?: () => void;
  onOpenFigureDialog?: () => void;
  onInsertTaskRef?: (task: any) => void;
  onInsertDeliverableRef?: (del: any) => void;
  onInsertMilestoneRef?: (ms: any) => void;
  /** Called before opening a cross-ref dialog so the parent can save the cursor position */
  onSaveSelection?: () => void;
}

export function WPSimpleEditor({
  value,
  onChange,
  placeholder = '',
  className,
  disabled = false,
  minHeight = '100px',
  hideToolbar = false,
  proposalId,
  onOpenCitationDialog,
  onOpenCrossRefDialog,
  onOpenWPRefDialog,
  onOpenParticipantRefDialog,
  onOpenFigureDialog,
  onInsertTaskRef,
  onInsertDeliverableRef,
  onInsertMilestoneRef,
  onSaveSelection,
}: WPSimpleEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [isTaskRefOpen, setIsTaskRefOpen] = useState(false);
  const [isDeliverableRefOpen, setIsDeliverableRefOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);
  const hasPendingLocalChangesRef = useRef(false);

  // Set initial content
  useEffect(() => {
    if (editorRef.current && isInitialMount.current) {
      editorRef.current.innerHTML = value || '';
      hasPendingLocalChangesRef.current = false;
      isInitialMount.current = false;
    }
  }, []);

  // Sync external value changes
  useEffect(() => {
    if (!editorRef.current || isFocused) return;

    const nextValue = value || '';
    const currentContent = editorRef.current.innerHTML;

    if (currentContent === nextValue) {
      hasPendingLocalChangesRef.current = false;
      return;
    }

    if (hasPendingLocalChangesRef.current) {
      return;
    }

    editorRef.current.innerHTML = nextValue;
  }, [value, isFocused]);

  const emitChange = useCallback((nextValue: string) => {
    hasPendingLocalChangesRef.current = true;
    onChange(nextValue);
  }, [onChange]);

  const flushPendingChange = useCallback(() => {
    if (!editorRef.current) return;

    const currentValue = editorRef.current.innerHTML;
    if (!debounceRef.current && currentValue === (value || '')) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    emitChange(currentValue);
  }, [emitChange, value]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    
    const newValue = editorRef.current.innerHTML;
    hasPendingLocalChangesRef.current = true;
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      emitChange(newValue);
    }, 500);
  }, [emitChange]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const handleBold = () => execCommand('bold');
  const handleItalic = () => execCommand('italic');
  const handleUnderline = () => execCommand('underline');
  const handleBulletList = () => execCommand('insertUnorderedList');
  const handleNumberedList = () => execCommand('insertOrderedList');
  const handleSubheading = () => {
    // Apply both bold and underline as inline character styles
    execCommand('bold');
    execCommand('underline');
  };
  const handleAlignLeft = () => execCommand('justifyLeft');
  const handleAlignCenter = () => execCommand('justifyCenter');
  const handleAlignRight = () => execCommand('justifyRight');
  const handleAlignJustify = () => execCommand('justifyFull');

  const insertTable = (rows: number, cols: number) => {
    if (!editorRef.current) return;
    
    // Build table HTML with header row
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

  const showPlaceholder = !value && !isFocused;

  return (
    <div className={cn("border rounded-md overflow-hidden", disabled && "opacity-50", className)}>
      {/* Toolbar - matches Part B formatting toolbar order */}
      {!disabled && !hideToolbar && (
        <div className="flex items-center gap-0 p-1.5 border-b bg-muted/30 flex-wrap">
          {/* Subheading dropdown */}
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
                const h3s = editorRef.current?.querySelectorAll('h3') || [];
                const nextNum = h3s.length + 1;
                execCommand('formatBlock', '<h3>');
                execCommand('insertText', `${nextNum}. `);
              }}>
                <span className="text-sm font-semibold">Numbered subheading</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                handleSubheading();
              }}>
                <span className="text-sm font-bold underline">Unnumbered subheading</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Bold, Italic, Underline */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleBold}>
                <span className="font-black text-sm">B</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Bold (Ctrl+B)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleItalic}>
                <Italic className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Italic (Ctrl+I)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleUnderline}>
                <Underline className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Underline (Ctrl+U)</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-5 mx-1.5" />

          {/* Lists */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleBulletList}>
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Bullet list</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleNumberedList}>
                <ListOrdered className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Numbered list</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-5 mx-1.5" />

          {/* Alignment */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleAlignLeft}>
                <AlignLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Align left</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleAlignCenter}>
                <AlignCenter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Align center</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleAlignRight}>
                <AlignRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Align right</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleAlignJustify}>
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
          {onOpenFigureDialog && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={onOpenFigureDialog}>
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
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={onOpenCitationDialog}>
                  <FileText className="h-4 w-4" />
                  <span className="text-xs">Citations</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Manage citations</TooltipContent>
            </Tooltip>
          )}

          {/* Cross-ref dropdown */}
          {(onOpenCrossRefDialog || onOpenWPRefDialog || onInsertTaskRef || onInsertDeliverableRef || onOpenParticipantRefDialog) && (
            <DropdownMenu onOpenChange={(open) => { if (open) onSaveSelection?.(); }}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1">
                      <Link2 className="w-4 h-4" />
                      <span className="text-xs">Cross-ref</span>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Insert cross-reference</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="w-64 bg-popover z-50">
                {onOpenCrossRefDialog && (
                  <DropdownMenuItem onClick={onOpenCrossRefDialog} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0"><ImageIcon className="w-3.5 h-3.5 text-foreground" /></span>
                    <span>Figure / Table number</span>
                  </DropdownMenuItem>
                )}
                {onOpenWPRefDialog && (
                  <DropdownMenuItem onClick={onOpenWPRefDialog} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0">
                      <span style={{ display: 'inline-block', width: '22px', height: '14px', backgroundColor: '#2563EB', border: '1.5px solid #2563EB', borderRadius: '9999px' }} />
                    </span>
                    <span>Work package</span>
                  </DropdownMenuItem>
                )}
                {onInsertTaskRef && (
                  <DropdownMenuItem onClick={() => setIsTaskRefOpen(true)} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0">
                      <span style={{ display: 'inline-block', width: '22px', height: '14px', borderRadius: '9999px', border: '1.5px solid #2563EB', background: '#ffffff' }} />
                    </span>
                    <span>Task</span>
                  </DropdownMenuItem>
                )}
                {onInsertDeliverableRef && (
                  <DropdownMenuItem onClick={() => setIsDeliverableRefOpen(true)} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0">
                      <span style={{ display: 'inline-block', width: '22px', height: '14px', background: '#2563EB', clipPath: 'polygon(0% 0%, calc(100% - 6px) 0%, 100% 50%, calc(100% - 6px) 100%, 0% 100%)', position: 'relative' }}>
                        <span style={{ position: 'absolute', inset: '1.5px', right: '2px', background: '#ffffff', clipPath: 'polygon(0% 0%, calc(100% - 5px) 0%, 100% 50%, calc(100% - 5px) 100%, 0% 100%)' }} />
                      </span>
                    </span>
                    <span>Deliverable</span>
                  </DropdownMenuItem>
                )}
                {onOpenParticipantRefDialog && (
                  <DropdownMenuItem onClick={onOpenParticipantRefDialog} className="flex items-center gap-2">
                    <span className="w-16 flex justify-start shrink-0">
                      <span style={{ display: 'inline-block', width: '22px', height: '14px', backgroundColor: '#000000', border: '1.5px solid #000000', borderRadius: '9999px' }} />
                    </span>
                    <span>Participant</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* T/D Reference Dialogs (dialogsOnly mode) */}
          {proposalId && onInsertTaskRef && onInsertDeliverableRef && onInsertMilestoneRef && (
            <InsertTDMSReferenceDropdowns
              proposalId={proposalId}
              disabled={disabled}
              onInsertTask={onInsertTaskRef}
              onInsertDeliverable={onInsertDeliverableRef}
              onInsertMilestone={onInsertMilestoneRef}
              dialogsOnly
              openTask={isTaskRefOpen}
              onOpenTaskChange={setIsTaskRefOpen}
              openDeliverable={isDeliverableRefOpen}
              onOpenDeliverableChange={setIsDeliverableRefOpen}
              hideMilestone
            />
          )}
        </div>
      )}
      
      {/* Editor */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onPaste={(e: React.ClipboardEvent) => {
            e.preventDefault();
            const html = e.clipboardData.getData('text/html');
            const text = e.clipboardData.getData('text/plain');
            if (html) {
              const tmp = document.createElement('div');
              tmp.innerHTML = html;
              tmp.querySelectorAll('*').forEach(el => {
                const h = el as HTMLElement;
                if (h.style) { h.style.fontSize = ''; h.style.lineHeight = ''; h.style.fontFamily = ''; }
                if (el.tagName === 'FONT') { const s = document.createElement('span'); s.innerHTML = el.innerHTML; el.replaceWith(s); }
              });
              document.execCommand('insertHTML', false, tmp.innerHTML);
            } else {
              document.execCommand('insertText', false, text);
            }
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            flushPendingChange();
            setIsFocused(false);
          }}
          className={cn(
            "p-3 outline-none resize-y overflow-auto text-draft",
            "[&_p]:mt-[6pt] [&_p]:mb-[6pt] [&_div]:mt-[6pt] [&_div]:mb-[6pt]",
            "[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4",
            "[&_table]:w-full [&_table]:border-collapse",
            "[&_th]:border [&_th]:border-foreground [&_th]:p-1 [&_th]:bg-foreground [&_th]:text-background [&_th]:font-bold",
            "[&_td]:border [&_td]:border-foreground [&_td]:p-1",
            disabled && "cursor-not-allowed"
          )}
          style={{ minHeight, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}
          suppressContentEditableWarning
        />
        {showPlaceholder && (
          <div className="absolute top-3 left-3 text-muted-foreground text-draft pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
