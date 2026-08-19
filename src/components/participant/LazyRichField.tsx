import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { generateHTML, generateJSON, type Editor, type Extensions } from '@tiptap/core';
import DOMPurify from 'dompurify';
import { CROSS_REF_RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import { cn } from '@/lib/utils';
import { MethodologyRichEditor } from '@/components/MethodologyRichEditor';
import { LAZY_RICH_FIELD_EXTENSIONS } from './lazyRichFieldExtensions';

export interface LazyRichFieldProps {
  /** Stored HTML for this field. */
  value: string;
  /** Called with the new HTML while the editor is mounted, and once on unmount. */
  onChange: (html: string) => void;
  /** Non-editable leading island (participant bubble). Never part of `value`. */
  prefix?: ReactNode;
  disabled?: boolean;
  minHeight?: string;
  className?: string;
  /** Proposal the field belongs to — forwarded to the shared editor. */
  proposalId: string;
  /** Fired when the field mounts its editor. */
  onFocus?: () => void;
  /** Fired after the editor unmounts back to static HTML. */
  onBlur?: () => void;
  /**
   * Return true to keep the editor mounted even though it lost DOM focus
   * (toolbar dropdown / cross-reference dialog open).
   */
  shouldStayMounted?: () => boolean;
  /**
   * Schema used for the STATIC (unfocused) render. Defaults to the minimal
   * A2 participant set; case drafts pass a richer one.
   */
  staticExtensions?: Extensions;
}

/** Render stored HTML through the TipTap schema, then sanitise. */
function renderStatic(html: string, extensions: Extensions): string {
  if (!html || !html.trim()) return '';
  try {
    const json = generateJSON(html, extensions);
    const out = generateHTML(json, extensions);
    return DOMPurify.sanitize(out, CROSS_REF_RICH_TEXT_CONFIG);
  } catch {
    // Never blank a field because of a parse failure.
    return DOMPurify.sanitize(html, CROSS_REF_RICH_TEXT_CONFIG);
  }
}


/**
 * Lazy-mounting rich field.
 *
 * Unfocused it renders static HTML generated from the TipTap schema (so
 * reference badges are drawn from node attributes, not from the legacy
 * hydration path). On mousedown/focus it mounts a real TipTap editor,
 * places the caret at the clicked coordinates, and on blur it unmounts
 * again — so at most one ProseMirror instance is alive at a time.
 */
export function LazyRichField({
  value,
  onChange,
  prefix,
  disabled = false,
  minHeight = '90px',
  className,
  proposalId,
  onFocus,
  onBlur,
  shouldStayMounted,
}: LazyRichFieldProps) {
  const [mounted, setMounted] = useState(false);
  const clickCoordsRef = useRef<{ left: number; top: number } | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const staticHtml = useMemo(() => (mounted ? '' : renderStatic(value)), [value, mounted]);

  useEffect(() => () => {
    if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
  }, []);

  const unmountEditor = useCallback(() => {
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed) {
      const html = editor.getHTML();
      if (html !== valueRef.current) onChange(html);
    }
    editorRef.current = null;
    setMounted(false);
    onBlur?.();
  }, [onChange, onBlur]);

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      const dom = editor.view.dom as HTMLElement;

      const coords = clickCoordsRef.current;
      clickCoordsRef.current = null;
      // Focus first, then map the recorded click coordinates onto a document
      // position so the caret lands where the user actually clicked.
      editor.commands.focus();
      if (coords) {
        const hit = editor.view.posAtCoords(coords);
        if (hit) {
          editor.commands.setTextSelection(hit.pos);
        } else {
          editor.commands.focus('end');
        }
      }

      const handleFocusOut = () => {
        if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = setTimeout(() => {
          unmountTimerRef.current = null;
          const current = editorRef.current;
          if (!current || current.isDestroyed) return;
          // Window/app blur, toolbar buttons and open dialogs keep the field.
          if (!document.hasFocus()) return;
          if (current.isFocused) return;
          if (shouldStayMounted?.()) return;
          if (dom.contains(document.activeElement)) return;
          // Focus sitting inside a dialog, dropdown or popover (cross-reference
          // pickers, colour popovers) must not tear the editor down — the user
          // is about to insert into it.
          const active = document.activeElement as HTMLElement | null;
          if (
            active?.closest(
              '[role="dialog"],[role="menu"],[data-radix-popper-content-wrapper],[data-radix-portal]',
            )
          ) {
            return;
          }
          unmountEditor();
        }, 180);
      };


      dom.addEventListener('focusout', handleFocusOut);
      editor.on('destroy', () => dom.removeEventListener('focusout', handleFocusOut));
    },
    [shouldStayMounted, unmountEditor],
  );

  const activate = useCallback(
    (coords: { left: number; top: number } | null) => {
      if (disabled || mounted) return;
      clickCoordsRef.current = coords;
      setMounted(true);
      onFocus?.();
    },
    [disabled, mounted, onFocus],
  );

  return (
    <div className={cn('relative', className)}>
      {prefix && (
        <span
          className="float-left mr-1 select-none"
          contentEditable={false}
          data-participant-prefix="1"
        >
          {prefix}
        </span>
      )}
      {mounted ? (
        <MethodologyRichEditor
          proposalId={proposalId}
          value={value}
          onChange={onChange}
          canEdit={!disabled}
          isCoordinator={false}
          minHeight={minHeight}
          onEditorReady={handleEditorReady}
        />
      ) : (
        <div
          role="textbox"
          tabIndex={disabled ? -1 : 0}
          aria-readonly={disabled}
          className={cn(
            'document-content rounded-md border border-border bg-background px-4 py-2 text-sm',
            disabled ? 'cursor-default' : 'cursor-text',
          )}
          style={{ minHeight }}
          onMouseDown={(e) => {
            if (disabled) return;
            e.preventDefault();
            activate({ left: e.clientX, top: e.clientY });
          }}
          onFocus={() => activate(null)}
          dangerouslySetInnerHTML={{ __html: staticHtml }}
        />
      )}
    </div>
  );
}

export default LazyRichField;
