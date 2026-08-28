/**
 * TRACKED CHANGES — THE ONE RESOLUTION PATH
 *
 * Accept and reject are offered in two places: the hover tooltip over the mark
 * itself, and the review tab of the right-hand panel. Both routes call the
 * helpers below, so they behave identically — the change is applied through the
 * owning TipTap editor, whose ordinary update path writes through the field's
 * versioned save (conflict rejection and the lost-text dialog still apply).
 *
 * A field that is not focused renders static HTML, so there is no editor to
 * command. `resolveChangeAtElement` hydrates the field first by clicking it,
 * waits for the editor to register itself, and only then applies the change.
 */
import type { Editor } from '@tiptap/core';
import { toast } from 'sonner';
import { findEditorForNode, waitForEditorAt } from '@/lib/trackChangeEditorRegistry';

export type ResolveAction = 'accept' | 'reject';

/** Apply one change through a live editor. Returns true when it was applied. */
export function resolveChangeInEditor(
  editor: Editor | null | undefined,
  changeId: string,
  action: ResolveAction,
): boolean {
  if (!editor || editor.isDestroyed || !changeId) return false;
  const ok =
    action === 'accept'
      ? editor.commands.acceptChange(changeId)
      : editor.commands.rejectChange(changeId);
  if (!ok) toast.error('That change could not be resolved.');
  return ok;
}

/** Apply every change in `changeIds`, in document order, through one editor. */
export function resolveChangesInEditor(
  editor: Editor | null | undefined,
  changeIds: string[],
  action: ResolveAction,
): number {
  if (!editor || editor.isDestroyed) return 0;
  let applied = 0;
  // Ids are resolved one at a time: each command remaps the document, and the
  // extension recollects its own change list afterwards.
  for (const id of changeIds) {
    const ok =
      action === 'accept'
        ? editor.commands.acceptChange(id)
        : editor.commands.rejectChange(id);
    if (ok) applied += 1;
  }
  if (applied === 0 && changeIds.length > 0) {
    toast.error('Those changes could not be resolved.');
  }
  return applied;
}

/**
 * Apply one change starting from the DOM node carrying the mark, hydrating a
 * static field when needed. `point` is where to click to hydrate.
 */
export async function resolveChangeAtElement(
  el: HTMLElement,
  changeId: string,
  action: ResolveAction,
  point: { x: number; y: number },
): Promise<boolean> {
  if (!changeId) return false;
  let editor = findEditorForNode(el);
  if (!editor) {
    const opts = { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y };
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    editor = await waitForEditorAt(el, point);
  }
  if (!editor || editor.isDestroyed) {
    toast.error('Open the field first, then accept or reject the change.');
    return false;
  }
  return resolveChangeInEditor(editor, changeId, action);
}
