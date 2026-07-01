import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DOMPurify from 'dompurify';
import { stripWordHtml } from '@/lib/stripWordHtml';
import { cn } from '@/lib/utils';

/**
 * A minimal contentEditable field with a non-editable leading prefix
 * (rendered from a ReactNode) that is NEVER included in the saved value.
 *
 * Used only for A2 participant-description fields — deliberately separate
 * from WPSimpleEditor so WP/case-draft consumers are unaffected.
 */

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'span', 'a', 'sub', 'sup', 'div'],
  ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel'],
};

const PREFIX_ATTR = 'data-participant-prefix';

interface PrefixedInlineEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** ReactNode rendered as a NON-EDITABLE leading island. Excluded from saved value. */
  prefix: ReactNode;
  disabled?: boolean;
  minHeight?: string;
  className?: string;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

/** Render prefix to a static HTML string wrapped in a non-editable island. */
function buildPrefixHtml(prefix: ReactNode): string {
  const inner = renderToStaticMarkup(<>{prefix}</>);
  // trailing &nbsp; guarantees the caret has a text position AFTER the island.
  return `<span ${PREFIX_ATTR}="1" contenteditable="false" style="user-select:none;">${inner}</span>&nbsp;`;
}

/** Strip the leading prefix island from an HTML string. */
function stripPrefix(html: string): string {
  // Remove the prefix span (and the single &nbsp; we injected right after it).
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const prefixEl = tmp.querySelector(`[${PREFIX_ATTR}]`);
  if (prefixEl) {
    // Also remove an immediately-following non-breaking-space text node.
    const next = prefixEl.nextSibling;
    prefixEl.remove();
    if (next && next.nodeType === Node.TEXT_NODE && /^\u00a0/.test(next.textContent || '')) {
      next.textContent = (next.textContent || '').replace(/^\u00a0/, '');
    }
  }
  return tmp.innerHTML;
}

export function PrefixedInlineEditor({
  value,
  onChange,
  prefix,
  disabled = false,
  minHeight = '90px',
  className,
  placeholder,
  onFocus,
  onBlur,
}: PrefixedInlineEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);
  const hasPendingLocalChangesRef = useRef(false);
  const prefixHtml = buildPrefixHtml(prefix);
  const prefixHtmlRef = useRef(prefixHtml);
  prefixHtmlRef.current = prefixHtml;

  // Initial mount
  useEffect(() => {
    if (editorRef.current && isInitialMount.current) {
      const bodyHtml = DOMPurify.sanitize(value || '', SANITIZE_CONFIG);
      editorRef.current.innerHTML = prefixHtmlRef.current + bodyHtml;
      hasPendingLocalChangesRef.current = false;
      isInitialMount.current = false;
    }
  }, [value]);

  // External sync
  useEffect(() => {
    if (!editorRef.current || isFocused) return;
    if (hasPendingLocalChangesRef.current) return;

    const currentBody = stripPrefix(editorRef.current.innerHTML);
    const nextBody = value || '';
    if (currentBody === nextBody) return;

    editorRef.current.innerHTML =
      prefixHtmlRef.current + DOMPurify.sanitize(nextBody, SANITIZE_CONFIG);
  }, [value, isFocused]);

  const ensurePrefix = useCallback(() => {
    if (!editorRef.current) return;
    const existing = editorRef.current.querySelector(`[${PREFIX_ATTR}]`);
    if (!existing || existing !== editorRef.current.firstChild) {
      // Reinject prefix at the start; preserve any existing body content.
      const bodyBefore = stripPrefix(editorRef.current.innerHTML);
      editorRef.current.innerHTML = prefixHtmlRef.current + bodyBefore;
      // Place caret at end
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, []);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    ensurePrefix();
    const body = stripPrefix(editorRef.current.innerHTML);
    hasPendingLocalChangesRef.current = true;
    onChange(body);
  }, [ensurePrefix, onChange]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      emitChange();
    }, 500);
  }, [emitChange]);

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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editorRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    // Prevent Backspace from deleting into the non-editable prefix.
    if (e.key === 'Backspace' && range.collapsed) {
      const prefixEl = editorRef.current.querySelector(`[${PREFIX_ATTR}]`);
      if (!prefixEl) return;
      // If caret sits right after the prefix (offset 0 in the &nbsp; text node
      // or 0 in first element after prefix), block deletion.
      const container = range.startContainer;
      if (container.nodeType === Node.TEXT_NODE) {
        const text = container.textContent || '';
        // Caret at position 0 or 1 of the nbsp text node that follows the prefix
        if (
          container.previousSibling === prefixEl &&
          range.startOffset <= 1 &&
          /^\u00a0/.test(text)
        ) {
          e.preventDefault();
          return;
        }
      } else if (container === editorRef.current && range.startOffset <= 1) {
        e.preventDefault();
        return;
      }
    }
  }, []);

  const showPlaceholder =
    !value && !isFocused && placeholder;

  return (
    <div
      className={cn(
        'border rounded-md overflow-hidden bg-background',
        disabled && 'opacity-50',
        className,
      )}
    >
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            e.preventDefault();
            const html = e.clipboardData.getData('text/html');
            if (html) {
              const cleaned = stripWordHtml(html);
              document.execCommand('insertHTML', false, cleaned);
            } else {
              const text = e.clipboardData.getData('text/plain');
              document.execCommand('insertText', false, text);
            }
          }}
          onFocus={() => {
            setIsFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            flushPending();
            setIsFocused(false);
            onBlur?.();
          }}
          className={cn(
            'p-3 outline-none resize-y overflow-auto text-draft',
            '[&_p]:mt-[6pt] [&_p]:mb-[6pt]',
            '[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4',
            disabled && 'cursor-not-allowed',
          )}
          style={{ minHeight, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt' }}
        />
        {showPlaceholder && (
          <div className="absolute top-3 left-3 text-muted-foreground text-draft pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
