import { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { stripWordHtml } from '@/lib/stripWordHtml';
import { cn } from '@/lib/utils';
import { rememberContentEditableSelection, REF_BADGE_INSERTED_EVENT } from '@/lib/contentEditableRefBadges';

/**
 * Minimal contentEditable rich-text field (bold / italic / underline +
 * cross-reference badges). Deliberately dependency-light: formatting is applied
 * by an external toolbar via document.execCommand on the focused field, and
 * cross-ref badges are inserted at the remembered caret.
 */

export const INLINE_RICH_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'span', 'a', 'sub', 'sup', 'div'],
  ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel', 'contenteditable'],
  ALLOW_DATA_ATTR: true,
};

interface InlineRichEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  minHeight?: string;
  className?: string;
  editorClassName?: string;
  placeholder?: string;
  debounceMs?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Inline styles for the editable surface (font family / size). */
  style?: React.CSSProperties;
}

export function InlineRichEditor({
  value,
  onChange,
  disabled = false,
  minHeight = '60px',
  className,
  editorClassName,
  placeholder,
  debounceMs = 500,
  onFocus,
  onBlur,
  style,
}: InlineRichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);
  const hasPendingLocalChangesRef = useRef(false);

  // Initial mount
  useEffect(() => {
    if (editorRef.current && isInitialMount.current) {
      editorRef.current.innerHTML = DOMPurify.sanitize(value || '', INLINE_RICH_SANITIZE_CONFIG);
      hasPendingLocalChangesRef.current = false;
      isInitialMount.current = false;
    }
  }, [value]);

  // External sync (only while unfocused and with no pending local edit)
  useEffect(() => {
    if (!editorRef.current || isFocused) return;
    if (hasPendingLocalChangesRef.current) return;
    const current = editorRef.current.innerHTML;
    const next = value || '';
    if (current === next) return;
    editorRef.current.innerHTML = DOMPurify.sanitize(next, INLINE_RICH_SANITIZE_CONFIG);
  }, [value, isFocused]);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    hasPendingLocalChangesRef.current = true;
    onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      emitChange();
    }, debounceMs);
  }, [emitChange, debounceMs]);

  const flushPending = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    emitChange();
  }, [emitChange]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Cross-ref badge insertions must be persisted immediately: focus bounces
  // back from the picker dialog, which can cut the debounced path short.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const handler = () => flushPending();
    editor.addEventListener(REF_BADGE_INSERTED_EVENT, handler);
    return () => editor.removeEventListener(REF_BADGE_INSERTED_EVENT, handler);
  }, [flushPending]);

  // Remember the caret so toolbar buttons / cross-ref dialogs can restore it.
  useEffect(() => {
    if (!isFocused) return;
    const handler = () => {
      const editor = editorRef.current;
      if (!editor) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      if (!editor.contains(sel.anchorNode)) return;
      rememberContentEditableSelection(editor);
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [isFocused]);

  // Badge insertions performed by external toolbars dispatch input events.
  const showPlaceholder = !value && !isFocused && placeholder;

  return (
    <div className={cn('relative', disabled && 'opacity-60', className)}>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyUp={() => {
          const editor = editorRef.current;
          if (editor) rememberContentEditableSelection(editor);
        }}
        onMouseUp={() => {
          const editor = editorRef.current;
          if (editor) rememberContentEditableSelection(editor);
        }}
        onPaste={(e) => {
          e.preventDefault();
          const html = e.clipboardData.getData('text/html');
          if (html) {
            const cleaned = DOMPurify.sanitize(stripWordHtml(html), INLINE_RICH_SANITIZE_CONFIG);
            document.execCommand('insertHTML', false, cleaned);
          } else {
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          }
        }}
        onFocus={() => {
          setIsFocused(true);
          setTimeout(() => {
            const editor = editorRef.current;
            if (editor) rememberContentEditableSelection(editor);
          }, 0);
          onFocus?.();
        }}
        onBlur={() => {
          flushPending();
          setIsFocused(false);
          onBlur?.();
        }}
        className={cn(
          'w-full px-1.5 py-1 border border-input rounded-md bg-background outline-none overflow-auto',
          'focus:ring-1 focus:ring-ring',
          '[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4',
          disabled && 'cursor-not-allowed',
          editorClassName,
        )}
        style={{ minHeight, ...style }}
      />
      {showPlaceholder && (
        <div className="absolute top-1 left-2 text-muted-foreground pointer-events-none text-sm">
          {placeholder}
        </div>
      )}
    </div>
  );
}
