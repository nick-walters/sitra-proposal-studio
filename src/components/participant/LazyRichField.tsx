import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { generateHTML, generateJSON, type Editor, type Extensions } from '@tiptap/core';
import DOMPurify from 'dompurify';
import { CROSS_REF_RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import { cn } from '@/lib/utils';
import { MethodologyRichEditor } from '@/components/MethodologyRichEditor';
import { LAZY_RICH_FIELD_EXTENSIONS } from './lazyRichFieldExtensions';
import { useReferenceData, type RefSnapshot } from '@/lib/referenceData';
import { resolveReferenceJson } from '@/lib/resolveReferenceJson';
import { capabilitiesOfExtensions, registerFieldCapabilities, unregisterFieldCapabilities } from '@/lib/fieldCapabilities';
import { collapseToSingleLineHtml } from '@/lib/richTextUpgrade';

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
  /**
   * Grey italic hint shown inside the field while it holds no content, in
   * both the static and the mounted state. Never written to the document.
   */
  placeholder?: string;
  /**
   * Title behaviour: Enter never opens a new paragraph and pasted multi-line
   * content is flattened, so the stored HTML always holds one line.
   */
  singleLine?: boolean;
  /** Mount the editor immediately (click-to-edit surfaces). */
  autoFocus?: boolean;
}


/**
 * Render stored HTML through the TipTap schema, resolving every cross
 * reference against live proposal data, then sanitise.
 *
 * Resolution happens on the intermediate JSON, so the number AND the colour
 * of each badge come from the id whenever it resolves; stored text is only a
 * fallback for ids that no longer exist.
 */
function renderStatic(
  html: string,
  extensions: Extensions,
  refData: RefSnapshot | undefined,
): string {
  if (!html || !html.trim()) return '';
  try {
    const json = resolveReferenceJson(generateJSON(html, extensions), refData);
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
  staticExtensions = LAZY_RICH_FIELD_EXTENSIONS,
  placeholder,
  singleLine = false,
  autoFocus = false,
}: LazyRichFieldProps) {

  const [mounted, setMounted] = useState(false);
  const clickCoordsRef = useRef<{ left: number; top: number } | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One shared fetch per proposal: React Query dedupes the
  // ['reference-data', proposalId] key, so all fields on the page read the
  // same snapshot and a single network request serves them all.
  const { data: refData } = useReferenceData(proposalId);

  const staticHtml = useMemo(
    () => (mounted ? '' : renderStatic(value, staticExtensions, refData)),
    [value, mounted, staticExtensions, refData],
  );

  // Reference resolution must NEVER run against the live document while the
  // user types. Resolution rewrites markup (labels, colours, sanitiser
  // normalisation), so a resolved string computed from the value the editor
  // itself just emitted differs from the editor's own HTML — the shared
  // editor hook would then treat it as an external change and `setContent`,
  // destroying the selection on every keystroke.
  //
  // So: resolve ONCE, at mount time, and hand that frozen string to the
  // editor. While mounted the editor owns its content; resolution resumes on
  // unmount, when the static render recomputes from fresh data.
  const mountedContentRef = useRef<string>('');
  const resolvedValue = mounted ? mountedContentRef.current : value;

  const valueRef = useRef(resolvedValue);
  valueRef.current = resolvedValue;




  useEffect(() => () => {
    if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
  }, []);

  // Title fields flatten whatever the editor produces, so a paste can never
  // leave a second paragraph behind in a one-line field.
  const emitChange = useCallback(
    (html: string) => onChange(singleLine ? collapseToSingleLineHtml(html) : html),
    [onChange, singleLine],
  );

  const unmountEditor = useCallback(() => {
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed) {
      const html = editor.getHTML();
      if (html !== valueRef.current) emitChange(html);
    }
    editorRef.current = null;
    setMounted(false);
    onBlur?.();
  }, [emitChange, onBlur]);


  // What this field's own schema allows. The mounted instance is created by
  // the shared editor hook (full schema), so the capabilities of the field's
  // definition are registered against the instance for the toolbar to read.
  const capabilities = useMemo(
    () => capabilitiesOfExtensions(staticExtensions),
    [staticExtensions],
  );

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      registerFieldCapabilities(editor, capabilities);
      editor.on('destroy', () => unregisterFieldCapabilities(editor));
      const dom = editor.view.dom as HTMLElement;

      // Single-line fields swallow Enter entirely (capture phase, so neither
      // ProseMirror nor any parent list/table keymap sees it).
      if (singleLine) {
        const blockEnter = (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
          }
        };
        dom.addEventListener('keydown', blockEnter, true);
        editor.on('destroy', () => dom.removeEventListener('keydown', blockEnter, true));
      }




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
    [capabilities, shouldStayMounted, unmountEditor, singleLine],
  );

  const activate = useCallback(
    (coords: { left: number; top: number } | null) => {
      if (disabled || mounted) return;
      clickCoordsRef.current = coords;
      // Freeze the resolved markup the editor will start from, so focusing a
      // field still shows live numbers and colours without re-resolving mid-typing.
      mountedContentRef.current = renderStatic(value, staticExtensions, refData);
      setMounted(true);
      onFocus?.();
    },
    [disabled, mounted, onFocus, value, staticExtensions, refData],
  );

  // Click-to-edit surfaces render the field only once the user asked to edit,
  // so it mounts its editor straight away.
  const activateRef = useRef(activate);
  activateRef.current = activate;
  useEffect(() => {
    if (autoFocus) activateRef.current(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);




  return (
    <div className={cn('relative', className)}>
      {prefix && (
        // `relative z-10`: the static render sits in a POSITIONED wrapper
        // (added with the placeholder), and positioned boxes paint above
        // floats — without its own stacking the badge was painted over by
        // the field's opaque background. `ml-2.5 mt-1.5` mirrors the field
        // box's own `px-2.5 py-1.5`, so the badge is inset from the border
        // and sits on the first line of text.
        <span
          className="relative z-10 float-left ml-2.5 mt-1.5 mr-1 select-none leading-5"
          contentEditable={false}
          data-participant-prefix="1"
        >
          {prefix}
        </span>
      )}

      {mounted ? (
        <MethodologyRichEditor
          proposalId={proposalId}
          value={resolvedValue}
          onChange={emitChange}
          canEdit={!disabled}
          isCoordinator={false}
          minHeight={minHeight}
          onEditorReady={handleEditorReady}
          placeholder={placeholder}
        />

      ) : (
        <div className="relative">
          {placeholder && !staticHtml.trim() && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1.5 select-none text-sm italic text-muted-foreground"
            >
              {placeholder}
            </span>
          )}
          <div
            role="textbox"
            tabIndex={disabled ? -1 : 0}
            aria-readonly={disabled}
            className={cn(
              'document-content rounded-md border border-border bg-background px-2.5 py-1.5 text-sm',
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
        </div>
      )}
    </div>
  );
}

export default LazyRichField;
