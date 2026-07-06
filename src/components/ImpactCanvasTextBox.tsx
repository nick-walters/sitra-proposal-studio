import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { useEffect, useRef } from 'react';
import { wordCleanPasteProps } from '@/lib/tiptapPasteProps';

interface Props {
  html: string;
  editing: boolean;
  onChange: (html: string) => void;
  onCommit?: () => void;
  autoFocus?: boolean;
  /** Text alignment inside the editor. 'left' (default) for free text boxes,
   *  'center' for shape-embedded text. */
  align?: 'left' | 'center';
}

export function ImpactCanvasTextBox({ html, editing, onChange, onCommit, autoFocus, align = 'left' }: Props) {
  const lastEmitted = useRef(html);

  const alignClass =
    align === 'center'
      ? 'text-center [&_*]:text-center'
      : 'text-left [&_*]:text-left';

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false }), Underline],
    content: html || '',
    editable: editing,
    editorProps: {
      ...wordCleanPasteProps,
      attributes: {
        class:
          `prose prose-sm max-w-none focus:outline-none w-full h-full ${alignClass}`,
      },
    },
    onUpdate: ({ editor }) => {
      const next = editor.getHTML();
      if (next === lastEmitted.current) return;
      lastEmitted.current = next;
      onChange(next);
    },
    onBlur: () => onCommit?.(),
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editing);
    if (editing && autoFocus) {
      // Defer so the DOM element has focus surface ready.
      queueMicrotask(() => editor.commands.focus('end'));
    }
  }, [editing, autoFocus, editor]);

  // Sync external HTML changes without clobbering the caret.
  useEffect(() => {
    if (!editor) return;
    if (html === lastEmitted.current) return;
    lastEmitted.current = html;
    editor.commands.setContent(html || '', { emitUpdate: false });
  }, [html, editor]);

  return (
    <div
      data-impact-canvas-textbox-editor
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
      // Prevent drag pointerdown from stealing focus while editing.
      onPointerDown={(e) => {
        if (editing) e.stopPropagation();
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
