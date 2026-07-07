import { useCallback, useRef } from 'react';
import type { Editor, ChainedCommands } from '@tiptap/react';
import { getFocusedCanvasEditor } from '@/lib/impactCanvasFocusedEditor';

/**
 * Shared selection-preservation for canvas-text-toolbar controls whose
 * activation opens a nested Radix popover/dropdown/select (font size,
 * font colour, …).
 *
 * Opening any such nested control moves focus into the portal, which
 * blurs the TipTap editor and — without this — collapses the selection
 * before the command runs. To prevent that, every participating control
 * MUST spread:
 *
 *  - `triggerProps` on its trigger element — snapshots the focused
 *    editor + its selection range on mousedown, and preventDefaults so
 *    the editor keeps its native focus.
 *  - `portalProps` on the portalled content (`PopoverContent`,
 *    `SelectContent`, `DropdownMenuContent`, …) — tags the portal as
 *    canvas-toolbar UI (so the editor's blur handler ignores focus
 *    moving into it), blocks Radix auto-focus, and preventDefaults
 *    stray mousedowns inside the portal so interacting with it doesn't
 *    steal focus either.
 *
 * When the control commits a value, call `apply((chain) => chain.…)` —
 * it re-focuses the preserved editor, restores the saved selection
 * range, and runs the chain, so the mark lands on the original run.
 *
 * A NEW control opts in by spreading `triggerProps` on its trigger,
 * `portalProps` on its content, and calling `apply(...)` from its
 * commit handler. No per-control patching required.
 */
export function useCanvasSelectionPreservation() {
  const editorRef = useRef<Editor | null>(null);
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);

  const capture = useCallback(() => {
    const ed = getFocusedCanvasEditor() ?? editorRef.current;
    if (!ed) return;
    editorRef.current = ed;
    const { from, to } = ed.state.selection;
    savedRangeRef.current = { from, to };
  }, []);

  const apply = useCallback(
    (fn: (chain: ChainedCommands) => ChainedCommands) => {
      const ed = editorRef.current ?? getFocusedCanvasEditor();
      if (!ed) return;
      const chain = ed.chain().focus();
      const sel = savedRangeRef.current;
      if (sel) chain.setTextSelection(sel);
      fn(chain).run();
    },
    []
  );

  const rememberEditor = useCallback((ed: Editor | null) => {
    if (ed) editorRef.current = ed;
  }, []);

  const triggerProps = {
    onMouseDown: (e: React.MouseEvent) => {
      // Preserve editor's native focus AND snapshot the selection
      // before the portal opens and steals focus.
      e.preventDefault();
      capture();
    },
  } as const;

  // Typed loosely so it spreads onto Radix portal content components
  // (PopoverContent / SelectContent / DropdownMenuContent, …) whose
  // prop unions differ. Any unknown handlers Radix ignores.
  const portalProps: Record<string, unknown> = {
    // Editors' blur handlers ignore focus moves into this portal.
    'data-impact-canvas-toolbar': true,
    // Radix defaults would focus the portalled content on open/close;
    // that blurs the editor and clears the selection.
    onOpenAutoFocus: (e: Event) => e.preventDefault(),
    onCloseAutoFocus: (e: Event) => e.preventDefault(),
    // Clicks inside the portal (background, labels, non-input surfaces)
    // must not steal focus from the editor either.
    onMouseDown: (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
    },
  };

  return { capture, apply, rememberEditor, triggerProps, portalProps };
}
