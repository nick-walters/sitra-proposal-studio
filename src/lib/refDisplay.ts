/**
 * The display channel for task, deliverable, milestone, work-package,
 * participant and acronym cross-reference badges rendered INSIDE a TipTap
 * editor.
 *
 * Every badge bakes its label ingredients — numbers, short name, colour,
 * acronym segments — into attributes at INSERTION time. The underlying
 * numbering then changes: deliverables are reordered, a WP is renumbered, a
 * partner's short name is corrected. The read-only mirrors and the Typst PDF
 * re-resolve each badge against the database and are therefore correct; only
 * the editor, which draws straight from the stored attributes, disagrees.
 *
 * Editors cannot look that up per node: a node view is synchronous, has no
 * access to React context, and is re-created on every re-render. So the
 * reference-data fetch publishes one map PER TYPE here and each badge node
 * view reads from it and subscribes for changes. Nothing is written back into
 * the document — stored markup keeps whatever it was inserted with.
 *
 * Notification is scoped per type on purpose: a deliverable reorder must not
 * force every WP and participant badge in the document to redraw.
 *
 * The maps are module-global because the app edits one proposal at a time (the
 * route is `/proposal/:id`). `publishRefDisplayMap` is therefore
 * last-writer-wins; callers pass the maps for the proposal on screen.
 *
 * A row that could not be resolved is intentionally absent from its map, so
 * the badge falls back to its stored attributes rather than being handed a
 * wrong value or rendered blank.
 *
 * Cases and citations keep their own modules (`caseDisplay.ts`,
 * `citationDisplay.ts`); this registry does not absorb them.
 */

export type RefDisplayType =
  | 'task'
  | 'deliverable'
  | 'milestone'
  | 'wp'
  | 'participant'
  | 'acronym';

export interface RefDisplayEntry {
  /** The fully composed label, e.g. "T2.4", "D3.1", "WP4". */
  label: string;
  shortName: string | null;
  color: string | null;
  /** Acronym only: the segment texts, in order. */
  segments?: string[];
  /**
   * Acronym only: the colour of each segment, parallel to `segments`.
   * Kept beside `segments` because the acronym badge paints each letter run
   * separately and the colours are as live as the text.
   */
  segmentColors?: string[];
  /**
   * WP only: the live number, so the badge can recompose either label form
   * through `formatWPChipLabel` without parsing the composed label back.
   */
  number?: number | string | null;
}

type Registry = Map<string, RefDisplayEntry>;

const maps: Record<RefDisplayType, ReadonlyMap<string, RefDisplayEntry>> = {
  task: new Map(),
  deliverable: new Map(),
  milestone: new Map(),
  wp: new Map(),
  participant: new Map(),
  acronym: new Map(),
};

const listeners: Record<RefDisplayType, Set<() => void>> = {
  task: new Set(),
  deliverable: new Set(),
  milestone: new Set(),
  wp: new Set(),
  participant: new Set(),
  acronym: new Set(),
};

/**
 * Whether a map has EVER been published for a type.
 *
 * A badge whose id is absent from its map means one of two very different
 * things: the reference data has not arrived yet (first paint, or a slow
 * fetch), or the target row genuinely no longer exists. Only the second is a
 * broken cross-reference. Without this flag every badge would flash the broken
 * marker for the moment before the fetch resolves.
 *
 * Deliberately per type, matching the notification scoping: milestone data may
 * be loaded while participant data is still in flight.
 */
const published: Record<RefDisplayType, boolean> = {
  task: false,
  deliverable: false,
  milestone: false,
  wp: false,
  participant: false,
  acronym: false,
};


function sameStringList(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b) return !a?.length && !b?.length;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function sameEntry(a: RefDisplayEntry, b: RefDisplayEntry): boolean {
  return (
    a.label === b.label &&
    a.shortName === b.shortName &&
    a.color === b.color &&
    (a.number ?? null) === (b.number ?? null) &&
    sameStringList(a.segments, b.segments) &&
    sameStringList(a.segmentColors, b.segmentColors)
  );
}

/** Publishes one type's map; notifies only that type's mounted badges. */
export function publishRefDisplayMap(
  type: RefDisplayType,
  map: ReadonlyMap<string, RefDisplayEntry> | undefined,
): void {
  const next = map ?? (new Map() as Registry);
  const current = maps[type];
  // The very first publish flips the type from "not loaded" to "loaded", which
  // changes what an unresolved badge means, so it must notify even when the
  // map itself is unchanged.
  const firstPublish = !published[type];
  published[type] = true;
  if (next === current && !firstPublish) return;
  if (next.size === current.size && !firstPublish) {
    let identical = true;
    for (const [k, v] of next) {
      const cur = current.get(k);
      if (!cur || !sameEntry(cur, v)) {
        identical = false;
        break;
      }
    }
    if (identical) return;
  }
  maps[type] = next;
  listeners[type].forEach((fn) => fn());
}

/**
 * Whether reference data for this type has been published at least once.
 * Until it has, an unresolved badge means "not loaded yet", not "broken".
 */
export function hasPublishedRefDisplay(type: RefDisplayType): boolean {
  return published[type];
}

/** Live display data for one id of one type, or undefined when unresolved. */
export function getRefDisplayEntry(
  type: RefDisplayType,
  id: string | null | undefined,
): RefDisplayEntry | undefined {
  if (!id) return undefined;
  return maps[type].get(id);
}


/** Subscribes to one type's changes. Returns the unsubscribe function. */
export function subscribeRefDisplay(type: RefDisplayType, fn: () => void): () => void {
  listeners[type].add(fn);
  return () => {
    listeners[type].delete(fn);
  };
}

/**
 * The acronym badge has no target id — a proposal has exactly one acronym —
 * so its single entry is filed under this fixed key.
 */
export const ACRONYM_DISPLAY_KEY = 'acronym';
