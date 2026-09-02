import { useQuery } from '@tanstack/react-query';
import { budgetSourceQueryKey, fetchBudgetSource } from '@/lib/budgetSourceAdapter';

export interface B31CostPresence {
  subcontracting: boolean;
  travel: boolean;
  equipment: boolean;
  equipmentAboveThreshold: boolean;
  equipmentBelowThreshold: boolean;
  otherGoods: boolean;
  fstp: boolean;
  internallyInvoiced: boolean;
  loading: boolean;
}

/** Detects B3.1 cost-justification categories from the proposal's active budget source. */
export function useB31CostPresence(proposalId: string): B31CostPresence {
  const q = useQuery({
    queryKey: budgetSourceQueryKey(proposalId),
    enabled: !!proposalId,
    queryFn: () => fetchBudgetSource(proposalId),
  });

  return {
    subcontracting: !!q.data?.presence.subcontracting,
    travel: !!q.data?.presence.travel,
    equipment: !!q.data?.presence.equipment,
    equipmentAboveThreshold: !!q.data?.presence.equipmentAboveThreshold,
    equipmentBelowThreshold: !!q.data?.presence.equipmentBelowThreshold,
    otherGoods: !!q.data?.presence.otherGoods,
    fstp: !!q.data?.presence.fstp,
    internallyInvoiced: !!q.data?.presence.internallyInvoiced,
    loading: q.isLoading,
  };
}
