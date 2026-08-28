/**
 * TRACKED CHANGES — ONE RESOLUTION PATH
 *
 * Accepting and rejecting a change happens from two places: the hover tooltip
 * over the mark itself, and the tracked-changes tab of the right-hand panel.
 * Both call into this module, so both behave identically:
 *
 *   - the change is applied THROUGH the TipTap editor that owns the field, so
 *     the field's normal debounce-and-save path runs and the write goes out
 *     with its loaded version — a conflicting write is still rejected and the
 *     lost-text dialog still appears;
 *   - a field that is not focused has no mounted editor, so it is asked to
 *     hydrate first and the change is applied once it is live.
 */
import type { Editor } from '@tiptap/core';
import { findEditorForNode, waitForEditorAt } from '@/lib/trackChangeEditorRegistry';

export type ResolveAction = 'accept' | 'reject';

/** Apply one change on an editor that is already mounted. */
export function resolveChangeOnEditor(
  editor: Editor | null,
  changeId: string,
  action: ResolveAction,
): boolean {
  if (!editor || editor.isDestroyed || !changeId) return false;
  return action === 'accept'
    ? editor.commands.acceptChange(changeId)
    : editor.commands.rejectChange(changeId);
}

/** Apply every change in one field. Never crosses into another field. */
export function resolveAllChangesOnEditor(
  editor: Editor | null,
  action: ResolveAction,
): boolean {
  if (!editor || editor.isDestroyed) return false;
  return action === 'accept'
    ? editor.commands.acceptAllChanges()
    : editor.commands.rejectAllChanges();
}

/**
 * Apply a change from a DOM node — the tooltip's route. A static, unfocused
 * field is clicked to make it hydrate, and the editor is awaited before the
 * command runs.
 */
export async function resolveChangeAtElement(
  el: HTMLElement,
  changeId: string,
  action: ResolveAction,
  point: { x: number; y: number },
): Promise<boolean> {
  let editor = findEditorForNode(el);
  if (!editor) {
    const opts = { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y };
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    editor = await waitForEditorAt(el, point);
  }
  return resolveChangeOnEditor(editor, changeId, action);
}
