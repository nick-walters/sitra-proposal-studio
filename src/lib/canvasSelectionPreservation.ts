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
    // Only overwrite the saved range with a NEW range when the editor
    // still has a non-empty selection. After a mark command the PM
    // selection can end up collapsed even while the run still looks
    // highlighted; if we snapshotted that collapsed range, the next
    // apply() would target nothing and no consecutive size/colour
    // change would ever land. Keeping the previous non-empty range
    // means repeated changes on the same run stay valid.
    if (from !== to) {
      savedRangeRef.current = { from, to };
    }
  }, []);

  const apply = useCallback(
    (fn: (chain: ChainedCommands) => ChainedCommands) => {
      const ed = editorRef.current ?? getFocusedCanvasEditor();
      if (!ed) return;
      const chain = ed.chain().focus();
      const sel = savedRangeRef.current;
      if (sel) chain.setTextSelection(sel);
      fn(chain).run();
      // Re-assert the saved selection AFTER the command so the run
      // stays visually + logically selected. Some mark commands can
      // leave PM's selection collapsed; without this, the second
      // consecutive apply on the same run would find an empty range.
      if (sel && sel.from !== sel.to) {
        ed.chain().focus().setTextSelection(sel).run();
      }
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

  // Shared bits every portalled Radix content wants:
  //  - data-attribute so the editor's blur handler ignores focus moving
  //    into the portal.
  //  - onCloseAutoFocus prevented so focus doesn't jump on close.
  //  - mousedown guard so clicking the portal chrome (not inputs) doesn't
  //    steal focus from the editor.
  const sharedPortal = {
    'data-impact-canvas-toolbar': true,
    onCloseAutoFocus: (e: Event) => e.preventDefault(),
    onMouseDown: (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
    },
  };

  // Popover-flavoured portal (Radix Popover / DropdownMenu content).
  // Adds `onOpenAutoFocus` — supported by Popover/DropdownMenu, NOT by
  // Radix Select (Select ignores it and React warns "Unknown event
  // handler property `onOpenAutoFocus`").
  const portalProps: Record<string, unknown> = {
    ...sharedPortal,
    onOpenAutoFocus: (e: Event) => e.preventDefault(),
  };

  // Select-flavoured portal. Radix Select manages its own focus (moves
  // it to the selected item on open); we cannot cancel that via
  // onOpenAutoFocus. Instead the selection/focus is preserved by:
  //   1. `triggerProps` snapshotting editor + range on mousedown;
  //   2. the editor's blur handler ignoring the blur (data-attribute);
  //   3. `apply()` re-focusing the editor and restoring the range
  //      before running the command chain.
  const selectPortalProps: Record<string, unknown> = { ...sharedPortal };

  return { capture, apply, rememberEditor, triggerProps, portalProps, selectPortalProps };
}

