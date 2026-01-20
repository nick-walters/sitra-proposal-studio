import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Link as LinkIcon,
  Undo,
  Redo,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCallback } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onInsertImage?: () => void;
  onInsertFootnote?: () => void;
  className?: string;
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

export function RichTextEditor({ content, onChange, onInsertImage, onInsertFootnote, className }: RichTextEditorProps) {
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

  const addImage = useCallback((url: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={className}>
      {/* Toolbar */}
      <div className="editor-toolbar rounded-t-lg">
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
          <ToolbarButton 
            icon={<Heading1 className="w-4 h-4" />} 
            tooltip="Heading 1"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
          />
          <ToolbarButton 
            icon={<Heading2 className="w-4 h-4" />} 
            tooltip="Heading 2"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
          />
          <ToolbarButton 
            icon={<Heading3 className="w-4 h-4" />} 
            tooltip="Inline Sub-header (H3 - Bold & Underlined)"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
          />
        </div>

        <Separator orientation="vertical" className="h-6 mx-2" />

        <div className="flex items-center gap-0.5">
          <ToolbarButton 
            icon={<Bold className="w-4 h-4" />} 
            tooltip="Bold (Ctrl+B)"
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
          />
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
        </div>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}

// Export a method to programmatically insert an image
export function useEditorActions(editor: ReturnType<typeof useEditor>) {
  const insertImage = useCallback((url: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  return { insertImage };
}
