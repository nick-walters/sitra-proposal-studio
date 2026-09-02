import { useCallback, useEffect, useReducer } from 'react';

/**
 * Per-user collapse state for the whole lump sum budget panel.
 *
 * ONE key holds every collapse flag for the feature — major headings, cost
 * lines, the C.2 / C.3 parents and the depreciation register — because three
 * separate keys written by four components meant each component's write wiped
 * the others' entries.
 *
 * A pure view preference: keyed by user id AND proposal id, lives only in
 * localStorage, and never touches data, totals or exports.
 */
export const lumpSumCollapseKey = (userId: string | null | undefined, proposalId: string) =>
  `ls-collapse:${userId ?? 'anon'}:${proposalId}`;

/** Namespaced ids keep the flat stored object readable and collision-free. */
export const majorId = (key: string) => `major:${key}`;
export const lineId = (key: string) => `line:${key}`;
export const parentId = (key: string) => `parent:${key}`;
export const DEPRECIATION_COLLAPSE_ID = 'depreciation';

type CollapseState = Record<string, boolean>;

/** Anything that is not a boolean map is stale or corrupt — start clean. */
function sanitize(value: unknown): CollapseState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: CollapseState = {};
  for (const [id, flag] of Object.entries(value as Record<string, unknown>)) {
    if (typeof flag === 'boolean') next[id] = flag;
  }
  return next;
}

/**
 * A module-level cache shared by every component instance, so a toggle in one
 * component is visible to the others without a reload, and every write merges
 * into the latest stored value rather than replacing it.
 */
const cache = new Map<string, CollapseState>();
const listeners = new Set<() => void>();

function load(key: string): CollapseState {
  const cached = cache.get(key);
  if (cached) return cached;
  let state: CollapseState = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) state = sanitize(JSON.parse(raw));
  } catch {
    state = {};
  }
  cache.set(key, state);
  return state;
}

function store(key: string, id: string, collapsed: boolean) {
  const next = { ...load(key), [id]: collapsed };
  cache.set(key, next);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* preference only — a full quota is not an error worth surfacing */
  }
  listeners.forEach(listener => listener());
}

export function useLumpSumCollapse(userId: string | null | undefined, proposalId: string) {
  const key = lumpSumCollapseKey(userId, proposalId);
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  const state = load(key);

  /** Collapsed is the default: a first-time user sees everything closed. */
  const isCollapsed = useCallback((id: string) => state[id] ?? true, [state]);
  const toggle = useCallback((id: string) => store(key, id, !(load(key)[id] ?? true)), [key]);

  return { isCollapsed, toggle };
}
