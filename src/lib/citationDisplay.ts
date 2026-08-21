/**
 * The display-number channel for citations rendered INSIDE a TipTap editor.
 *
 * A citation is stored as `<sup data-citation="K">`, where K is the stable
 * internal `ref_key` — never the number a reader sees. The reader's number is
 * derived (see `citationNumbering.ts`) and changes whenever a citation is
 * added, removed, hidden or reordered elsewhere in the proposal.
 *
 * Editors cannot look that up per node: the node view is synchronous, has no
 * access to React context, and is re-created on every re-render. So the
 * numbering pass publishes ONE map here and the node view reads from it and
 * subscribes for changes. That replaces the MutationObserver that used to
 * rewrite the editor DOM from outside — same visible result, but the number
 * now comes from the numbering module instead of being patched over the top.
 *
 * The map is module-global because the app edits one proposal at a time (the
 * route is `/proposal/:id`). `publishCitationDisplayMap` is therefore
 * last-writer-wins; callers pass the map for the proposal on screen.
 *
 * Unresolved ids fall back to the internal id, so a citation is never blank.
 */

let currentMap: ReadonlyMap<number, number> = new Map();
const listeners = new Set<() => void>();

/** Publishes the proposal-wide map; notifies every mounted citation node. */
export function publishCitationDisplayMap(map: ReadonlyMap<number, number> | undefined): void {
  const next = map ?? new Map<number, number>();
  if (next === currentMap) return;
  if (next.size === currentMap.size) {
    let identical = true;
    for (const [k, v] of next) {
      if (currentMap.get(k) !== v) {
        identical = false;
        break;
      }
    }
    if (identical) return;
  }
  currentMap = next;
  listeners.forEach((fn) => fn());
}

/** The current map — for callers that need the whole thing (footnote lists). */
export function getCitationDisplayMap(): ReadonlyMap<number, number> {
  return currentMap;
}

/** Display number for an internal `ref_key`, or the id itself when unknown. */
export function citationDisplayNumber(refKey: number): number {
  return currentMap.get(refKey) ?? refKey;
}

/** Subscribes to map changes. Returns the unsubscribe function. */
export function subscribeCitationDisplay(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
