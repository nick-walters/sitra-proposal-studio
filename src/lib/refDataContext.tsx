/**
 * Shares ONE live `RefSnapshot` with every read-only mirror in a subtree.
 *
 * Mirrors render stored HTML outside a TipTap editor, so they cannot rely on
 * the node `renderHTML` to resolve chips. They call `renderRefBadges(html,
 * snapshot)` instead — and the snapshot must be fetched once per surface, not
 * once per cell. Wrap the mirror root in `RefDataProvider` and read the
 * snapshot with `useRefSnapshot()` in the leaf renderers.
 *
 * Outside a provider (e.g. a mirror mounted into the export container, where
 * the export pass resolves the whole container in one go) the hook returns
 * `undefined` and `renderRefBadges` falls back to the stored labels.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useReferenceData, type RefSnapshot } from '@/lib/referenceData';

const RefDataContext = createContext<RefSnapshot | undefined>(undefined);

export function RefDataProvider({
  proposalId,
  children,
}: {
  proposalId: string | undefined;
  children: ReactNode;
}) {
  const { data } = useReferenceData(proposalId);
  return <RefDataContext.Provider value={data}>{children}</RefDataContext.Provider>;
}

/** The live reference snapshot, or `undefined` when it has not loaded yet. */
export function useRefSnapshot(): RefSnapshot | undefined {
  return useContext(RefDataContext);
}
