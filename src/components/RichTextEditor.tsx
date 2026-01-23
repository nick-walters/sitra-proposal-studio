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
  ImageIcon,
  Link as LinkIcon,
  Undo,
  Redo,
  Table as TableIcon,
  Plus,
  Minus,
  Trash2,
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
import { useCallback } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onInsertImage?: () => void;
  onInsertFootnote?: () => void;
  className?: string;
  renderToolbar?: (editor: Editor) => React.ReactNode;
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
          className="h-8 w-8"
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

// Export the formatting toolbar as a separate component
export function FormattingToolbar({ 
  editor, 
  onInsertImage 
}: { 
  editor: Editor | null; 
  onInsertImage?: () => void;
}) {
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

  const insertTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  const isInTable = editor.isActive('table');

  return (
    <div className="editor-toolbar border-b border-border bg-card p-2">
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

      <Separator orientation="vertical" className="h-6 mx-2" />

      <div className="flex items-center gap-0.5">
        {/* Subheading button with text instead of icon */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={editor.isActive('heading', { level: 3 }) ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2 text-xs"
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

      <Separator orientation="vertical" className="h-6 mx-2" />

      <div className="flex items-center gap-0.5">
        {/* Bold button with bolder B */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={editor.isActive('bold') ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
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

      <Separator orientation="vertical" className="h-6 mx-2" />

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

      <Separator orientation="vertical" className="h-6 mx-2" />

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

      <Separator orientation="vertical" className="h-6 mx-2" />

      <div className="flex items-center gap-0.5">
        <ToolbarButton 
          icon={<ImageIcon className="w-4 h-4" />} 
          tooltip="Insert Image"
          onClick={onInsertImage}
        />
        <ToolbarButton 
          icon={<LinkIcon className="w-4 h-4" />} 
          tooltip="Insert Link"
          onClick={setLink}
          active={editor.isActive('link')}
        />
        
        {/* Table dropdown */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={isInTable ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                >
                  <TableIcon className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Table
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-48">
            {!isInTable ? (
              <DropdownMenuItem onClick={insertTable}>
                <Plus className="w-4 h-4 mr-2" />
                Insert table (3×3)
              </DropdownMenuItem>
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
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
        <FormattingToolbar editor={editor} onInsertImage={onInsertImage} />
      )}

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}

// Hook to get editor instance for external toolbar control
export function useRichTextEditor({ content, onChange }: { content: string; onChange: (content: string) => void }) {
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