import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, FileText, Link2, Layers, Table2, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface WPSimpleEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minHeight?: string;
  // Dialog handlers for advanced features
  onOpenCitationDialog?: () => void;
  onOpenCrossRefDialog?: () => void;
  onOpenWPRefDialog?: () => void;
  onOpenFigureDialog?: () => void;
}

export function WPSimpleEditor({
  value,
  onChange,
  placeholder = '',
  className,
  disabled = false,
  minHeight = '100px',
  onOpenCitationDialog,
  onOpenCrossRefDialog,
  onOpenWPRefDialog,
  onOpenFigureDialog,
}: WPSimpleEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  // Set initial content
  useEffect(() => {
    if (editorRef.current && isInitialMount.current) {
      editorRef.current.innerHTML = value || '';
      isInitialMount.current = false;
    }
  }, []);

  // Sync external value changes
  useEffect(() => {
    if (editorRef.current && !isFocused) {
      const currentContent = editorRef.current.innerHTML;
      if (currentContent !== value) {
        editorRef.current.innerHTML = value || '';
      }
    }
  }, [value, isFocused]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    
    const newValue = editorRef.current.innerHTML;
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onChange(newValue);
    }, 500);
  }, [onChange]);

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
      {!disabled && (
        <div className="flex items-center gap-0.5 p-1.5 border-b bg-muted/30 flex-wrap">
          {/* Subheading first */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={handleSubheading}
              >
                <span className="text-xs font-black underline">Subheading</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Subheading (Bold & Underlined)
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Bold, Italic, Underline */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleBold}
                >
                  <span className="font-black text-sm">B</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Bold (Ctrl+B)
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleItalic}
                >
                  <Italic className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Italic (Ctrl+I)
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleUnderline}
                >
                  <Underline className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Underline (Ctrl+U)
              </TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Bullet List, Numbered List */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleBulletList}
                >
                  <List className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Bullet List
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleNumberedList}
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Numbered List
              </TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Alignment */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleAlignLeft}
                >
                  <AlignLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Align Left
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleAlignCenter}
                >
                  <AlignCenter className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Align Center
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleAlignRight}
                >
                  <AlignRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Align Right
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleAlignJustify}
                >
                  <AlignJustify className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Justify
              </TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Insert tools: Citation, Cross-ref, WP, Table, Figure */}
          <div className="flex items-center gap-0.5">
            {/* Citation */}
            {onOpenCitationDialog && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={onOpenCitationDialog}
                  >
                    <FileText className="h-4 w-4" />
                    <span className="text-xs">Citation</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Add Citation
                </TooltipContent>
              </Tooltip>
            )}

            {/* Cross-reference */}
            {onOpenCrossRefDialog && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={onOpenCrossRefDialog}
                  >
                    <Link2 className="h-4 w-4" />
                    <span className="text-xs">Cross-ref</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Insert Cross-reference
                </TooltipContent>
              </Tooltip>
            )}

            {/* WP Mention */}
            {onOpenWPRefDialog && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={onOpenWPRefDialog}
                  >
                    <Layers className="h-4 w-4" />
                    <span className="text-xs">WP</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Insert WP Reference
                </TooltipContent>
              </Tooltip>
            )}

            {/* Table */}
            <Popover open={tablePopoverOpen} onOpenChange={setTablePopoverOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 gap-1"
                    >
                      <Table2 className="h-4 w-4" />
                      <span className="text-xs">Table</span>
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Insert Table
                </TooltipContent>
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={onOpenFigureDialog}
                  >
                    <ImageIcon className="h-4 w-4" />
                    <span className="text-xs">Figure</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Insert Figure
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      )}
      
      {/* Editor */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            "p-3 outline-none resize-y overflow-auto text-sm",
            "[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4",
            "[&_table]:w-full [&_table]:border-collapse",
            "[&_th]:border [&_th]:border-foreground [&_th]:p-1 [&_th]:bg-foreground [&_th]:text-background [&_th]:font-bold",
            "[&_td]:border [&_td]:border-foreground [&_td]:p-1",
            disabled && "cursor-not-allowed"
          )}
          style={{ minHeight, fontFamily: 'Arial, Helvetica, sans-serif' }}
          suppressContentEditableWarning
        />
        {showPlaceholder && (
          <div className="absolute top-3 left-3 text-muted-foreground text-sm pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
