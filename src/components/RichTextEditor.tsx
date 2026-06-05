import { useEditor, EditorContent, Editor, Extension } from '@tiptap/react';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Slice, Fragment } from '@tiptap/pm/model';
import { HeadingExitOnEnter } from '@/extensions/HeadingExitOnEnter';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { ResizableImage } from './ResizableImage';
import { ImageCropDialog } from './ImageCropDialog';
import { resolveStorageUrl } from '@/hooks/useStorageUrl';
import { createCitationTooltipPlugin, CitationMark, CitationNode } from './CitationMark';
import { BlockReordering } from '@/extensions/BlockReordering';
import { ParagraphSpacing } from '@/extensions/ParagraphSpacing';

import { InlineReferenceMark } from '@/extensions/InlineReferenceMark';
import { BlockDragHandle } from '@/extensions/BlockDragHandle';
import { TrackChanges, TrackChangesOptions } from '@/extensions/TrackChanges';
import { TableFormula } from '@/extensions/TableFormula';
import { WPReferenceMark } from '@/extensions/WPReferenceMark';
import { CaseReferenceMark } from '@/extensions/CaseReferenceMark';
import { ParticipantReferenceMark } from '@/extensions/ParticipantReferenceMark';
import { AcronymReference } from '@/extensions/AcronymReference';
import { FigureTableReferenceMark } from '@/extensions/FigureTableReferenceMark';
import { CaptionLabel } from '@/extensions/CaptionLabel';
import { HeadingNumberLabel } from '@/extensions/HeadingNumberLabel';
import { OrderedListStyled } from '@/extensions/OrderedListStyled';
import { renumberH3Headings } from '@/lib/renumberH3Headings';
import { updateCaptionForTableAtCursor } from '@/lib/renumberCaptionsInEditor';
import { sanitizeEditorHtml } from '@/lib/editorContentSanitizer';
import { OrderedListDropdown } from './OrderedListDropdown';
import { autoFitEditorTableAtPos } from '@/lib/editorTableAutoFit';
import { ParagraphSpacingPopover } from './ParagraphSpacingPopover';
import { FigureDimensionsPopover } from './FigureDimensionsPopover';
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
  Palette,
  Pipette,
  Ban,
  Check,
  ChevronDown,
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
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => {
            e.preventDefault();
            if (!disabled) onClick?.();
          }}
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

const PART_B_ALIGNMENT_EXEMPT_PARAGRAPH_CLASSES = new Set(['figure-caption', 'table-caption']);

const ParagraphClass = Extension.create({
  name: 'paragraphClass',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          class: {
            default: null,
            parseHTML: (element) => element.getAttribute('class') || null,
            renderHTML: (attributes) => attributes.class ? { class: attributes.class } : {},
          },
        },
      },
    ];
  },
});

/**
 * Strips text-align from pasted paragraphs so they adopt the default (justified).
 * Only used for transformPastedHTML — NOT for initial content load, so that
 * user-applied alignment survives save/reload round-trips.
 */
function normalizePartBPastedAlignment(html: string) {
  if (!html || typeof document === 'undefined') return html;
  html = sanitizeEditorHtml(html);

  // Strip mso-* properties from raw HTML
  html = html.replace(/mso-[^;:"']+:[^;:"']+;?/gi, '');

  const div = document.createElement('div');
  div.innerHTML = html;

  div.querySelectorAll('*').forEach((el) => {
    const h = el as HTMLElement;

    if (h.style) {
      h.style.fontSize = '';
      h.style.lineHeight = '';
      h.style.fontFamily = '';
      h.style.letterSpacing = '';
      h.style.wordSpacing = '';
      h.style.fontKerning = '';
      h.style.fontStretch = '';
      h.style.whiteSpace = '';
      h.style.textRendering = '';
      h.style.fontVariant = '';
      h.style.fontFeatureSettings = '';
      h.style.webkitTextStrokeWidth = '';
      h.style.margin = '';
      h.style.padding = '';
      h.style.width = '';
      h.style.border = '';
      h.style.borderTop = '';
      h.style.borderBottom = '';
      h.style.borderLeft = '';
      h.style.borderRight = '';
      h.style.borderColor = '';
      h.style.borderStyle = '';
      h.style.borderWidth = '';
      h.style.background = '';
      h.style.backgroundColor = '';
    }

    if (el.tagName === 'FONT') {
      const span = document.createElement('span');
      span.innerHTML = el.innerHTML;
      el.replaceWith(span);
    }
  });

  div.querySelectorAll('p').forEach((paragraph) => {
    const classNames = (paragraph.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    const isExempt = classNames.some((className) => PART_B_ALIGNMENT_EXEMPT_PARAGRAPH_CLASSES.has(className));
    const isInTable = Boolean(paragraph.closest('table'));

    if (isExempt || isInTable) return;

    const p = paragraph as HTMLParagraphElement;
    p.style.textAlign = '';
    p.removeAttribute('align');
  });

  return div.innerHTML;
}

/**
 * Strip textAlign attribute from pasted paragraph/heading nodes so they
 * inherit the destination's default alignment (e.g. justified body text,
 * centered captions). Cells inside tables and exempt caption classes keep
 * their alignment.
 */
function stripPastedAlignment(slice: Slice): Slice {
  const stripFragment = (fragment: Fragment, insideTable: boolean): Fragment => {
    const children: any[] = [];
    fragment.forEach((node) => {
      let nextNode = node;
      const isTable = node.type.name === 'table';
      const isParaOrHeading = node.type.name === 'paragraph' || node.type.name === 'heading';
      const className = (node.attrs as any)?.class as string | undefined;
      const isExempt = !!className && className
        .split(/\s+/)
        .some((c) => PART_B_ALIGNMENT_EXEMPT_PARAGRAPH_CLASSES.has(c));

      if (isParaOrHeading && !insideTable && !isExempt && (node.attrs as any)?.textAlign) {
        nextNode = node.type.create(
          { ...node.attrs, textAlign: null },
          node.content,
          node.marks,
        );
      }

      if (nextNode.content && nextNode.content.size > 0) {
        const newContent = stripFragment(nextNode.content, insideTable || isTable);
        nextNode = nextNode.copy(newContent);
      }
      children.push(nextNode);
    });
    return Fragment.fromArray(children);
  };

  return new Slice(stripFragment(slice.content, false), slice.openStart, slice.openEnd);
}

/**
 * Strips only font-size/lineHeight/fontFamily from loaded content but preserves text-align.
 */
function normalizePartBLoadedContent(html: string) {
  if (!html || typeof document === 'undefined') return html;
  html = sanitizeEditorHtml(html);

  // Strip mso-* properties from raw HTML before DOM parsing
  html = html.replace(/mso-[^;:"']+:[^;:"']+;?/gi, '');

  const div = document.createElement('div');
  div.innerHTML = html;

  div.querySelectorAll('sup').forEach((sup) => {
    const el = sup as HTMLElement;
    const dataCitation = el.getAttribute('data-citation');
    const text = (el.textContent || '').trim();
    const numericCitation =
      (dataCitation && /^\d+$/.test(dataCitation) && dataCitation) ||
      text.match(/^\[?\s*(\d+)\s*\]?$/)?.[1];

    if (numericCitation) {
      el.setAttribute('data-citation', numericCitation);
      el.removeAttribute('style');
      el.textContent = numericCitation;
    }
  });

  div.querySelectorAll('*').forEach((el) => {
    const h = el as HTMLElement;
    if (h.style) {
      h.style.fontSize = '';
      h.style.lineHeight = '';
      h.style.fontFamily = '';
      h.style.letterSpacing = '';
      h.style.wordSpacing = '';
      h.style.fontKerning = '';
      h.style.fontStretch = '';
      h.style.whiteSpace = '';
      h.style.textRendering = '';
      h.style.fontVariant = '';
      h.style.fontFeatureSettings = '';
      h.style.webkitTextStrokeWidth = '';
      h.style.border = '';
      h.style.borderTop = '';
      h.style.borderBottom = '';
      h.style.borderLeft = '';
      h.style.borderRight = '';
      h.style.borderColor = '';
      h.style.borderStyle = '';
      h.style.borderWidth = '';
      h.style.background = '';
      h.style.backgroundColor = '';
    }
    if (el.tagName === 'FONT') {
      const span = document.createElement('span');
      span.innerHTML = el.innerHTML;
      el.replaceWith(span);
    }
  });

  return div.innerHTML;
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

// ── Text Color Picker ───────────────────────────────────────────────────
const PRESET_COLORS = [
  '#000000', '#434343', '#666666', '#999999',
  '#DC2626', '#EA580C', '#D97706', '#65A30D',
  '#059669', '#0891B2', '#2563EB', '#7C3AED',
  '#DB2777', '#9333EA', '#4F46E5', '#0D9488',
];

function TextColorPicker({ editor }: { editor: Editor }) {
  const [customHex, setCustomHex] = useState('');
  const currentColor = editor.getAttributes('textStyle')?.color || '';

  const applyColor = useCallback((color: string) => {
    editor.chain().focus().setColor(color).run();
  }, [editor]);

  const removeColor = useCallback(() => {
    editor.chain().focus().unsetColor().run();
  }, [editor]);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 relative"
            >
              <Palette className="w-4 h-4" />
              {currentColor && (
                <span
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3.5 h-0.5 rounded-full"
                  style={{ backgroundColor: currentColor }}
                />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Text colour</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-52 p-3">
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Preset colours</div>
          <div className="grid grid-cols-8 gap-1">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                className={`w-5 h-5 rounded-sm border transition-transform hover:scale-125 cursor-pointer ${
                  currentColor === color ? 'ring-2 ring-primary ring-offset-1' : 'border-border'
                }`}
                style={{ backgroundColor: color }}
                onClick={() => applyColor(color)}
                title={color}
              />
            ))}
          </div>
          <Separator />
          <div className="flex items-center gap-2">
            <Pipette className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Input
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && /^#[0-9A-Fa-f]{6}$/.test(customHex)) {
                  applyColor(customHex);
                }
              }}
              placeholder="#000000"
              className="h-7 text-xs font-mono"
              maxLength={7}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => {
                if (/^#[0-9A-Fa-f]{6}$/.test(customHex)) {
                  applyColor(customHex);
                }
              }}
              title="Apply colour"
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs gap-1.5"
            onClick={removeColor}
          >
            <Ban className="w-3 h-3" />
            Remove colour
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
  hideTableInsert = false,
  tableOffset = 0,
  b31TableFocus,
  onB31AutoResize,
  crossRefDropdown,
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
  hideTableInsert?: boolean;
  tableOffset?: number;
   /** Which B3.1 React table is focused (e.g. 'b31-wp-list', 'b31-deliverables', ...). Null when none. */
   b31TableFocus?: string | null;
   onB31AutoResize?: () => void;
  crossRefDropdown?: React.ReactNode;
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
        editor.commands.updateAttributes('image', { width: numValue, height: newHeight, widthPercent: 0 });
      } else {
        editor.commands.updateAttributes('image', { width: numValue, widthPercent: 0 });
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
        editor.commands.updateAttributes('image', { width: newWidth, height: numValue, widthPercent: 0 });
      } else {
        editor.commands.updateAttributes('image', { height: numValue, widthPercent: 0 });
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
      editor.commands.updateAttributes('image', { widthPercent: 0 });
    }
  }, [editor, widthMode, imageWidthPercent]);

  const handleCropClick = useCallback(async () => {
    if (selectedImageAttrs?.src) {
      const resolved = await resolveStorageUrl(selectedImageAttrs.src);
      setCropImageSrc(resolved || selectedImageAttrs.src);
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

    const insertFrom = editor.state.selection.from;

    // Get the table label (without B prefix)
    const sectionNum = getSectionNumberWithoutPrefix(sectionNumber || '1.1');
    const tableLetter = getNextTableLetter();
    const tableLabel = `Table ${sectionNum}.${tableLetter}`;

    const inserted = editor.chain()
      .focus()
      .insertContent({
        type: 'paragraph',
        attrs: { class: 'table-caption', textAlign: 'left' },
        content: [
          {
            type: 'text',
            marks: [{ type: 'italic' }, { type: 'bold' }],
            text: `${tableLabel}. `,
          },
          {
            type: 'text',
            marks: [{ type: 'italic' }],
            text: ' ',
          },
        ],
      })
      .insertTable({ rows, cols, withHeaderRow: true })
      .run();

    if (inserted) {
      const searchFrom = Math.max(0, insertFrom - 1);
      let captionPos: number | null = null;
      let captionNodeSize = 0;

      editor.state.doc.descendants((node, pos) => {
        if (
          pos >= searchFrom &&
          node.type.name === 'paragraph' &&
          typeof node.attrs?.class === 'string' &&
          node.attrs.class.split(/\s+/).includes('table-caption') &&
          node.textContent.startsWith(`${tableLabel}.`)
        ) {
          captionPos = pos;
          captionNodeSize = node.nodeSize;
          return false;
        }

        return true;
      });

      if (captionPos !== null) {
        const cursorPos = captionPos + captionNodeSize - 1;
        const italicMark = editor.state.schema.marks.italic?.create();
        const tr = editor.state.tr
          .setSelection(TextSelection.create(editor.state.doc, cursorPos))
          .setMeta('addToHistory', false);

        if (italicMark) {
          tr.setStoredMarks([italicMark]);
        }

        editor.view.dispatch(tr);
        editor.view.focus();
      }
    }

    setTablePopoverOpen(false);
  }, [editor, sectionNumber, getNextTableLetter, getSectionNumberWithoutPrefix]);

  if (!editor) {
    return null;
  }

  const isInTable = editor.isActive('table');
  const isB31TableActive = Boolean(b31TableFocus);
  const showTableOptions = isInTable || isB31TableActive;
  const isAlignDisabled = editor.isActive('heading') || isInTable;

  return (
    <div className="editor-toolbar border-b border-border bg-card px-2 py-1">
      <div className="flex items-center gap-0">
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

        {/* Subheading dropdown */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={editor.isActive('heading', { level: 3 }) || (editor.isActive('bold') && editor.isActive('underline')) ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                >
                  <span className="font-black underline">Subheading</span>
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Insert subheading
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onClick={() => {
              const chain = editor.chain().focus();
              if (editor.isActive('heading', { level: 1 })) chain.toggleHeading({ level: 1 });
              else if (editor.isActive('heading', { level: 2 })) chain.toggleHeading({ level: 2 });
              else if (editor.isActive('heading', { level: 3 })) chain.toggleHeading({ level: 3 });
              if (editor.isActive('bold')) chain.toggleBold();
              if (editor.isActive('underline')) chain.toggleUnderline();
              chain.run();
            }}>
              <span className="text-sm">Body</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              const cleanNum = sectionNumber ? sectionNumber.replace(/^[A-Za-z]+/, '') : '1.1';
              // Use a temporary placeholder number; renumber will fix it
              const placeholder = `${cleanNum}.0. `;
              editor.chain().focus().toggleHeading({ level: 3 }).run();
              if (editor.isActive('heading', { level: 3 })) {
                const $from = editor.state.selection.$from;
                const startOfNode = $from.start();
                const currentText = $from.parent.textContent;
                // Only add prefix if there isn't already a numbered prefix
                const hasPrefix = /^\d+\.\d+\.\d+\.\s/.test(currentText);
                if (!hasPrefix) {
                  editor.chain().focus().insertContentAt(startOfNode, placeholder).run();
                }
                // Renumber all H3s by position
                renumberH3Headings(editor, cleanNum);
              }
            }}>
              <span className="text-sm font-semibold underline">{sectionNumber ? `${sectionNumber.replace(/^[A-Za-z]+/, '')}.1.` : '1.1.1.'} Numbered subheading</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              // Unnumbered subheading (bold + underline inline style)
              editor.chain().focus().toggleBold().run();
              editor.chain().focus().toggleUnderline().run();
            }}>
              <span className="text-sm font-bold underline">Unnumbered subheading</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          icon={<Italic className="w-3.5 h-3.5" />} 
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

        {/* Text colour */}
        <TextColorPicker editor={editor} />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Bullet Numbered */}
        <ToolbarButton 
          icon={<List className="w-4 h-4" />} 
          tooltip="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
        />
        <OrderedListDropdown
          editor={editor}
          active={editor.isActive('orderedList')}
        />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Left Centre Right Justify */}
        <ToolbarButton 
          icon={<AlignLeft className="w-4 h-4" />} 
          tooltip="Align left"
          onClick={() => {
            const s = (editor.storage as any).trackChanges;
            const was = s?.enabled;
            if (s) s.enabled = false;
            editor.chain().focus().setTextAlign('left').run();
            if (s) s.enabled = was;
          }}
          active={!isAlignDisabled && editor.isActive({ textAlign: 'left' })}
          disabled={isAlignDisabled}
        />
        <ToolbarButton 
          icon={<AlignCenter className="w-4 h-4" />} 
          tooltip="Align center"
          onClick={() => {
            const s = (editor.storage as any).trackChanges;
            const was = s?.enabled;
            if (s) s.enabled = false;
            editor.chain().focus().setTextAlign('center').run();
            if (s) s.enabled = was;
          }}
          active={!isAlignDisabled && editor.isActive({ textAlign: 'center' })}
          disabled={isAlignDisabled}
        />
        <ToolbarButton 
          icon={<AlignRight className="w-4 h-4" />} 
          tooltip="Align right"
          onClick={() => {
            const s = (editor.storage as any).trackChanges;
            const was = s?.enabled;
            if (s) s.enabled = false;
            editor.chain().focus().setTextAlign('right').run();
            if (s) s.enabled = was;
          }}
          active={!isAlignDisabled && editor.isActive({ textAlign: 'right' })}
          disabled={isAlignDisabled}
        />
        <ToolbarButton 
          icon={<AlignJustify className="w-4 h-4" />} 
          tooltip="Justify"
          onClick={() => {
            const s = (editor.storage as any).trackChanges;
            const was = s?.enabled;
            if (s) s.enabled = false;
            editor.chain().focus().setTextAlign('justify').run();
            if (s) s.enabled = was;
          }}
          active={!isAlignDisabled && editor.isActive({ textAlign: 'justify' })}
          disabled={isAlignDisabled}
        />

        <ParagraphSpacingPopover editor={editor} disabled={isAlignDisabled} />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Table */}
        {!showTableOptions && !hideTableInsert && (
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
                Insert table
              </TooltipContent>
            </Tooltip>
            <PopoverContent align="start" className="w-auto p-0">
              <TableSizeSelector onSelect={insertTable} />
            </PopoverContent>
          </Popover>
        )}
        {showTableOptions && (
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
              {isB31TableActive ? (
                <>
                  {onB31AutoResize && (
                    <DropdownMenuItem onClick={onB31AutoResize}>
                      <Columns className="w-4 h-4 mr-2" />
                      Auto-resize columns
                    </DropdownMenuItem>
                  )}
                </>
              ) : (
                <>
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
                    const { $from } = editor.state.selection;
                    let depth = $from.depth;
                    while (depth > 0) {
                      const node = $from.node(depth);
                      if (node.type.name === 'table') {
                        autoFitEditorTableAtPos(editor.view, $from.before(depth));
                        break;
                      }
                      depth--;
                    }
                  }}>
                    <Columns className="w-4 h-4 mr-2" />
                    Auto-resize columns
                  </DropdownMenuItem>
                  {sectionNumber && (
                    <DropdownMenuItem onClick={() => {
                      if (sectionNumber) {
                        updateCaptionForTableAtCursor(editor, sectionNumber, tableOffset);
                      }
                    }}>
                      <FileText className="w-4 h-4 mr-2" />
                      Update caption
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => editor.chain().focus().deleteTable().run()}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete table
                  </DropdownMenuItem>
                </>
              )}
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
              Insert figure
            </TooltipContent>
          </Tooltip>
        )}

        {/* Citations */}
        {onOpenCitationDialog && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1"
                onClick={onOpenCitationDialog}
                disabled={isReadOnly}
              >
                <FileText className="w-4 h-4" />
                <span className="text-xs">Citations</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Manage Citations
            </TooltipContent>
          </Tooltip>
        )}

        {/* Cross-ref dropdown */}
        {crossRefDropdown}

        {/* Image controls - show when image is selected */}
        {isImageSelected && (
          <>
            <Separator orientation="vertical" className="h-5 mx-1.5" />
            <div className="flex items-center gap-1">
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
              
              {/* Inline figure dimensions panel */}
              <FigureDimensionsPopover
                width={imageWidth}
                height={imageHeight}
                widthPercent={Number(imageWidthPercent) || 0}
                aspectRatioLocked={aspectRatioLocked}
                onWidthChange={handleWidthChange}
                onHeightChange={handleHeightChange}
                onWidthPercentChange={handleWidthPercentChange}
                onAspectRatioToggle={() => setAspectRatioLocked(!aspectRatioLocked)}
              />

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
            <AlertDialogTitle>Delete figure</AlertDialogTitle>
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
  const initialEditorContentRef = useRef<string | null>(null);
  if (initialEditorContentRef.current === null) {
    initialEditorContentRef.current = normalizePartBLoadedContent(content);
  }

  const editor = useEditor({
    extensions: [
StarterKit.configure({
  heading: {
    levels: [1, 2, 3],
  },
  orderedList: false,
  link: false,
  underline: false,
  undoRedo: {
    depth: 100,
    newGroupDelay: 1200,
  },
}),
      OrderedListStyled,
      Typography,
      Underline,
      CitationNode,
      CitationMark,
      Superscript,
      TextStyle,
      Color,
      ParagraphClass,
      ParagraphSpacing,
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
      HeadingExitOnEnter,
      BlockReordering,
      InlineReferenceMark,
      WPReferenceMark,
      CaseReferenceMark,
      AcronymReference,
      FigureTableReferenceMark,
      CaptionLabel,
      HeadingNumberLabel,
      // Suppress heading input rules inside table cells: revert heading nodes back to paragraphs
      Extension.create({
        name: 'preventHeadingInTable',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey('preventHeadingInTable'),
              appendTransaction(_transactions, oldState, newState) {
                const { doc, schema } = newState;
                const headingType = schema.nodes.heading;
                const paragraphType = schema.nodes.paragraph;
                if (!headingType || !paragraphType) return null;

                let tr: any = null;
                doc.descendants((node, pos) => {
                  if (node.type !== headingType) return;
                  // Check if this heading is inside a table cell
                  const $pos = doc.resolve(pos);
                  for (let d = $pos.depth; d > 0; d--) {
                    const parentName = $pos.node(d).type.name;
                    if (parentName === 'tableCell' || parentName === 'tableHeader') {
                      // Convert heading back to paragraph, preserving content
                      if (!tr) tr = newState.tr;
                      tr.setNodeMarkup(pos, paragraphType, null, node.marks);
                      return false; // Don't descend
                    }
                  }
                });
                if (tr) console.log('[DIAG-APPEND]', 'pluginName:', 'preventHeadingInTable', 'changes:', tr.steps.length);
                return tr;
              },
            }),
          ];
        },
      }),
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
                if (tr) console.log('[DIAG-APPEND]', 'pluginName:', 'preventTableAtStart', 'changes:', tr.steps.length);
                return tr;
              },
            }),
          ];
        },
      }),
    ],
    content: initialEditorContentRef.current,
    enableExtensionDispatchTransaction: true,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'document-content min-h-[400px] outline-none prose prose-sm max-w-none',
        style: 'font-family: "Times New Roman", Times, serif',
      },
      transformPastedHTML(html) {
        return normalizePartBPastedAlignment(html);
      },
      transformPasted(slice) {
        return stripPastedAlignment(slice);
      },
    },
  }, []);

  if (!editor) {
    return null;
  }

  return (
    <div className={className}>
      {/* External toolbar rendering only; default fallback removed (no caller used it). */}
      {renderToolbar?.(editor)}


      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}

// Hook to get editor instance for external toolbar control
export function useRichTextEditor({ 
  content, 
  onChange,
  isReady = true,
  instanceKey,
  getReference,
  trackChanges,
  blockLocking,
  onBlockDeleteRequest,
}: { 
  content: string; 
  onChange: (content: string) => void;
  isReady?: boolean;
  instanceKey?: string;
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
  const initialContentRef = useRef<string>(normalizePartBLoadedContent(content));

  // Track the last content we set to the editor to avoid infinite loops
  const lastSetContentRef = useRef<string>(initialContentRef.current);
  const readyRef = useRef(isReady);
  readyRef.current = isReady;
  
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
  if (!isReady) {
    initialContentRef.current = normalizePartBLoadedContent(content);
    lastSetContentRef.current = initialContentRef.current;
  }
  
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
  orderedList: false,
  link: false,
  underline: false,
  undoRedo: {
    depth: 100,
    newGroupDelay: 1200,
  },
}),
      OrderedListStyled,
      Typography,
      Underline,
      CitationNode,
      CitationMark,
      Superscript,
      TextStyle,
      Color,
      ParagraphClass,
      ParagraphSpacing,
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
      HeadingExitOnEnter,
      BlockReordering,
      
      InlineReferenceMark,
      // WP reference marks for inline WP badges
      WPReferenceMark,
      // Case reference marks for inline case badges
      CaseReferenceMark,
      // Participant reference marks for inline partner badges
      ParticipantReferenceMark,
      // Acronym reference for colored acronym insertion
      AcronymReference,
      CaptionLabel,
      HeadingNumberLabel,
      // Figure/table reference marks for atomic deletion
      FigureTableReferenceMark,
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
      // Click-to-select reference marks for easy deletion
      Extension.create({
        name: 'referenceClickSelect',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey('referenceClickSelect'),
              props: {
                handleClick(view, pos, event) {
                  const target = event.target as HTMLElement;
                  const refEl = target.closest('[data-inline-reference], [data-wp-reference], [data-case-reference], [data-participant-reference], [data-acronym-reference], [data-fig-table-ref]');
                  if (!refEl) return false;
                  
                  // Find the mark range at this position
                  const { doc } = view.state;
                  const $pos = doc.resolve(pos);
                  const markTypes = ['inlineReference', 'wpReference', 'caseReference', 'participantReference', 'acronymReference', 'figureTableReference'];
                  
                  for (const markName of markTypes) {
                    const markType = view.state.schema.marks[markName];
                    if (!markType) continue;
                    
                    const mark = markType.isInSet($pos.marks());
                    if (!mark) continue;
                    
                    // Find the extent of this mark
                    let from = pos;
                    let to = pos;
                    
                    // Scan backwards
                    while (from > 0) {
                      const $before = doc.resolve(from - 1);
                      if (!markType.isInSet($before.marks())) break;
                      from--;
                    }
                    
                    // Scan forwards
                    while (to < doc.content.size) {
                      const $after = doc.resolve(to + 1);
                      if (!markType.isInSet($after.marks())) break;
                      to++;
                    }
                    
                    // Select the entire mark range
                    const tr = view.state.tr.setSelection(TextSelection.create(doc, from, to));
                    view.dispatch(tr);
                    return true;
                  }
                  
                  return false;
                },
              },
            }),
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
      // Suppress heading input rules inside table cells
      Extension.create({
        name: 'preventHeadingInTable',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey('preventHeadingInTableMain'),
              appendTransaction(_transactions, oldState, newState) {
                const { doc, schema } = newState;
                const headingType = schema.nodes.heading;
                const paragraphType = schema.nodes.paragraph;
                if (!headingType || !paragraphType) return null;

                let tr: any = null;
                doc.descendants((node, pos) => {
                  if (node.type !== headingType) return;
                  const $pos = doc.resolve(pos);
                  for (let d = $pos.depth; d > 0; d--) {
                    const parentName = $pos.node(d).type.name;
                    if (parentName === 'tableCell' || parentName === 'tableHeader') {
                      if (!tr) tr = newState.tr;
                      tr.setNodeMarkup(pos, paragraphType, null, node.marks);
                      return false;
                    }
                  }
                });
                if (tr) console.log('[DIAG-APPEND]', 'pluginName:', 'preventHeadingInTableMain', 'changes:', tr.steps.length);
                return tr;
              },
            }),
          ];
        },
      }),
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
                if (tr) console.log('[DIAG-APPEND]', 'pluginName:', 'preventTableAtStartMain', 'changes:', tr.steps.length);
                return tr;
              },
            }),
          ];
        },
      }),
    ],
    content: isReady ? normalizePartBLoadedContent(content) : '<p></p>',
    enableExtensionDispatchTransaction: true,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    
    onUpdate: ({ editor }) => {
      if (!readyRef.current) return;
      const html = editor.getHTML();
      lastSetContentRef.current = normalizePartBLoadedContent(html);
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'document-content min-h-[400px] outline-none prose prose-sm max-w-none',
        style: 'font-family: "Times New Roman", Times, serif',
      },
      transformPastedHTML(html) {
        return normalizePartBPastedAlignment(html);
      },
      transformPasted(slice) {
        return stripPastedAlignment(slice);
      },
    },
  }, [instanceKey, isReady]);

  // Sync editor content when content prop changes externally (e.g., from DB load
  // or version restore). Skip when:
  //  - the new content matches what we last set/emitted (avoids reload loops)
  //  - the new content is empty but the editor already has content (avoids
  //    transient parent re-renders wiping the document during section switch)
  // Normalisation only runs when we actually replace content.
  useEffect(() => {
    if (!editor || !isReady) return;
    if (!content && editor.state.doc.content.size > 2) return;
    const nextContent = normalizePartBLoadedContent(content);
    if (nextContent === lastSetContentRef.current) return;
    const currentEditorNormalized = normalizePartBLoadedContent(editor.getHTML());
    if (nextContent === currentEditorNormalized) {
      lastSetContentRef.current = nextContent;
      return;
    }
    lastSetContentRef.current = nextContent;
    // Temporarily disable track changes during setContent to prevent
    // the entire document being marked as insertions
    const storage = (editor.storage as any)?.trackChanges;
    const wasEnabled = storage?.enabled;
    if (storage) storage.enabled = false;
    editor.commands.setContent(nextContent, { emitUpdate: false });
    if (storage) storage.enabled = wasEnabled;
  }, [editor, content, isReady]);

  // Sync track changes enabled state — use direct storage assignment to avoid
  // toggle race conditions and double-toggles
  useEffect(() => {
    if (!editor) return;
    trackChangesRef.current = trackChanges;
    const storage = (editor.storage as any).trackChanges;
    if (storage) {
      const targetEnabled = trackChanges?.enabled || false;
      if (storage.enabled !== targetEnabled) {
        storage.enabled = targetEnabled;
        
        // Reset merge windows when toggling
        storage.lastInsertionId = null;
        storage.lastInsertionTime = 0;
        storage.lastDeletionId = null;
        storage.lastDeletionTime = 0;

        // When turning off, clear stored marks to prevent strikethrough persistence
        if (!targetEnabled) {
          const { state } = editor;
          const iType = state.schema.marks.trackInsertion;
          const dType = state.schema.marks.trackDeletion;
          const marks = state.storedMarks || state.selection.$from.marks();
          if (marks && (iType || dType)) {
            const cleaned = marks.filter(
              (m) => m.type !== iType && m.type !== dType
            );
            if (cleaned.length !== marks.length) {
              const tr = state.tr.setStoredMarks(cleaned);
              tr.setMeta('trackChangesInternal', true);
              tr.setMeta('addToHistory', false);
              editor.view.dispatch(tr);
            }
          }
        }
      }
      storage.authorId = trackChanges?.authorId || '';
      storage.authorName = trackChanges?.authorName || 'Anonymous';
      storage.authorColor = trackChanges?.authorColor || '#3B82F6';
      storage.onChangesUpdate = trackChanges?.onChangesUpdate;
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
  // Also triggers a one-time re-save if marks had missing attributes (to flush corrected HTML to DB)
  const hasReserializedRef = useRef(false);
  useEffect(() => {
    if (!editor || !isReady || !trackChanges?.onChangesUpdate) return;
    // Wait a tick for content to be fully set
    const timer = setTimeout(() => {
      const doc = editor.state.doc;
      const schema = editor.state.schema;
      const insertionType = schema.marks.trackInsertion;
      const deletionType = schema.marks.trackDeletion;
      if (!insertionType && !deletionType) return;

      const changes: any[] = [];
      let hasDeficientMarks = false;

      doc.descendants((node: any, pos: number) => {
        if (!node.isText) return;
        for (const mark of node.marks) {
          if (mark.type === insertionType || mark.type === deletionType) {
            const attrs = mark.attrs;
            const markEnd = pos + node.nodeSize;

            // Detect marks that are missing critical attributes (saved before the fix)
            if (!attrs.changeId || !attrs.timestamp || !attrs.authorId) {
              hasDeficientMarks = true;
            }

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

      // One-time re-serialization: if the loaded HTML had marks with missing data-* attrs,
      // the backfill in DocumentEditor will fix the in-memory marks. After that runs,
      // we force a re-save so the corrected HTML (with all data-* attributes) is persisted.
      if (hasDeficientMarks && !hasReserializedRef.current) {
        hasReserializedRef.current = true;
        // Delay to allow DocumentEditor's backfill effect to run first (it runs at 1000ms)
        setTimeout(() => {
          if (editor && !editor.isDestroyed) {
            onChange(editor.getHTML());
          }
        }, 1500);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [editor, content, isReady, trackChanges?.onChangesUpdate]);

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
