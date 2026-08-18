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

  // TipTap's `editable` is instance state, not a reactive prop: it MUST be
  // pushed onto the live instance whenever the lock state changes, in both
  // directions. This also flips the DOM contenteditable attribute, so a
  // blocked user gets no caret while the text stays selectable.
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
      className={`overflow-visible rounded-md border bg-background px-4 py-2 transition-colors [&_.ProseMirror]:!min-h-0 [&_.ProseMirror]:overflow-visible [&_.document-content]:!min-h-0 ${
        canEdit ? 'cursor-text' : 'cursor-default select-text'
      } ${isActive && canEdit ? 'border-primary ring-1 ring-primary/40' : 'border-border'}`}
      style={{ minHeight }}
      onMouseDown={(e) => {
        if (!canEdit) return;
        // Clicking the padding focuses the editor rather than doing nothing.
        if (e.target === e.currentTarget && editor) {
          e.preventDefault();
          editor.chain().focus('end').run();
        }
      }}
      // Belt and braces: even if focus is somehow acquired, typing does
      // nothing while read-only. Copy/select shortcuts stay available.
      onKeyDownCapture={(e) => {
        if (canEdit) return;
        if (e.ctrlKey || e.metaKey) return;
        const navigational =
          e.key.startsWith('Arrow') ||
          ['Home', 'End', 'PageUp', 'PageDown', 'Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(
            e.key,
          );
        if (!navigational) e.preventDefault();
      }}
      onBeforeInputCapture={(e) => {
        if (!canEdit) e.preventDefault();
      }}
      onPasteCapture={(e) => {
        if (!canEdit) e.preventDefault();
      }}
      onDropCapture={(e) => {
        if (!canEdit) e.preventDefault();
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );

}

export default MethodologyRichEditor;
