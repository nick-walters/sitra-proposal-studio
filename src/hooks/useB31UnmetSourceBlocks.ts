import { useMemo } from 'react';
import { useB31SectionData } from '@/hooks/useB31SectionData';
import { useB31JustificationToggles } from '@/hooks/useB31JustificationToggles';
import { useB31CostPresence } from '@/hooks/useB31CostPresence';

/**
 * Which of B3.1's cost tables (3.1.g and 3.1.h) currently have no source data.
 *
 * These two tables are the only source-fed B3.1 blocks whose source can be
 * legitimately empty in a finished proposal, so they must read as "not
 * applicable" on the board rather than sitting there as ordinary blocks. The
 * rules below MIRROR `SourceFedBlock`'s emptiness checks exactly, so the badge
 * and the rendered explanation can never disagree.
 *
 * Nothing is stored: every input is a live query, so a table un-hides by
 * itself the moment its costs appear (and hides again if they are removed).
 */
export function useB31UnmetSourceBlocks(proposalId: string, enabled: boolean) {
  const { toggles, loading: togglesLoading } = useB31JustificationToggles(enabled ? proposalId : '');
  const presence = useB31CostPresence(enabled ? proposalId : '');
  const {
    subcontractingByParticipant,
    equipmentByParticipant,
    travelByParticipant,
    otherGoodsByParticipant,
    isLumpSum,
    loading,
  } = useB31SectionData(enabled ? proposalId : '');

  return useMemo(() => {
    const unmet = new Set<string>();
    if (!enabled || loading || togglesLoading || presence.loading) return unmet;

    if (subcontractingByParticipant.length === 0) unmet.add('b31.table_g');

    const c2ForcedOn = presence.equipmentAboveThreshold;
    // Lump-sum: travel and other goods follow the adapter's mirror settings,
    // which have already emptied these arrays when nothing is mirrored, so the
    // legacy b31_show_* booleans are bypassed. Nothing mirrored still yields
    // zero blocks and therefore the same "not applicable" outcome as before.
    const purchaseBlocks =
      ((isLumpSum || toggles.travel) && travelByParticipant.length > 0 ? 1 : 0) +
      ((c2ForcedOn || toggles.equipment) && equipmentByParticipant.length > 0 ? 1 : 0) +
      ((isLumpSum || toggles.other_goods) && otherGoodsByParticipant.length > 0 ? 1 : 0);
    if (purchaseBlocks === 0) unmet.add('b31.table_h');

    return unmet;
  }, [
    enabled,
    loading,
    togglesLoading,
    presence.loading,
    presence.equipmentAboveThreshold,
    isLumpSum,
    toggles.travel,
    toggles.equipment,
    toggles.other_goods,
    subcontractingByParticipant.length,
    travelByParticipant.length,
    equipmentByParticipant.length,
    otherGoodsByParticipant.length,
  ]);
}

/** Why a B3.1 cost table is currently left out, for the editor's badge. */
export function b31UnmetReason(sourceKey: string | null | undefined): string {
  return sourceKey === 'b31.table_g'
    ? 'There are no subcontracting costs in the budget.'
    : 'No purchase-cost justification is switched on with costs behind it.';
}
