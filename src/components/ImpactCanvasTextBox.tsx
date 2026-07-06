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
}

/**
 * Minimal in-place TipTap editor for free text-box elements on the
 * Impact Canvas figure page. Bold/italic/lists via keyboard shortcuts;
 * wordCleanPasteProps sanitises pasted content.
 *
 * `editing=false` renders the editor read-only (no caret, non-editable).
 * `editing=true` puts it in edit mode. The wrapping div carries the
 * data-impact-canvas-textbox-editor marker so the outside-click clearer
 * in ImpactCanvasFreeformEditor knows to leave the editor alone while
 * the user is typing inside it (or inside its paste popovers).
 */
export function ImpactCanvasTextBox({ html, editing, onChange, onCommit, autoFocus }: Props) {
  const lastEmitted = useRef(html);

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false }), Underline],
    content: html || '',
    editable: editing,
    editorProps: {
      ...wordCleanPasteProps,
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none w-full h-full text-left [&_*]:text-left',
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
