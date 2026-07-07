import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { useEffect, useRef } from 'react';
import { wordCleanPasteProps } from '@/lib/tiptapPasteProps';
import { WPReferenceNode } from '@/extensions/WPReferenceNode';
import { CaseReferenceNode } from '@/extensions/CaseReferenceNode';
import { InlineReferenceNode } from '@/extensions/InlineReferenceNode';
import { CanvasFontSize } from '@/extensions/CanvasFontSize';
import { CanvasHeader } from '@/extensions/CanvasHeader';
import { setFocusedCanvasEditor, getFocusedCanvasEditor } from '@/lib/impactCanvasFocusedEditor';

interface Props {
  html: string;
  onChange: (html: string) => void;
  onFocus: (editor: Editor) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Small rich-text cell editor for the Impact Canvas builder. Focus reports
 * up so the SHARED canvas text toolbar can operate on the currently-
 * focused cell (bold/italic/underline/sup/sub/colour/size/header — via
 * `setFocusedCanvasEditor`).
 *
 * Reference node extensions (WP/Case/Inline) are registered so the shared
 * toolbar can insert badges into the focused cell. Canvas marks
 * (CanvasFontSize / CanvasHeader) + Underline/Superscript/Subscript +
 * TextStyle/Color are registered so per-run rich formatting round-trips
 * through save/reload.
 */
export function ImpactCanvasCellEditor({ html, onChange, onFocus, onBlur, disabled, placeholder }: Props) {
  const lastEmitted = useRef(html);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      Superscript,
      Subscript,
      TextStyle,
      Color,
      CanvasFontSize,
      CanvasHeader,
      WPReferenceNode,
      CaseReferenceNode,
      InlineReferenceNode,
    ],
    content: html || '',
    editable: !disabled,
    editorProps: {
      ...wordCleanPasteProps,
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] px-2 py-1 text-left [&_*]:text-left',
      },
    },
    onUpdate: ({ editor }) => {
      const next = editor.getHTML();
      if (next === lastEmitted.current) return;
      lastEmitted.current = next;
      onChange(next);
    },
    onFocus: ({ editor }) => {
      setFocusedCanvasEditor(editor);
      onFocus(editor);
    },
    onBlur: ({ editor }) => {
      queueMicrotask(() => {
        if (getFocusedCanvasEditor() === editor) setFocusedCanvasEditor(null);
      });
      onBlur?.();
    },
  });

  // Sync external changes into the editor without clobbering the caret while typing.
  useEffect(() => {
    if (!editor) return;
    if (html === lastEmitted.current) return;
    lastEmitted.current = html;
    editor.commands.setContent(html || '', { emitUpdate: false });
  }, [html, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <div className="w-full">
      <EditorContent editor={editor} />
    </div>
  );
}
