import { useEffect, useId, useRef, useState } from 'react';
import { EditorContent, type Editor } from '@tiptap/react';
import { useRichTextEditor } from './RichTextEditor';
import { useMethodologyEditorFocus } from './MethodologyEditorFocusContext';

interface MethodologyRichEditorProps {
  proposalId: string;
  value: string;
  onChange: (html: string) => void;
  canEdit: boolean;
  isCoordinator: boolean;
  minHeight?: string;
  /**
   * Border/ring classes used while this editor is the focused one. Defaults to
   * the ordinary blue focus chrome; the cards board overrides it with green
   * when the current user holds the lock on this text box.
   */
  activeRingClass?: string;
  /** Called once with the live TipTap instance when it is created. */
  onEditorReady?: (editor: Editor) => void;
  /**
   * Grey italic hint shown INSIDE the field while it is empty. It is a true
   * placeholder — never part of the document — so it survives typing and
   * reappears when the content is fully removed.
   */
  placeholder?: string;
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
  activeRingClass = 'border-primary ring-1 ring-primary/40',
  onEditorReady,
  placeholder,
}: MethodologyRichEditorProps) {
  // Stable, unique per mounted instance — several editors live on one page.
  const instanceKey = useId();
  const { activeEditor, registerFocus, notifyBlur, unregister } = useMethodologyEditorFocus();

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

  // Hand the live instance to the parent exactly once (LazyRichField uses it
  // to place the caret at the click point and to watch for focus loss).
  const readyRef = useRef(false);
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;
  useEffect(() => {
    if (!editor || readyRef.current) return;
    readyRef.current = true;
    onEditorReadyRef.current?.(editor);
  }, [editor]);



  // Register on focus (DOM listener on the ProseMirror element — the shared
  // useRichTextEditor hook does not expose TipTap's onFocus option).
  //
  // Lazily-mounted fields (<LazyRichField />) focus the editor programmatically
  // in the ready callback above, which runs BEFORE this effect attaches its
  // listener: the initial focus event is therefore missed and the field would
  // never become the active editor, leaving the shared formatting bar hidden.
  // Registering up-front whenever the instance already holds focus closes that
  // gap; TipTap's own 'focus' event is also used, since a programmatic
  // `commands.focus()` on an already-focused document emits no DOM event.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const handler = () => registerFocus(editor);
    const blurHandler = () => notifyBlur(editor);
    dom.addEventListener('focus', handler);
    dom.addEventListener('blur', blurHandler);
    editor.on('focus', handler);
    editor.on('blur', blurHandler);
    if (editor.isFocused || document.activeElement === dom || dom.contains(document.activeElement)) {
      registerFocus(editor);
    }
    return () => {
      dom.removeEventListener('focus', handler);
      dom.removeEventListener('blur', blurHandler);
      editor.off('focus', handler);
      editor.off('blur', blurHandler);
    };
  }, [editor, registerFocus, notifyBlur]);

  useEffect(() => {
    if (!editor) return;
    return () => unregister(editor);
  }, [editor, unregister]);

  const isActive = Boolean(editor) && activeEditor === editor;

  return (
    <div
      className={`overflow-visible rounded-md border bg-background px-2.5 py-1.5 transition-colors [&_.ProseMirror]:!min-h-0 [&_.ProseMirror]:overflow-visible [&_.document-content]:!min-h-0 ${
        canEdit ? 'cursor-text' : 'cursor-default select-text'
      } ${isActive && canEdit ? activeRingClass : 'border-border'}`}
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
