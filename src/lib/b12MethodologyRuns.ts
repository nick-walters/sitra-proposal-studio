/**
 * Shared run-splitting logic for the B1.2 methodologies mirror.
 *
 * The Methodologies card holds an ordered list of methodology_items which
 * interleaves real methodology rows with case-type placeholders. In B1.2 the
 * cases tables are real document nodes, so the mirror is split into a SEQUENCE
 * of slots: one per RUN of consecutive methodology items, with the placeholders
 * acting as the split points (and being discarded themselves).
 *
 * runCount === placeholderCount + 1, always. Leading/trailing placeholders
 * therefore produce empty runs, which still exist so the cases tables have a
 * position to sit in.
 *
 * Both the reconciler and the slot content component MUST use these helpers so
 * they can never disagree about the run boundaries.
 */

export const METHODOLOGY_PLACEHOLDER_KIND = 'case_placeholder';

export interface RunSplittableItem {
  kind: string;
}

/** Splits the ordered item list into runs at every case placeholder. */
export function splitMethodologyRuns<T extends RunSplittableItem>(items: T[]): T[][] {
  const runs: T[][] = [[]];
  for (const item of items) {
    if (item.kind === METHODOLOGY_PLACEHOLDER_KIND) {
      runs.push([]);
    } else if (item.kind === 'methodology') {
      runs[runs.length - 1].push(item);
    }
  }
  return runs;
}

/**
 * Same split as `splitMethodologyRuns`, but each run also carries the
 * placeholder item that FOLLOWS it (the split point), so callers can render
 * the placeholder's derived heading and description directly after the run.
 * The final run always has `placeholder: null`.
 */
export function splitMethodologyRunsWithPlaceholder<T extends RunSplittableItem>(
  items: T[],
): { items: T[]; placeholder: T | null }[] {
  const runs: { items: T[]; placeholder: T | null }[] = [{ items: [], placeholder: null }];
  for (const item of items) {
    if (item.kind === METHODOLOGY_PLACEHOLDER_KIND) {
      runs[runs.length - 1].placeholder = item;
      runs.push({ items: [], placeholder: null });
    } else if (item.kind === 'methodology') {
      runs[runs.length - 1].items.push(item);
    }
  }
  return runs;
}

/** Required number of methodologies slots for the given ordered item list. */
export function methodologyRunCount(items: RunSplittableItem[]): number {
  return items.filter((i) => i.kind === METHODOLOGY_PLACEHOLDER_KIND).length + 1;
}

