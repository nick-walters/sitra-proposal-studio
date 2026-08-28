/**
 * RESOLVING A TRACKED CHANGE — ONE PATH FOR EVERY ROUTE
 *
 * The hover tooltip and the review panel must behave identically, so both
 * funnel through here. Resolution always happens through the field's own
 * TipTap instance, which means the field's normal autosave carries it to the
 * database — the versioned save, with its conflict rejection, still applies.
 * Nothing here writes to the database directly.
 */
import type { Editor } from '@tiptap/react';
import { findEditorForNode, waitForEditorAt } from '@/lib/trackChangeEditorRegistry';

export type TrackAction = 'accept' | 'reject';

/** Resolve ONE change in an already-mounted editor. */
export function resolveChangeInEditor(
  editor: Editor | null | undefined,
  changeId: string,
  action: TrackAction,
): boolean {
  if (!editor || editor.isDestroyed || !changeId) return false;
  return action === 'accept'
    ? editor.commands.acceptChange(changeId)
    : editor.commands.rejectChange(changeId);
}

/** Resolve EVERY change in an already-mounted editor (that field only). */
export function resolveAllChangesInEditor(
  editor: Editor | null | undefined,
  action: TrackAction,
): boolean {
  if (!editor || editor.isDestroyed) return false;
  return action === 'accept'
    ? editor.commands.acceptAllChanges()
    : editor.commands.rejectAllChanges();
}

/**
 * Resolve a change from its DOM node. A lazy field that is not focused has no
 * editor yet, so it is asked to hydrate first (a synthetic click at the mark)
 * and the change is then applied through the editor that appears.
 */
export async function resolveChangeAtElement(
  el: HTMLElement,
  changeId: string,
  action: TrackAction,
  point: { x: number; y: number },
): Promise<'ok' | 'no-editor' | 'failed'> {
  let editor = findEditorForNode(el);
  if (!editor) {
    const opts = { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y };
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    editor = await waitForEditorAt(el, point);
  }
  if (!editor || editor.isDestroyed) return 'no-editor';
  // The host field ignores content changes until the box has been focused
  // (mount-time normalisation must never write). Resolving from the tooltip
  // never focuses the box, so the accepted change stayed on screen and was
  // lost on reload. Focus first, then resolve — the field's autosave follows.
  if (!editor.isFocused) {
    editor.commands.focus();
    await new Promise((r) => setTimeout(r, 0));
    if (editor.isDestroyed) return 'no-editor';
  }
  return resolveChangeInEditor(editor, changeId, action) ? 'ok' : 'failed';

}

/**
 * WHO MAY RESOLVE WHAT
 *
 * Anyone who may edit the proposal may accept or reject ANY tracked change,
 * whoever authored it. A partner often knows a passage better than the
 * coordinator does, so review is not reserved to the coordinator. Viewers
 * (and users with no role) may resolve nothing.
 */
export function trackChangePermissions(opts: {
  roleTier?: string | null;
  userId?: string | null;
  authorId?: string | null;
}) {
  const canEdit = opts.roleTier === 'coordinator' || opts.roleTier === 'editor';
  return {
    canAccept: canEdit,
    canReject: canEdit,
    canEdit,
    /** Retained for callers that gate coordinator-only UI elsewhere. */
    isCoordinator: opts.roleTier === 'coordinator',
  };
}
