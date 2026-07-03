import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { useEffect, useRef } from 'react';
import { wordCleanPasteProps } from '@/lib/tiptapPasteProps';
import { WPReferenceNode } from '@/extensions/WPReferenceNode';
import { CaseReferenceNode } from '@/extensions/CaseReferenceNode';
import { InlineReferenceNode } from '@/extensions/InlineReferenceNode';

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
 * up so a SHARED toolbar can operate on the currently-focused cell (avoids
 * spawning a toolbar per cell for large N×6 grids).
 *
 * Reference node extensions (WP/Case/Inline) are registered so the shared
 * toolbar can insert badges into the focused cell via the standard
 * `insertWPReference` / `insertCaseReference` / `insertTaskReference` /
 * `insertDeliverableReference` commands. Without them TipTap would silently
 * strip the badge markup on serialisation.
 */
export function ImpactCanvasCellEditor({ html, onChange, onFocus, onBlur, disabled, placeholder }: Props) {
  const lastEmitted = useRef(html);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
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
    onFocus: ({ editor }) => onFocus(editor),
    onBlur: () => onBlur?.(),
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
