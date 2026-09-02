import { useCallback, useEffect, useState } from 'react';

/**
 * Per-user collapse state for the lump sum personnel cost lines.
 *
 * A pure view preference: it is keyed by user id AND proposal id, lives only in
 * localStorage, and never touches data, totals or exports.
 */
export const lumpSumCollapseKey = (userId: string | null | undefined, proposalId: string) =>
  `ls-personnel-collapse:${userId ?? 'anon'}:${proposalId}`;

/** A.1 open, everything else closed, until the user says otherwise. */
export const DEFAULT_LUMP_SUM_COLLAPSE: Record<string, boolean> = {
  'A.1': false,
  'A.2': true,
  'A.3': true,
  'A.4': true,
};

function read(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...DEFAULT_LUMP_SUM_COLLAPSE };
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...DEFAULT_LUMP_SUM_COLLAPSE, ...parsed };
  } catch {
    return { ...DEFAULT_LUMP_SUM_COLLAPSE };
  }
}

export function useLumpSumCollapse(userId: string | null | undefined, proposalId: string) {
  const key = lumpSumCollapseKey(userId, proposalId);
  const [state, setState] = useState<Record<string, boolean>>(() => read(key));

  // The user id arrives after the first render, so re-read when the key changes.
  useEffect(() => {
    setState(read(key));
  }, [key]);

  const toggle = useCallback(
    (line: string) => {
      setState((current) => {
        const next = { ...current, [line]: !(current[line] ?? true) };
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* preference only — a full quota is not an error worth surfacing */
        }
        return next;
      });
    },
    [key],
  );

  const isCollapsed = useCallback(
    (line: string) => state[line] ?? DEFAULT_LUMP_SUM_COLLAPSE[line] ?? true,
    [state],
  );

  return { isCollapsed, toggle };
}
