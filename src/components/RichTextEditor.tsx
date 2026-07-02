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

import { InlineReferenceNode } from '@/extensions/InlineReferenceNode';
import { BlockDragHandle } from '@/extensions/BlockDragHandle';
import { TrackChanges } from '@/extensions/TrackChanges';
import { TableFormula } from '@/extensions/TableFormula';
import { WPReferenceNode } from '@/extensions/WPReferenceNode';
import { CaseReferenceNode } from '@/extensions/CaseReferenceNode';
import { CasesTableNode } from '@/extensions/CasesTableNode';
import { B32MirrorSlotNode } from '@/extensions/B32MirrorSlotNode';
import { ParticipantReferenceNode } from '@/extensions/ParticipantReferenceNode';
import { AcronymReference } from '@/extensions/AcronymReference';
import { FigureTableReferenceMark } from '@/extensions/FigureTableReferenceMark';
import { ParenBadgeGlue } from '@/extensions/ParenBadgeGlue';
import { BadgeTrailingCaret } from '@/extensions/BadgeTrailingCaret';
import { BadgeCaretHost } from '@/extensions/BadgeCaretHost';

import { CaptionLabel } from '@/extensions/CaptionLabel';
import { HeadingNumberLabel } from '@/extensions/HeadingNumberLabel';
import { OrderedListStyled } from '@/extensions/OrderedListStyled';
import { renumberH3Headings } from '@/lib/renumberH3Headings';
import { updateCaptionForTableAtCursor } from '@/lib/renumberCaptionsInEditor';
import { sanitizeEditorHtml } from '@/lib/editorContentSanitizer';
import { stripWordHtml } from '@/lib/stripWordHtml';
import { OrderedListDropdown } from './OrderedListDropdown';
import { autoFitEditorTableAtPos } from '@/lib/editorTableAutoFit';
import { ParagraphSpacingPopover } from './ParagraphSpacingPopover';
import { FigureDimensionsPopover } from './FigureDimensionsPopover';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { List, Link as LinkIcon, Undo, Redo, Table as TableIcon, Plus, Minus, Trash2, Crop, ImageIcon, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, RefreshCw, Combine, SplitSquareHorizontal, Calculator, FileText, Columns, Palette, Pipette, Ban, Check } from "lucide-react";
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
import {
  ToolbarButton,
  TextFormattingGroup,
  AlignmentGroup,
  TableGridPicker,
  SubheadingDropdown,
  type Alignment,
} from './toolbar';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onInsertImage?: () => void;
  onInsertFootnote?: () => void;
  className?: string;
  renderToolbar?: (editor: Editor) => React.ReactNode;
  sectionNumber?: string; // Section number for caption numbering (e.g., "1.1")
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

const HeadingDataAttributes = Extension.create({
  name: 'headingDataAttributes',
  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          'data-default-subheading': {
            default: null,
            parseHTML: (element) => element.getAttribute('data-default-subheading'),
            renderHTML: (attributes) =>
              attributes['data-default-subheading']
                ? { 'data-default-subheading': attributes['data-default-subheading'] }
                : {},
          },
          'data-case-type-heading-id': {
            default: null,
            parseHTML: (element) => element.getAttribute('data-case-type-heading-id'),
            renderHTML: (attributes) =>
              attributes['data-case-type-heading-id']
                ? { 'data-case-type-heading-id': attributes['data-case-type-heading-id'] }
                : {},
          },
          'data-b32-slot-key': {
            default: null,
            parseHTML: (element) => element.getAttribute('data-b32-slot-key'),
            renderHTML: (attributes) =>
              attributes['data-b32-slot-key']
                ? { 'data-b32-slot-key': attributes['data-b32-slot-key'] }
                : {},
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
  // NOTE: callers run stripWordHtml() as a pre-pass (which already invokes
  // sanitizeEditorHtml internally), so we skip the redundant sanitize here.

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

  // Migrate legacy milestone refs: <strong>MS</strong><span data-inline-reference data-ref-type="milestone">1</span>
  // → <span data-inline-reference data-ref-type="milestone">MS1</span>
  div.querySelectorAll('span[data-inline-reference][data-ref-type="milestone"]').forEach((span) => {
    const el = span as HTMLElement;
    const text = (el.textContent || '').trim();
    if (/^MS/i.test(text)) return; // already migrated
    // Look at previous sibling (skip empty text nodes)
    let prev: Node | null = el.previousSibling;
    while (prev && prev.nodeType === Node.TEXT_NODE && !((prev as Text).data || '').trim()) {
      prev = prev.previousSibling;
    }
    if (prev && prev.nodeType === Node.ELEMENT_NODE) {
      const prevEl = prev as HTMLElement;
      const tag = prevEl.tagName.toLowerCase();
      if ((tag === 'strong' || tag === 'b') && (prevEl.textContent || '').trim() === 'MS') {
        prevEl.remove();
        el.textContent = `MS${text}`;
      }
    }
  });

  return div.innerHTML;
}


// ── Text Color Picker (shared per-proposal colour library) ──────────────
import { WPColorPicker } from './WPColorPicker';

function TextColorPicker({
  editor,
  proposalId,
  canManageCustom,
}: {
  editor: Editor;
  proposalId?: string | null;
  canManageCustom?: boolean;
}) {
  const currentColor = (editor.getAttributes('textStyle')?.color as string) || '';

  const applyColor = useCallback((color: string) => {
    editor.chain().focus().setColor(color).run();
  }, [editor]);

  const removeColor = useCallback(() => {
    editor.chain().focus().unsetColor().run();
  }, [editor]);

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 relative"
      aria-label="Colour"
      title="Colour"
    >
      <Palette className="w-4 h-4" />
      {currentColor && (
        <span
          className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3.5 h-0.5 rounded-full"
          style={{ backgroundColor: currentColor }}
        />
      )}
    </Button>
  );

  return (
    <WPColorPicker
      color={currentColor || '#000000'}
      onChange={applyColor}
      onRemove={currentColor ? removeColor : undefined}
      removeLabel="Remove colour"
      proposalId={proposalId ?? null}
      canManageCustom={canManageCustom}
      trigger={trigger}
      label="Text colour"
    />
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
  showLinkButton = false,
  showColor = true,
  showParagraphSpacing = true,
  showImageControls = true,
  showTableEditing = true,
  tableInsertMode = 'popover',
  figureInsertMode = 'dialog',
  subheadingPrefix,
  showSubheadingBodyItem = true,
  proposalId,
  canManageCustomColors,
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
  showLinkButton?: boolean;
  showColor?: boolean;
  showParagraphSpacing?: boolean;
  showImageControls?: boolean;
  showTableEditing?: boolean;
  tableInsertMode?: 'popover' | 'fixed3x3';
  figureInsertMode?: 'dialog' | 'urlPrompt' | 'none';
  subheadingPrefix?: string;
  showSubheadingBodyItem?: boolean;
  proposalId?: string | null;
  canManageCustomColors?: boolean;
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
          label="Undo (Ctrl+Z)"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        />
        <ToolbarButton 
          icon={<Redo className="w-4 h-4" />} 
          label="Redo (Ctrl+Y)"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Subheading dropdown */}
        {(() => {
          const cleanNum = subheadingPrefix ?? (sectionNumber ? sectionNumber.replace(/^[A-Za-z]+/, '') : '1.1');
          return (
            <SubheadingDropdown
              isActive={editor.isActive('heading', { level: 3 }) || (editor.isActive('bold') && editor.isActive('underline'))}
              numberedLabel={`${cleanNum}.1. Numbered subheading`}
              onBody={showSubheadingBodyItem ? () => {
                const chain = editor.chain().focus();
                if (editor.isActive('heading', { level: 1 })) chain.toggleHeading({ level: 1 });
                else if (editor.isActive('heading', { level: 2 })) chain.toggleHeading({ level: 2 });
                else if (editor.isActive('heading', { level: 3 })) chain.toggleHeading({ level: 3 });
                if (editor.isActive('bold')) chain.toggleBold();
                if (editor.isActive('underline')) chain.toggleUnderline();
                chain.run();
              } : undefined}
              onNumbered={() => {
                const placeholder = `${cleanNum}.0. `;
                editor.chain().focus().toggleHeading({ level: 3 }).run();
                if (editor.isActive('heading', { level: 3 })) {
                  const $from = editor.state.selection.$from;
                  const startOfNode = $from.start();
                  const currentText = $from.parent.textContent;
                  const hasPrefix = /^\d+\.\d+\.\d+\.\s/.test(currentText);
                  if (!hasPrefix) {
                    const tr = editor.state.tr.insertText(placeholder, startOfNode);
                    editor.view.dispatch(tr);
                  }
                  renumberH3Headings(editor, cleanNum);
                }
                // After all mutations settle AND the Radix dropdown finishes
                // closing + restoring focus to its trigger, restore focus into
                // the editor and place caret at the end of the current heading
                // using FRESH editor state. A small setTimeout outlasts the
                // dropdown's onCloseAutoFocus, which fires after rAF.
                setTimeout(() => {
                  const sel = editor.state.selection;
                  const endOfHeading = sel.$from.end();
                  editor.chain().focus().setTextSelection(endOfHeading).run();
                }, 60);

              }}
              onUnnumbered={() => {
                // Block H3 on its own line (bold+underline come from .prose h3 styling).
                editor.chain().focus().setNode('heading', { level: 3 }).run();
                // Outlast Radix dropdown's onCloseAutoFocus (which restores
                // focus to the trigger after rAF). setTimeout ensures our
                // editor focus + caret placement wins.
                setTimeout(() => {
                  const sel = editor.state.selection;
                  const endOfHeading = sel.$from.end();
                  editor.chain().focus().setTextSelection(endOfHeading).run();
                }, 60);

              }}
            />
          );
        })()}

        {/* Bold / Italic / Underline */}
        <TextFormattingGroup
          onBold={() => editor.chain().focus().toggleBold().run()}
          onItalic={() => editor.chain().focus().toggleItalic().run()}
          onUnderline={() => editor.chain().focus().toggleUnderline().run()}
          isBoldActive={editor.isActive('bold')}
          isItalicActive={editor.isActive('italic')}
          isUnderlineActive={editor.isActive('underline')}
        />

        {/* Link (standalone) */}
        {showLinkButton && (
          <ToolbarButton
            icon={<LinkIcon className="w-4 h-4" />}
            label="Insert link"
            onClick={setLink}
            isActive={editor.isActive('link')}
          />
        )}

        {/* Text colour */}
        {showColor && <TextColorPicker editor={editor} />}

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Bullet Numbered */}
        <ToolbarButton 
          icon={<List className="w-4 h-4" />} 
          label="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
        />
        <OrderedListDropdown
          editor={editor}
          active={editor.isActive('orderedList')}
        />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Left Centre Right Justify */}
        <AlignmentGroup
          disabled={isAlignDisabled}
          activeAlignment={
            editor.isActive({ textAlign: 'left' }) ? 'left'
              : editor.isActive({ textAlign: 'center' }) ? 'center'
              : editor.isActive({ textAlign: 'right' }) ? 'right'
              : editor.isActive({ textAlign: 'justify' }) ? 'justify'
              : undefined
          }
          onAlign={(a: Alignment) => {
            const s = (editor.storage as any).trackChanges;
            const was = s?.enabled;
            if (s) s.enabled = false;
            editor.chain().focus().setTextAlign(a).run();
            if (s) s.enabled = was;
          }}
        />


        {showParagraphSpacing && <ParagraphSpacingPopover editor={editor} disabled={isAlignDisabled} />}

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Table */}
        {!showTableOptions && !hideTableInsert && tableInsertMode === 'fixed3x3' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1"
                onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              >
                <TableIcon className="w-4 h-4" />
                <span className="text-xs">Table</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Insert table</TooltipContent>
          </Tooltip>
        )}
        {!showTableOptions && !hideTableInsert && tableInsertMode === 'popover' && (
          <TableGridPicker
            open={tablePopoverOpen}
            onOpenChange={setTablePopoverOpen}
            onInsert={insertTable}
          />
        )}
        {showTableOptions && showTableEditing && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                   aria-label="Table options" title="Table options">
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
        {figureInsertMode === 'dialog' && isPartB && onOpenFigureDialog && (
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
        {figureInsertMode === 'urlPrompt' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1"
                onClick={() => {
                  const url = window.prompt('Enter image URL:');
                  if (url) editor.chain().focus().setImage({ src: url }).run();
                }}
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
        {showImageControls && isImageSelected && (
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
                label="Crop image"
                onClick={handleCropClick}
              />
              
              <Separator orientation="vertical" className="h-5 mx-1" />
              
              {/* Image alignment controls */}
              <ToolbarButton
                icon={<AlignHorizontalJustifyStart className="w-4 h-4" />}
                label="Align left"
                onClick={() => setImageAlignment('left')}
                isActive={currentImageAlignment === 'left'}
              />
              <ToolbarButton
                icon={<AlignHorizontalJustifyCenter className="w-4 h-4" />}
                label="Align center"
                onClick={() => setImageAlignment('center')}
                isActive={currentImageAlignment === 'center'}
              />
              <ToolbarButton
                icon={<AlignHorizontalJustifyEnd className="w-4 h-4" />}
                label="Align right"
                onClick={() => setImageAlignment('right')}
                isActive={currentImageAlignment === 'right'}
              />
              
              <Separator orientation="vertical" className="h-5 mx-1" />
              
              {/* Replace and Delete figure */}
              {onOpenFigureDialog && (
                <ToolbarButton
                  icon={<RefreshCw className="w-4 h-4" />}
                  label="Replace figure"
                  onClick={replaceFigure}
                />
              )}
              <ToolbarButton
                icon={<Trash2 className="w-4 h-4 text-destructive" />}
                label="Delete figure with caption"
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
      HeadingDataAttributes,
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
      InlineReferenceNode,
      WPReferenceNode,
      CaseReferenceNode,
      ParticipantReferenceNode,
      CasesTableNode,
      B32MirrorSlotNode,
      AcronymReference,
      FigureTableReferenceMark,
      ParenBadgeGlue,
      BadgeTrailingCaret,
      BadgeCaretHost,
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
      if (editor.isDestroyed || !editor.schema) return;
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'document-content min-h-[400px] outline-none prose prose-sm max-w-none',
        style: 'font-family: "Times New Roman", Times, serif',
      },
      transformPastedHTML(html) {
        return normalizePartBPastedAlignment(stripWordHtml(html));
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
      HeadingDataAttributes,
      
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
      
      InlineReferenceNode,
      // WP reference: inline atom NODE (migrated from mark in Stage 1 pilot)
      WPReferenceNode,
      // Case reference: inline atom NODE (migrated from mark in Stage 2)
      CaseReferenceNode,
      // Participant reference: inline atom NODE (migrated from mark in Stage 2)
      ParticipantReferenceNode,
      // B1.2 cases-table block node (Stage 1 skeleton)
      CasesTableNode,
      // B3.2 mirror slot block node
      B32MirrorSlotNode,
      // Acronym reference for colored acronym insertion
      AcronymReference,
      CaptionLabel,
      HeadingNumberLabel,
      // Figure/table reference marks for atomic deletion
      FigureTableReferenceMark,
      ParenBadgeGlue,
      BadgeTrailingCaret,
      BadgeCaretHost,
      
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
                  // NOTE: wpReference, caseReference, participantReference,
                  // and inlineReference are inline atom NODES — they handle
                  // their own click-to-select via NodeSelection, so they are
                  // intentionally excluded from this mark-based fallback.
                  const markTypes = ['acronymReference', 'figureTableReference'];
                  
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
                    
                    // (milestone "MS" prefix is now inside the mark itself)

                    
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
      // Protect reference badges from being replaced by typed text when selected
      Extension.create({
        name: 'protectReferenceBadges',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey('protectReferenceBadges'),
              props: {
                handleTextInput(view, from, to, text) {
                  if (from === to) return false;
                  const { doc, schema } = view.state;
                  // wpReference, caseReference, participantReference, and
                  // inlineReference excluded — atom nodes are non-editable.
                  const markNames = ['acronymReference', 'figureTableReference'];
                  let coversRefMark = false;
                  doc.nodesBetween(from, to, (node) => {
                    if (!node.isText) return;
                    for (const markName of markNames) {
                      const markType = schema.marks[markName];
                      if (markType && markType.isInSet(node.marks)) {
                        coversRefMark = true;
                      }
                    }
                  });


                  if (!coversRefMark) return false;
                  // Swallow the input — don't insert anything, don't move cursor
                  return true;

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
                  if (affectsLocked) return;
                  const stepMap = step.getMap();
                  stepMap.forEach((oldStart, oldEnd) => {
                    if (affectsLocked) return;
                    const clampedStart = Math.max(0, Math.min(oldStart, state.doc.content.size));
                    const clampedEnd = Math.max(clampedStart, Math.min(oldEnd, state.doc.content.size));
                    try {
                      // Visit only actual nodes in the changed range (O(nodes), not O(positions)).
                      // This catches locked blocks at the boundaries AND any locked block sitting
                      // entirely inside a multi-block edit (e.g. a large paste / bulk delete).
                      state.doc.nodesBetween(clampedStart, clampedEnd, (_node, pos) => {
                        if (affectsLocked) return false;
                        try {
                          const $pos = state.doc.resolve(pos);
                          let depth = $pos.depth;
                          while (depth > 1) depth--;
                          if (depth >= 1) {
                            const blockNode = $pos.node(depth);
                            const start = $pos.start(depth);
                            const blockId = `${start}-${blockNode.type.name}`;
                            if (lockedBlockIds.has(blockId)) {
                              affectsLocked = true;
                              return false; // stop walking
                            }
                          }
                        } catch {
                          // Ignore invalid positions
                        }
                        return true;
                      });
                    } catch {
                      // Ignore invalid ranges
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
      if (editor.isDestroyed || !editor.schema) return;
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
        return normalizePartBPastedAlignment(stripWordHtml(html));
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
    if (!editor || editor.isDestroyed || !editor.schema) return;
    if (!isReady) return;
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
    if (!editor || editor.isDestroyed || !editor.schema) return;
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
    if (!editor || editor.isDestroyed || !editor.schema || !isReady || !trackChanges?.onChangesUpdate) return;
    // Wait a tick for content to be fully set
    const timer = setTimeout(() => {
      if (!editor || editor.isDestroyed || !editor.schema) return;
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
