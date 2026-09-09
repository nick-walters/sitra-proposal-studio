/**
 * The display channel for case cross-reference badges rendered INSIDE a
 * TipTap editor.
 *
 * A case badge stores its label ingredients — number, short name, colour and
 * the two "include number" / "include abbreviation" switches — as attributes
 * baked in at INSERTION time. Those switches live on the case TYPE and can be
 * changed long afterwards, at which point every badge already in the document
 * is stale. The read-only mirrors and the Typst PDF re-resolve each badge
 * against the database and are therefore correct; only the editor, which
 * renders straight from the stored attributes, disagrees.
 *
 * Editors cannot look that up per node: the node view is synchronous, has no
 * access to React context, and is re-created on every re-render. So the
 * reference-data fetch publishes ONE map here and each badge node view reads
 * from it and subscribes for changes. Nothing is written back into the
 * document — stored markup keeps whatever it was inserted with.
 *
 * The map is module-global because the app edits one proposal at a time (the
 * route is `/proposal/:id`). `publishCaseDisplayMap` is therefore
 * last-writer-wins; callers pass the map for the proposal on screen.
 *
 * A case whose type row could not be resolved is intentionally absent from the
 * map, so its badge falls back to its stored attributes rather than being told
 * "numbers and abbreviation on" by a default.
 */

export interface CaseDisplayEntry {
  number: number;
  shortName: string | null;
  color: string;
  caseType: string | null;
  includeNumber: boolean;
  includeAbbreviation: boolean;
}

let currentMap: ReadonlyMap<string, CaseDisplayEntry> = new Map();
const listeners = new Set<() => void>();

function sameEntry(a: CaseDisplayEntry, b: CaseDisplayEntry): boolean {
  return (
    a.number === b.number &&
    a.shortName === b.shortName &&
    a.color === b.color &&
    a.caseType === b.caseType &&
    a.includeNumber === b.includeNumber &&
    a.includeAbbreviation === b.includeAbbreviation
  );
}

/** Publishes the proposal-wide map; notifies every mounted case badge. */
export function publishCaseDisplayMap(
  map: ReadonlyMap<string, CaseDisplayEntry> | undefined,
): void {
  const next = map ?? new Map<string, CaseDisplayEntry>();
  if (next === currentMap) return;
  if (next.size === currentMap.size) {
    let identical = true;
    for (const [k, v] of next) {
      const cur = currentMap.get(k);
      if (!cur || !sameEntry(cur, v)) {
        identical = false;
        break;
      }
    }
    if (identical) return;
  }
  currentMap = next;
  listeners.forEach((fn) => fn());
}

/** Live display data for a case id, or undefined when unknown/unresolved. */
export function getCaseDisplayEntry(caseId: string): CaseDisplayEntry | undefined {
  return currentMap.get(caseId);
}

/** Subscribes to map changes. Returns the unsubscribe function. */
export function subscribeCaseDisplay(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
