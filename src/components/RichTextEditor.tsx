import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  Grid3X3,
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
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
                    ? 'bg-primary border-primary' 
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
}: { 
  editor: Editor | null;
  sectionNumber?: string;
  content?: string;
}) {
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  
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
      </div>

      <Separator orientation="vertical" className="h-5 mx-1.5" />

      <div className="flex items-center gap-0.5">
        {/* Subheading button with text instead of icon */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={editor.isActive('heading', { level: 3 }) ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <span className="font-black underline">Subheading</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Subheading (Bold & Underlined)
          </TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-5 mx-1.5" />

      <div className="flex items-center gap-0.5">
        {/* Bold button with bolder B */}
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
        <ToolbarButton 
          icon={<Strikethrough className="w-4 h-4" />} 
          tooltip="Strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
        />
      </div>

      <Separator orientation="vertical" className="h-5 mx-1.5" />

      <div className="flex items-center gap-0.5">
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
      </div>

      <Separator orientation="vertical" className="h-5 mx-1.5" />

      <div className="flex items-center gap-0.5">
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
      </div>

      <Separator orientation="vertical" className="h-5 mx-1.5" />

      <div className="flex items-center gap-0.5">
        <ToolbarButton 
          icon={<LinkIcon className="w-4 h-4" />} 
          tooltip="Insert Link"
          onClick={setLink}
          active={editor.isActive('link')}
        />
        
        {/* Table - with size selector or operations */}
        {!isInTable ? (
          <Popover open={tablePopoverOpen} onOpenChange={setTablePopoverOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                  >
                    <TableIcon className="w-4 h-4" />
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
                Merge cells
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().splitCell().run()}>
                Split cell
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
      </div>
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
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-md',
        },
      }),
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
export function useRichTextEditor({ content, onChange }: { content: string; onChange: (content: string) => void }) {
  // Track the last content we set to the editor to avoid infinite loops
  const lastSetContentRef = useRef<string>(content);
  
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
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-md',
        },
      }),
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

  return editor;
}

// Export a method to programmatically insert an image
export function useEditorActions(editor: ReturnType<typeof useEditor>) {
  const insertImage = useCallback((url: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  return { insertImage };
}