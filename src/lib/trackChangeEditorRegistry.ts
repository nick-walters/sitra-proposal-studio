/**
 * TRACKED CHANGES — LIVE EDITOR REGISTRY
 *
 * The hover tooltip is DOM-based: it fires over static HTML as well as over a
 * mounted TipTap instance. To resolve a change in place it needs the editor
 * that owns the hovered node, so every mounted editor registers itself here.
 *
 * Lazy fields render static HTML until they are focused, so a caller may have
 * to hydrate the field first — see `waitForEditorAt`.
 */
import type { Editor } from '@tiptap/core';

const liveEditors = new Set<Editor>();

export function registerTrackEditor(editor: Editor): () => void {
  liveEditors.add(editor);
  return () => {
    liveEditors.delete(editor);
  };
}

/** The mounted editor whose DOM contains `node`, if any. */
export function findEditorForNode(node: Node | null): Editor | null {
  if (!node) return null;
  for (const editor of liveEditors) {
    if (editor.isDestroyed) {
      liveEditors.delete(editor);
      continue;
    }
    const dom = editor.view?.dom as HTMLElement | undefined;
    if (dom && (dom === node || dom.contains(node))) return editor;
  }
  return null;
}

/** Does this document position sit inside a live editor already? */
export function hasLiveEditorAt(node: Node | null): boolean {
  return findEditorForNode(node) !== null;
}

/**
 * Poll for the editor that owns `node` (or the element that replaced it at
 * the same coordinates) after a lazy field has been asked to hydrate.
 */
export async function waitForEditorAt(
  node: Node | null,
  point: { x: number; y: number },
  timeoutMs = 2000,
): Promise<Editor | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const direct = findEditorForNode(node);
    if (direct) return direct;
    const atPoint = document.elementFromPoint(point.x, point.y);
    const found = findEditorForNode(atPoint);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 60));
  }
  return null;
}
