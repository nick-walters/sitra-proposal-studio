import { useCallback } from 'react';
import { EditorContent } from '@tiptap/react';
import { Bold, List, Link as LinkIcon, Link2Off } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useRichTextEditor } from '@/components/RichTextEditor';
import { OrderedListDropdown } from '@/components/OrderedListDropdown';
import { ToolbarButton, TextFormattingGroup } from '@/components/toolbar';
import { safeHref } from '@/lib/safeUrl';

export interface AdminRichTextFieldProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  minHeight?: string;
  className?: string;
}

/**
 * Guideline / criteria editor used by Template Management.
 *
 * It is the platform's own TipTap editor (`useRichTextEditor`, the same hook
 * behind every proposal field) with a deliberately narrow toolbar: bold,
 * italic, underline, bullet list, numbered list and hyperlink. Nothing about
 * the schema is redefined here, so existing seeded HTML — `<br>`, `<div>`,
 * `<a>`, `<b>` — parses exactly as it does on the writer-facing boards.
 */
export function AdminRichTextField({
  value,
  onChange,
  disabled = false,
  minHeight = '9rem',
  className,
}: AdminRichTextFieldProps) {
  const editor = useRichTextEditor({
    content: value,
    onChange,
    isReady: true,
  });

  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes('link')?.href ?? '';
    const input = window.prompt('Link URL', previous);
    if (input === null) return;
    if (!input.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const href = safeHref(input.trim());
    if (!href) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }, [editor]);

  if (!editor) return null;

  const editable = !disabled;
  editor.setEditable(editable);

  return (
    <div className={cn('rounded-md border', className)}>
      {editable && (
        <div
          className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1"
          onMouseDown={(e) => e.preventDefault()}
        >
          <TextFormattingGroup
            onBold={() => editor.chain().focus().toggleBold().run()}
            onItalic={() => editor.chain().focus().toggleItalic().run()}
            onUnderline={() => editor.chain().focus().toggleUnderline().run()}
            isBoldActive={editor.isActive('bold')}
            isItalicActive={editor.isActive('italic')}
            isUnderlineActive={editor.isActive('underline')}
            boldIcon={<Bold className="h-4 w-4" />}
          />

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton
            icon={<List className="h-4 w-4" />}
            label="Bullet list"
            isActive={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <OrderedListDropdown editor={editor} active={editor.isActive('orderedList')} />

          <Separator orientation="vertical" className="mx-1 h-5" />

          <ToolbarButton
            icon={<LinkIcon className="h-4 w-4" />}
            label="Insert link"
            isActive={editor.isActive('link')}
            onClick={setLink}
          />
          <ToolbarButton
            icon={<Link2Off className="h-4 w-4" />}
            label="Remove link"
            disabled={!editor.isActive('link')}
            onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
          />
        </div>
      )}

      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-3 py-2 text-sm [&_.ProseMirror]:outline-none"
        style={{ minHeight }}
      />
    </div>
  );
}

export default AdminRichTextField;
