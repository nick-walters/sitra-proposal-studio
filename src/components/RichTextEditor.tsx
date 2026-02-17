import { useEditor, EditorContent, Editor, Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { ResizableImage } from './ResizableImage';
import { ImageCropDialog } from './ImageCropDialog';
import { createCitationTooltipPlugin } from './CitationMark';
import { BlockReordering } from '@/extensions/BlockReordering';
import { BlockDragHandle } from '@/extensions/BlockDragHandle';
import { TrackChanges, TrackChangesOptions } from '@/extensions/TrackChanges';
import { TableFormula } from '@/extensions/TableFormula';
import { WPReferenceMark } from '@/extensions/WPReferenceMark';
import { CaseReferenceMark } from '@/extensions/CaseReferenceMark';
import { ParticipantReferenceMark } from '@/extensions/ParticipantReferenceMark';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Undo,
  Redo,
  Table as TableIcon,
  Plus,
  Minus,
  Trash2,
  Crop,
  ImageIcon,
  Lock,
  Unlock,
  Percent,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  RefreshCw,
  Combine,
  SplitSquareHorizontal,
  Calculator,
  FileText,
  Link2,
  Layers,
  Building2,
  Columns,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useCallback, useState, useRef, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onInsertImage?: () => void;
  onInsertFootnote?: () => void;
  className?: string;
  renderToolbar?: (editor: Editor) => React.ReactNode;
  sectionNumber?: string; // Section number for caption numbering (e.g., "1.1")
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}

function ToolbarButton({ icon, tooltip, onClick, active, disabled }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// Table size selector grid
function TableSizeSelector({ onSelect }: { onSelect: (rows: number, cols: number) => void }) {
  const [hoveredRows, setHoveredRows] = useState(0);
  const [hoveredCols, setHoveredCols] = useState(0);
  const maxRows = 8;
  const maxCols = 8;

  return (
    <div className="p-2">
      <div className="text-xs text-muted-foreground mb-2 text-center">
        {hoveredRows > 0 && hoveredCols > 0 
          ? `${hoveredRows} × ${hoveredCols} table` 
          : 'Select table size'}
      </div>
      <div 
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${maxCols}, 1fr)` }}
        onMouseLeave={() => { setHoveredRows(0); setHoveredCols(0); }}
      >
        {Array.from({ length: maxRows * maxCols }).map((_, index) => {
          const row = Math.floor(index / maxCols) + 1;
          const col = (index % maxCols) + 1;
          const isHighlighted = row <= hoveredRows && col <= hoveredCols;
          const isHeaderRow = row === 1 && isHighlighted;
          
          return (
            <button
              key={index}
              className={`w-4 h-4 border rounded-sm transition-colors ${
                isHeaderRow
                  ? 'bg-foreground border-foreground'
                  : isHighlighted 
                    ? 'bg-primary/40 border-primary/60'
                    : 'bg-muted border-border hover:border-primary/50'
              }`}
              onMouseEnter={() => { setHoveredRows(row); setHoveredCols(col); }}
              onClick={() => onSelect(row, col)}
            />
          );
        })}
      </div>
    </div>
  );
}

// Export the formatting toolbar as a separate component
export function FormattingToolbar({ 
  editor,
  sectionNumber,
  content,
  onOpenFigureDialog,
  onOpenFormulaDialog,
  onOpenCitationDialog,
  onOpenCrossRefDialog,
  onOpenWPRefDialog,
  onOpenParticipantRefDialog,
  isPartB = false,
  isReadOnly = false,
}: { 
  editor: Editor | null;
  sectionNumber?: string;
  content?: string;
  onOpenFigureDialog?: () => void;
  onOpenFormulaDialog?: () => void;
  onOpenCitationDialog?: () => void;
  onOpenCrossRefDialog?: () => void;
  onOpenWPRefDialog?: () => void;
  onOpenParticipantRefDialog?: () => void;
  isPartB?: boolean;
  isReadOnly?: boolean;
}) {
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState('');
  const [imageWidth, setImageWidth] = useState('');
  const [imageHeight, setImageHeight] = useState('');
  const [imageWidthPercent, setImageWidthPercent] = useState('');
  const [widthMode, setWidthMode] = useState<'px' | '%'>('px');
  const [aspectRatio, setAspectRatio] = useState(1);
  const [aspectRatioLocked, setAspectRatioLocked] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Check if an image is selected and get its attributes
  const isImageSelected = editor?.isActive('image');
  const selectedImageAttrs = isImageSelected ? editor?.getAttributes('image') : null;
  const currentImageAlignment = selectedImageAttrs?.alignment || 'center';
  
  // Update image dimension inputs when selection changes
  useEffect(() => {
    if (selectedImageAttrs) {
      const w = selectedImageAttrs.width || '';
      const h = selectedImageAttrs.height || '';
      const wp = selectedImageAttrs.widthPercent || '';
      
      setImageWidth(w.toString());
      setImageHeight(h.toString());
      setImageWidthPercent(wp.toString());
      
      // Set mode based on current image attributes
      if (wp && Number(wp) > 0) {
        setWidthMode('%');
      } else {
        setWidthMode('px');
      }
      
      if (w && h) {
        setAspectRatio(Number(w) / Number(h));
      }
    } else {
      setImageWidth('');
      setImageHeight('');
      setImageWidthPercent('');
    }
  }, [selectedImageAttrs?.width, selectedImageAttrs?.height, selectedImageAttrs?.widthPercent, isImageSelected]);

  const handleWidthChange = useCallback((value: string) => {
    setImageWidth(value);
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0 && editor) {
      if (aspectRatioLocked) {
        const newHeight = Math.round(numValue / aspectRatio);
        setImageHeight(newHeight.toString());
        editor.commands.updateAttributes('image', { width: numValue, height: newHeight, widthPercent: null });
      } else {
        editor.commands.updateAttributes('image', { width: numValue, widthPercent: null });
      }
    }
  }, [editor, aspectRatio, aspectRatioLocked]);

  const handleHeightChange = useCallback((value: string) => {
    setImageHeight(value);
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0 && editor) {
      if (aspectRatioLocked) {
        const newWidth = Math.round(numValue * aspectRatio);
        setImageWidth(newWidth.toString());
        editor.commands.updateAttributes('image', { width: newWidth, height: numValue, widthPercent: null });
      } else {
        editor.commands.updateAttributes('image', { height: numValue, widthPercent: null });
      }
    }
  }, [editor, aspectRatio, aspectRatioLocked]);

  const handleWidthPercentChange = useCallback((value: string) => {
    setImageWidthPercent(value);
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0 && numValue <= 100 && editor) {
      editor.commands.updateAttributes('image', { widthPercent: numValue });
    }
  }, [editor]);

  const toggleWidthMode = useCallback(() => {
    if (!editor) return;
    const newMode = widthMode === 'px' ? '%' : 'px';
    setWidthMode(newMode);
    
    if (newMode === '%') {
      // Switch to percentage mode - default to 100%
      const defaultPercent = imageWidthPercent || '100';
      setImageWidthPercent(defaultPercent);
      editor.commands.updateAttributes('image', { widthPercent: parseInt(defaultPercent) });
    } else {
      // Switch to pixel mode - clear percentage
      editor.commands.updateAttributes('image', { widthPercent: null });
    }
  }, [editor, widthMode, imageWidthPercent]);

  const handleCropClick = useCallback(() => {
    if (selectedImageAttrs?.src) {
      setCropImageSrc(selectedImageAttrs.src);
      setIsCropOpen(true);
    }
  }, [selectedImageAttrs]);

  const handleCropComplete = useCallback((croppedImageUrl: string) => {
    if (editor) {
      editor.commands.updateAttributes('image', { src: croppedImageUrl });
    }
  }, [editor]);

  const setImageAlignment = useCallback((alignment: 'left' | 'center' | 'right') => {
    if (editor) {
      editor.commands.updateAttributes('image', { alignment });
    }
  }, [editor]);

  // Delete figure with its caption (paragraph after the image)
  const deleteFigureWithCaption = useCallback(() => {
    if (!editor) return;
    
    const { state } = editor;
    const { selection } = state;
    const { $from } = selection;
    
    // Find the image node position
    let imagePos = $from.before($from.depth);
    let imageNode = state.doc.nodeAt(imagePos);
    
    // If not directly on image, try to find it
    if (!imageNode || imageNode.type.name !== 'image') {
      // Check if selection is on the image
      const node = $from.nodeAfter;
      if (node && node.type.name === 'image') {
        imagePos = $from.pos;
        imageNode = node;
      }
    }
    
    if (!imageNode || imageNode.type.name !== 'image') return;
    
    let deleteEnd = imagePos + imageNode.nodeSize;
    
    // Check if next node is a figure caption paragraph
    const afterPos = imagePos + imageNode.nodeSize;
    if (afterPos < state.doc.content.size) {
      const $afterPos = state.doc.resolve(afterPos);
      const afterNode = $afterPos.nodeAfter;
      if (afterNode && afterNode.type.name === 'paragraph') {
        const textContent = afterNode.textContent.toLowerCase();
        const hasClass = afterNode.attrs?.class || '';
        if (textContent.startsWith('figure ') || hasClass.includes('figure-caption')) {
          deleteEnd = afterPos + afterNode.nodeSize;
        }
      }
    }
    
    // Delete the figure and its caption
    editor.chain()
      .focus()
      .deleteRange({ from: imagePos, to: deleteEnd })
      .run();
  }, [editor]);

  // Replace figure - opens figure dialog
  const replaceFigure = useCallback(() => {
    if (onOpenFigureDialog) {
      onOpenFigureDialog();
    }
  }, [onOpenFigureDialog]);

  
  const setLink = useCallback(() => {
    if (!editor) return;
    
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  // Helper to extract section number without "B" prefix
  const getSectionNumberWithoutPrefix = useCallback((sectionNum: string) => {
    return sectionNum.replace(/^[A-Za-z]+/, '');
  }, []);

  // Helper to get the next table letter for the current section
  const getNextTableLetter = useCallback(() => {
    if (!content || !sectionNumber) return 'a';
    const cleanSectionNum = getSectionNumberWithoutPrefix(sectionNumber);
    const tablePattern = new RegExp(`Table ${cleanSectionNum.replace('.', '\\.')}\\.([a-z])`, 'g');
    const matches = content.match(tablePattern) || [];
    const nextLetterCode = 'a'.charCodeAt(0) + matches.length;
    return String.fromCharCode(nextLetterCode);
  }, [content, sectionNumber, getSectionNumberWithoutPrefix]);

  const insertTable = useCallback((rows: number, cols: number) => {
    if (!editor) return;
    
    // Get the table label (without B prefix)
    const sectionNum = getSectionNumberWithoutPrefix(sectionNumber || '1.1');
    const tableLetter = getNextTableLetter();
    const tableLabel = `Table ${sectionNum}.${tableLetter}`;
    
    // Insert caption paragraph first (italic text, bold label), then table
    editor.chain()
      .focus()
      .insertContent(`<p class="table-caption"><em><strong>${tableLabel}.</strong> </em></p>`)
      .insertTable({ rows, cols, withHeaderRow: true })
      .run();
    
    setTablePopoverOpen(false);
  }, [editor, sectionNumber, getNextTableLetter, getSectionNumberWithoutPrefix]);

  if (!editor) {
    return null;
  }

  const isInTable = editor.isActive('table');

  return (
    <div className="editor-toolbar border-b border-border bg-card px-2 py-1">
      <div className="flex items-center gap-0.5">
        {/* Undo Redo */}
        <ToolbarButton 
          icon={<Undo className="w-4 h-4" />} 
          tooltip="Undo (Ctrl+Z)"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        />
        <ToolbarButton 
          icon={<Redo className="w-4 h-4" />} 
          tooltip="Redo (Ctrl+Y)"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Subheading Bold Italic Underline */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={editor.isActive('bold') && editor.isActive('underline') ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                editor.chain().focus().toggleBold().run();
                editor.chain().focus().toggleUnderline().run();
              }}
            >
              <span className="font-black underline">Subheading</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Subheading (Bold & Underlined inline style)
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={editor.isActive('bold') ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <span className="font-black text-sm">B</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Bold (Ctrl+B)
          </TooltipContent>
        </Tooltip>
        <ToolbarButton
          icon={<Italic className="w-4 h-4" />} 
          tooltip="Italic (Ctrl+I)"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
        />
        <ToolbarButton 
          icon={<UnderlineIcon className="w-4 h-4" />} 
          tooltip="Underline (Ctrl+U)"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
        />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Bullet Numbered */}
        <ToolbarButton 
          icon={<List className="w-4 h-4" />} 
          tooltip="Bullet List"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
        />
        <ToolbarButton 
          icon={<ListOrdered className="w-4 h-4" />} 
          tooltip="Numbered List"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
        />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Left Centre Right Justify */}
        <ToolbarButton 
          icon={<AlignLeft className="w-4 h-4" />} 
          tooltip="Align Left"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
        />
        <ToolbarButton 
          icon={<AlignCenter className="w-4 h-4" />} 
          tooltip="Align Center"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
        />
        <ToolbarButton 
          icon={<AlignRight className="w-4 h-4" />} 
          tooltip="Align Right"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
        />
        <ToolbarButton 
          icon={<AlignJustify className="w-4 h-4" />} 
          tooltip="Justify"
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          active={editor.isActive({ textAlign: 'justify' })}
        />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Table */}
        {!isInTable ? (
          <Popover open={tablePopoverOpen} onOpenChange={setTablePopoverOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1"
                  >
                    <TableIcon className="w-4 h-4" />
                    <span className="text-xs">Table</span>
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Insert Table
              </TooltipContent>
            </Tooltip>
            <PopoverContent align="start" className="w-auto p-0">
              <TableSizeSelector onSelect={insertTable} />
            </PopoverContent>
          </Popover>
        ) : (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                  >
                    <TableIcon className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Table Options
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => editor.chain().focus().addColumnBefore().run()}>
                <Plus className="w-4 h-4 mr-2" />
                Add column before
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
                <Plus className="w-4 h-4 mr-2" />
                Add column after
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>
                <Minus className="w-4 h-4 mr-2" />
                Delete column
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => editor.chain().focus().addRowBefore().run()}>
                <Plus className="w-4 h-4 mr-2" />
                Add row before
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>
                <Plus className="w-4 h-4 mr-2" />
                Add row after
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().deleteRow().run()}>
                <Minus className="w-4 h-4 mr-2" />
                Delete row
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => editor.chain().focus().mergeCells().run()}>
                <Combine className="w-4 h-4 mr-2" />
                Merge cells
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().splitCell().run()}>
                <SplitSquareHorizontal className="w-4 h-4 mr-2" />
                Split cell
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onOpenFormulaDialog?.()}>
                <Calculator className="w-4 h-4 mr-2" />
                Insert Formula
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                // Find the table element the cursor is in
                const { $from } = editor.state.selection;
                let depth = $from.depth;
                while (depth > 0) {
                  const node = $from.node(depth);
                  if (node.type.name === 'table') {
                    const dom = editor.view.nodeDOM($from.before(depth));
                    if (dom instanceof HTMLTableElement) {
                      const widths = computeAutoFitSmart(dom);
                      if (widths) {
                        const colgroup = dom.querySelector('colgroup');
                        if (colgroup) {
                          const cols = colgroup.querySelectorAll('col');
                          cols.forEach((col, i) => {
                            if (i < widths.length) {
                              (col as HTMLElement).style.width = `${widths[i]}px`;
                              (col as HTMLElement).style.minWidth = `${widths[i]}px`;
                            }
                          });
                        }
                      }
                    }
                    break;
                  }
                  depth--;
                }
              }}>
                <Columns className="w-4 h-4 mr-2" />
                Auto-resize columns
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => editor.chain().focus().deleteTable().run()}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Figure */}
        {isPartB && onOpenFigureDialog && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1"
                onClick={onOpenFigureDialog}
                disabled={isReadOnly}
              >
                <ImageIcon className="w-4 h-4" />
                <span className="text-xs">Figure</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Insert Figure
            </TooltipContent>
          </Tooltip>
        )}

        {/* Image controls - show when image is selected */}
        {isImageSelected && (
          <>
            <Separator orientation="vertical" className="h-5 mx-1.5" />
            <div className="flex items-center gap-1">
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
              
              {/* Mode toggle button */}
              <ToolbarButton
                icon={<Percent className="w-3 h-3" />}
                tooltip={widthMode === 'px' ? "Switch to percentage width" : "Switch to pixel width"}
                onClick={toggleWidthMode}
                active={widthMode === '%'}
              />
              
              {widthMode === '%' ? (
                <>
                  <Input
                    type="number"
                    value={imageWidthPercent}
                    onChange={(e) => handleWidthPercentChange(e.target.value)}
                    className="w-16 h-7 text-xs"
                    placeholder="%"
                    title="Width (%)"
                    min={1}
                    max={100}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </>
              ) : (
                <>
                  <Input
                    type="number"
                    value={imageWidth}
                    onChange={(e) => handleWidthChange(e.target.value)}
                    className="w-16 h-7 text-xs"
                    placeholder="W"
                    title="Width (px)"
                  />
                  <ToolbarButton
                    icon={aspectRatioLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    tooltip={aspectRatioLocked ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                    onClick={() => setAspectRatioLocked(!aspectRatioLocked)}
                    active={aspectRatioLocked}
                  />
                  <Input
                    type="number"
                    value={imageHeight}
                    onChange={(e) => handleHeightChange(e.target.value)}
                    className="w-16 h-7 text-xs"
                    placeholder="H"
                    title="Height (px)"
                  />
                </>
              )}
              
              <ToolbarButton
                icon={<Crop className="w-4 h-4" />}
                tooltip="Crop image"
                onClick={handleCropClick}
              />
              
              <Separator orientation="vertical" className="h-5 mx-1" />
              
              {/* Image alignment controls */}
              <ToolbarButton
                icon={<AlignHorizontalJustifyStart className="w-4 h-4" />}
                tooltip="Align left"
                onClick={() => setImageAlignment('left')}
                active={currentImageAlignment === 'left'}
              />
              <ToolbarButton
                icon={<AlignHorizontalJustifyCenter className="w-4 h-4" />}
                tooltip="Align center"
                onClick={() => setImageAlignment('center')}
                active={currentImageAlignment === 'center'}
              />
              <ToolbarButton
                icon={<AlignHorizontalJustifyEnd className="w-4 h-4" />}
                tooltip="Align right"
                onClick={() => setImageAlignment('right')}
                active={currentImageAlignment === 'right'}
              />
              
              <Separator orientation="vertical" className="h-5 mx-1" />
              
              {/* Replace and Delete figure */}
              {onOpenFigureDialog && (
                <ToolbarButton
                  icon={<RefreshCw className="w-4 h-4" />}
                  tooltip="Replace figure"
                  onClick={replaceFigure}
                />
              )}
              <ToolbarButton
                icon={<Trash2 className="w-4 h-4 text-destructive" />}
                tooltip="Delete figure with caption"
                onClick={() => setShowDeleteConfirm(true)}
              />
            </div>
          </>
        )}
      </div>

      {/* Crop Dialog */}
      <ImageCropDialog
        isOpen={isCropOpen}
        onClose={() => setIsCropOpen(false)}
        imageSrc={cropImageSrc}
        onCrop={handleCropComplete}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Figure</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this figure and its caption? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteFigureWithCaption();
                setShowDeleteConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RichTextEditor({ content, onChange, onInsertImage, onInsertFootnote, className, renderToolbar }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        defaultAlignment: 'justify',
      }),
      ResizableImage,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'he-table',
        },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: {
          class: 'he-table-header',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'he-table-cell',
        },
      }),
      BlockReordering,
      WPReferenceMark,
      CaseReferenceMark,
      // Prevent tables from being first element in the document content
      Extension.create({
        name: 'preventTableAtStart',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey('preventTableAtStart'),
              appendTransaction(transactions, oldState, newState) {
                // Only process if document changed
                const docChanged = transactions.some(tr => tr.docChanged);
                if (!docChanged) return null;

                const doc = newState.doc;
                if (doc.childCount === 0) return null;

                // Check if first child is a table
                const firstChild = doc.child(0);
                if (firstChild.type.name !== 'table') return null;

                // Insert empty paragraph at position 0 (before the table)
                const paragraphNode = newState.schema.nodes.paragraph.create();
                const tr = newState.tr.insert(0, paragraphNode);
                return tr;
              },
            }),
          ];
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'document-content min-h-[400px] outline-none prose prose-sm max-w-none',
        style: 'font-family: "Times New Roman", Times, serif',
      },
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className={className}>
      {/* Allow external toolbar rendering or use default */}
      {renderToolbar ? renderToolbar(editor) : (
        <FormattingToolbar editor={editor} />
      )}

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}

// Hook to get editor instance for external toolbar control
export function useRichTextEditor({ 
  content, 
  onChange,
  getReference,
  trackChanges,
  blockLocking,
  onBlockDeleteRequest,
}: { 
  content: string; 
  onChange: (content: string) => void;
  getReference?: (citationNumber: number) => { citation: string } | undefined;
  trackChanges?: {
    enabled: boolean;
    authorId: string;
    authorName: string;
    authorColor: string;
    onChangesUpdate?: (changes: any[]) => void;
  };
  blockLocking?: {
    getLockedBlocks: () => { userId: string; blockId: string; blockType: string }[];
    getCurrentUserId: () => string | null;
  };
  onBlockDeleteRequest?: (deleteCallback: () => void) => void;
}) {
  // Track the last content we set to the editor to avoid infinite loops
  const lastSetContentRef = useRef<string>(content);
  // Store getReference in a ref to avoid recreating the extension
  const getReferenceRef = useRef(getReference);
  getReferenceRef.current = getReference;
  // Store track changes config in a ref
  const trackChangesRef = useRef(trackChanges);
  // Store block locking config in refs
  const getLockedBlocksRef = useRef(blockLocking?.getLockedBlocks || (() => []));
  const getCurrentUserIdRef = useRef(blockLocking?.getCurrentUserId || (() => null));
  // Store delete request handler in ref
  const onBlockDeleteRequestRef = useRef(onBlockDeleteRequest);
  onBlockDeleteRequestRef.current = onBlockDeleteRequest;
  
  // Update refs when props change
  useEffect(() => {
    if (blockLocking) {
      getLockedBlocksRef.current = blockLocking.getLockedBlocks;
      getCurrentUserIdRef.current = blockLocking.getCurrentUserId;
    }
  }, [blockLocking]);
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        defaultAlignment: 'justify',
      }),
      ResizableImage,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'he-table',
        },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: {
          class: 'he-table-header',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'he-table-cell',
        },
      }),
      // Block reordering via keyboard shortcuts (Ctrl+Shift+↑/↓)
      BlockReordering,
      // WP reference marks for inline WP badges
      WPReferenceMark,
      // Participant reference marks for inline partner badges
      ParticipantReferenceMark,
      // Block drag-and-drop via drag handle
      BlockDragHandle.configure({
        getLockedBlocks: () => getLockedBlocksRef.current(),
        getCurrentUserId: () => getCurrentUserIdRef.current(),
        onDeleteRequest: (callback) => {
          if (onBlockDeleteRequestRef.current) {
            onBlockDeleteRequestRef.current(callback);
          } else {
            // No confirmation handler, just execute
            callback();
          }
        },
      }),
      Extension.create({
        name: 'citationTooltip',
        addProseMirrorPlugins() {
          return [
            createCitationTooltipPlugin((num) => getReferenceRef.current?.(num)),
          ];
        },
      }),
      // Add block locking extension
      Extension.create({
        name: 'blockLocking',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey('blockLocking'),
              filterTransaction(tr, state) {
                // Allow non-content changes
                if (!tr.docChanged) return true;

                const lockedBlocks = getLockedBlocksRef.current();
                if (lockedBlocks.length === 0) return true;

                const userId = getCurrentUserIdRef.current();
                const lockedBlockIds = new Set(
                  lockedBlocks
                    .filter(lock => lock.userId !== userId)
                    .map(lock => lock.blockId)
                );

                if (lockedBlockIds.size === 0) return true;

                // Check if transaction affects locked block
                let affectsLocked = false;
                tr.steps.forEach((step) => {
                  const stepMap = step.getMap();
                  stepMap.forEach((oldStart, oldEnd) => {
                    for (let pos = oldStart; pos <= Math.min(oldEnd, state.doc.content.size); pos++) {
                      try {
                        const $pos = state.doc.resolve(pos);
                        let depth = $pos.depth;
                        while (depth > 1) depth--;
                        if (depth >= 1) {
                          const node = $pos.node(depth);
                          const start = $pos.start(depth);
                          const blockId = `${start}-${node.type.name}`;
                          if (lockedBlockIds.has(blockId)) {
                            affectsLocked = true;
                          }
                        }
                      } catch {
                        // Ignore invalid positions
                      }
                    }
                  });
                });

                return !affectsLocked;
              },
            }),
          ];
        },
      }),
      // Track changes extension
      // Track changes extension
      TrackChanges.configure({
        enabled: trackChanges?.enabled || false,
        authorId: trackChanges?.authorId || '',
        authorName: trackChanges?.authorName || 'Anonymous',
        authorColor: trackChanges?.authorColor || '#3B82F6',
        changes: [],
        onChangesUpdate: trackChanges?.onChangesUpdate,
      }),
      // Table formula extension
      TableFormula,
      // Prevent tables from being first element in the document content
      Extension.create({
        name: 'preventTableAtStart',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey('preventTableAtStart'),
              appendTransaction(transactions, oldState, newState) {
                // Only process if document changed
                const docChanged = transactions.some(tr => tr.docChanged);
                if (!docChanged) return null;

                const doc = newState.doc;
                if (doc.childCount === 0) return null;

                // Check if first child is a table
                const firstChild = doc.child(0);
                if (firstChild.type.name !== 'table') return null;

                // Insert empty paragraph at position 0 (before the table)
                const paragraphNode = newState.schema.nodes.paragraph.create();
                const tr = newState.tr.insert(0, paragraphNode);
                return tr;
              },
            }),
          ];
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastSetContentRef.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'document-content min-h-[400px] outline-none prose prose-sm max-w-none',
        style: 'font-family: "Times New Roman", Times, serif',
      },
    },
  });

  // Sync editor content when content prop changes externally (e.g., from DB load)
  // Only update if content changed from external source (not from our own typing)
  useEffect(() => {
    if (editor && content !== lastSetContentRef.current) {
      lastSetContentRef.current = content;
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [editor, content]);

  // Sync track changes enabled state
  useEffect(() => {
    if (!editor) return;
    trackChangesRef.current = trackChanges;
    const storage = (editor.storage as any).trackChanges;
    if (storage && storage.enabled !== trackChanges?.enabled) {
      storage.enabled = trackChanges?.enabled || false;
      // Force re-render of decorations
      editor.view.dispatch(editor.state.tr);
    }
    // Keep all track change options in sync (author info + callbacks)
    const ext = editor.extensionManager.extensions.find(e => e.name === 'trackChanges');
    if (ext) {
      ext.options.onChangesUpdate = trackChanges?.onChangesUpdate;
      ext.options.authorId = trackChanges?.authorId || '';
      ext.options.authorName = trackChanges?.authorName || 'Anonymous';
      ext.options.authorColor = trackChanges?.authorColor || '#3B82F6';
    }
  }, [editor, trackChanges?.enabled, trackChanges?.onChangesUpdate,
      trackChanges?.authorId, trackChanges?.authorName, trackChanges?.authorColor]);

  // Scan document for existing track change marks on load
  useEffect(() => {
    if (!editor || !trackChanges?.onChangesUpdate) return;
    // Wait a tick for content to be fully set
    const timer = setTimeout(() => {
      const doc = editor.state.doc;
      const schema = editor.state.schema;
      const insertionType = schema.marks.trackInsertion;
      const deletionType = schema.marks.trackDeletion;
      if (!insertionType && !deletionType) return;

      const changes: any[] = [];
      doc.descendants((node: any, pos: number) => {
        if (!node.isText) return;
        for (const mark of node.marks) {
          if (mark.type === insertionType || mark.type === deletionType) {
            const attrs = mark.attrs;
            const markEnd = pos + node.nodeSize;
            const existing = changes.find((c: any) => c.id === attrs.changeId);
            if (existing) {
              existing.from = Math.min(existing.from, pos);
              existing.to = Math.max(existing.to, markEnd);
              existing.content = doc.textBetween(existing.from, existing.to, ' ');
            } else {
              changes.push({
                id: attrs.changeId,
                type: mark.type === insertionType ? 'insertion' : 'deletion',
                authorId: attrs.authorId || '',
                authorName: attrs.authorName || 'Unknown',
                authorColor: attrs.authorColor || '#3B82F6',
                timestamp: new Date(attrs.timestamp || Date.now()),
                from: pos,
                to: markEnd,
                content: doc.textBetween(pos, markEnd, ' '),
              });
            }
          }
        }
      });

      if (changes.length > 0) {
        const storage = (editor.storage as any).trackChanges;
        if (storage) storage.changes = changes;
        trackChanges.onChangesUpdate(changes);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [editor, content, trackChanges?.onChangesUpdate]);

  return editor;
}

// Export a method to programmatically insert an image
export function useEditorActions(editor: ReturnType<typeof useEditor>) {
  const insertImage = useCallback((url: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: 'image',
      attrs: { src: url },
    }).run();
  }, [editor]);

  return { insertImage };
}