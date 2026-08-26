import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
// NOTE: TipTap v3 StarterKit already bundles Underline — do NOT import
// '@tiptap/extension-underline' here or it registers twice and the
// extension manager warns + destabilises mark resolution.

import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import Typography from '@tiptap/extension-typography';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { useEffect, useRef } from 'react';
import { wordCleanPasteProps } from '@/lib/tiptapPasteProps';
import { WPReferenceNode } from '@/extensions/WPReferenceNode';
import { CaseReferenceNode } from '@/extensions/CaseReferenceNode';
import { ParenBadgeGlue } from '@/extensions/ParenBadgeGlue';
import { InlineReferenceNode } from '@/extensions/InlineReferenceNode';
import { CanvasFontSize } from '@/extensions/CanvasFontSize';
import { CanvasHeader } from '@/extensions/CanvasHeader';
import { setFocusedCanvasEditor, getFocusedCanvasEditor } from '@/lib/impactCanvasFocusedEditor';
import { collapseStackedCanvasFontSize } from '@/lib/collapseStackedCanvasFontSize';

interface Props {
  html: string;
  /** `userEdit` is true only for real keystrokes/commands in this editor —
   *  false for programmatic normalisation writes. */
  onChange: (html: string, userEdit: boolean) => void;
  onFocus: (editor: Editor) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

function isCanvasToolbarTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('[data-impact-canvas-toolbar]');
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
      Typography,
      StarterKit.configure({ heading: false }),
      
      Superscript,
      Subscript,
      TextStyle,
      Color,
      CanvasFontSize,
      CanvasHeader,
      WPReferenceNode,
      CaseReferenceNode,
      InlineReferenceNode,
      ParenBadgeGlue,
    ],
    content: collapseStackedCanvasFontSize(html || ''),
    editable: !disabled,
    editorProps: {
      ...wordCleanPasteProps,
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] px-2 py-1 !text-left [&_*]:!text-left',
      },
    },
    onUpdate: ({ editor }) => {
      const next = editor.getHTML();
      if (next === lastEmitted.current) return;
      lastEmitted.current = next;
      onChange(next, true);
    },
    onFocus: ({ editor }) => {
      setFocusedCanvasEditor(editor);
      onFocus(editor);
    },
    onBlur: ({ editor, event }) => {
      if (isCanvasToolbarTarget(event.relatedTarget)) return;
      queueMicrotask(() => {
        if (getFocusedCanvasEditor() === editor) setFocusedCanvasEditor(null);
      });
      onBlur?.();
    },
  });

  // Sync external changes into the editor without clobbering the caret
  // while typing. Runs the one-time collapser for legacy stacked
  // canvasFontSize marks; if it rewrote the HTML, persist via onChange.
  useEffect(() => {
    if (!editor) return;
    if (html === lastEmitted.current) return;
    // Never re-seed the document while the user is typing in this cell: a
    // background refetch landing mid-keystroke would reset the caret.
    if (editor.isFocused) return;
    const cleaned = collapseStackedCanvasFontSize(html || '');
    lastEmitted.current = cleaned;
    editor.commands.setContent(cleaned, { emitUpdate: false });
    if (cleaned !== (html || '')) onChange(cleaned, false);
  }, [html, editor, onChange]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <div className="w-full">
      <EditorContent editor={editor} />
    </div>
  );
}
