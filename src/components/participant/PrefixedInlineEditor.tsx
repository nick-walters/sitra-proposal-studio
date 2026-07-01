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

  /**
   * Returns the first valid caret position AFTER the prefix island (i.e. after
   * the prefix span AND its trailing NBSP). Null if the editor/prefix aren't
   * ready yet.
   */
  const getMinCaretPoint = useCallback((): { node: Node; offset: number } | null => {
    const root = editorRef.current;
    if (!root) return null;
    const prefixEl = root.querySelector(`[${PREFIX_ATTR}]`);
    if (!prefixEl) return null;
    const next = prefixEl.nextSibling;
    if (next && next.nodeType === Node.TEXT_NODE && /^\u00a0/.test(next.textContent || '')) {
      // Caret sits AFTER the NBSP (offset 1).
      return { node: next, offset: 1 };
    }
    // Fallback: right after the prefix element within the editor root.
    const idx = Array.prototype.indexOf.call(root.childNodes, prefixEl);
    return { node: root, offset: idx + 1 };
  }, []);

  /**
   * True if the given caret point is at or before the minimum allowed
   * position (i.e. before the end of the prefix + NBSP).
   */
  const isBeforeMin = useCallback((node: Node, offset: number): boolean => {
    const root = editorRef.current;
    if (!root) return false;
    const min = getMinCaretPoint();
    if (!min) return false;
    // Compare via a Range: caret point vs min point.
    const a = document.createRange();
    try {
      a.setStart(node, offset);
    } catch {
      return true;
    }
    const b = document.createRange();
    try {
      b.setStart(min.node, min.offset);
    } catch {
      return false;
    }
    // If a.start is before b.start -> caret is before minimum.
    return a.compareBoundaryPoints(Range.START_TO_START, b) < 0;
  }, [getMinCaretPoint]);

  const clampCaret = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) return;
    const startBefore = isBeforeMin(range.startContainer, range.startOffset);
    const endBefore = isBeforeMin(range.endContainer, range.endOffset);
    if (!startBefore && !endBefore) return;
    const min = getMinCaretPoint();
    if (!min) return;
    const next = document.createRange();
    next.setStart(min.node, min.offset);
    // If selection was a range that started before min but ended after, clamp only start.
    if (range.collapsed || endBefore) {
      next.collapse(true);
    } else {
      next.setEnd(range.endContainer, range.endOffset);
    }
    sel.removeAllRanges();
    sel.addRange(next);
  }, [getMinCaretPoint, isBeforeMin]);

  // Global selectionchange listener while focused — catches clicks anywhere,
  // programmatic selection, keyboard nav, etc.
  useEffect(() => {
    if (!isFocused) return;
    const handler = () => clampCaret();
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [isFocused, clampCaret]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editorRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    // Home / Ctrl+Home: force caret to first valid position AFTER prefix.
    if (e.key === 'Home') {
      e.preventDefault();
      const min = getMinCaretPoint();
      if (min) {
        const r = document.createRange();
        r.setStart(min.node, min.offset);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return;
    }

    // Prevent Backspace from deleting into the non-editable prefix.
    if (e.key === 'Backspace' && range.collapsed) {
      const prefixEl = editorRef.current.querySelector(`[${PREFIX_ATTR}]`);
      if (!prefixEl) return;
      const container = range.startContainer;
      if (container.nodeType === Node.TEXT_NODE) {
        const text = container.textContent || '';
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
  }, [getMinCaretPoint]);

  // Block any input event whose caret is before the minimum position.
  const handleBeforeInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (isBeforeMin(range.startContainer, range.startOffset)) {
      e.preventDefault();
      clampCaret();
    }
  }, [isBeforeMin, clampCaret]);

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
