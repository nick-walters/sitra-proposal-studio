import { useEffect, useId } from 'react';
import { EditorContent } from '@tiptap/react';
import { useRichTextEditor } from './RichTextEditor';
import { useMethodologyEditorFocus } from './MethodologyEditorFocusContext';

interface MethodologyRichEditorProps {
  proposalId: string;
  value: string;
  onChange: (html: string) => void;
  canEdit: boolean;
  isCoordinator: boolean;
  minHeight?: string;
}

/**
 * Editor surface for a single Methodologies field. The formatting bar lives
 * once at the top of the Methodologies page and acts on whichever editor was
 * last focused (see MethodologyEditorFocusContext).
 */
export function MethodologyRichEditor({
  proposalId,
  value,
  onChange,
  canEdit,
  isCoordinator,
  minHeight = '2.5rem',
}: MethodologyRichEditorProps) {
  // Stable, unique per mounted instance — several editors live on one page.
  const instanceKey = useId();
  const { activeEditor, registerFocus, unregister } = useMethodologyEditorFocus();

  const editor = useRichTextEditor({
    content: value,
    onChange,
    isReady: true,
    instanceKey,
  });

  useEffect(() => {
    if (editor) editor.setEditable(canEdit);
  }, [editor, canEdit]);

  // Register on focus (DOM listener on the ProseMirror element — the shared
  // useRichTextEditor hook does not expose TipTap's onFocus option).
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const handler = () => registerFocus(editor);
    dom.addEventListener('focus', handler);
    return () => {
      dom.removeEventListener('focus', handler);
    };
  }, [editor, registerFocus]);

  useEffect(() => {
    if (!editor) return;
    return () => unregister(editor);
  }, [editor, unregister]);

  const isActive = Boolean(editor) && activeEditor === editor;

  return (
    <div
      className={`cursor-text overflow-visible rounded-md border bg-background px-4 py-2 transition-colors [&_.ProseMirror]:!min-h-0 [&_.ProseMirror]:overflow-visible [&_.document-content]:!min-h-0 ${
        isActive ? 'border-primary ring-1 ring-primary/40' : 'border-border'
      }`}
      style={{ minHeight }}
      onMouseDown={(e) => {
        // Clicking the padding focuses the editor rather than doing nothing.
        if (e.target === e.currentTarget && editor) {
          e.preventDefault();
          editor.chain().focus('end').run();
        }
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

export default MethodologyRichEditor;
