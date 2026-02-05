import { useMemo } from 'react';
import type { ParticipantSummary } from '@/types/proposal';
import type { WPDraftTask } from '@/hooks/useWPDrafts';

interface ParticipantWithRate extends ParticipantSummary {
  personnel_cost_rate?: number | null;
}

interface EffortBudgetSummary {
  participantId: string;
  participantName: string;
  totalPersonMonths: number;
  costRate: number;
  calculatedCost: number;
}

interface UseEffortToBudgetResult {
  summaryByParticipant: EffortBudgetSummary[];
  totalPersonMonths: number;
  totalPersonnelCost: number;
}

const DEFAULT_COST_RATE = 5000; // EUR per person-month

/**
 * Hook to calculate personnel budget from effort matrix data
 */
export function useEffortToBudget(
  allTasks: WPDraftTask[],
  participants: ParticipantWithRate[]
): UseEffortToBudgetResult {
  return useMemo(() => {
    // Aggregate person-months by participant across all tasks
    const effortByParticipant = new Map<string, number>();
    
    allTasks.forEach(task => {
      if (task.effort) {
        task.effort.forEach(e => {
          const current = effortByParticipant.get(e.participant_id) || 0;
          effortByParticipant.set(e.participant_id, current + (e.person_months || 0));
        });
      }
    });

    // Build summary with cost calculations
    const summaryByParticipant: EffortBudgetSummary[] = participants.map(p => {
      const totalPersonMonths = effortByParticipant.get(p.id) || 0;
      const costRate = p.personnel_cost_rate || DEFAULT_COST_RATE;
      const calculatedCost = totalPersonMonths * costRate;

      return {
        participantId: p.id,
        participantName: p.organisation_short_name || p.organisation_name,
        totalPersonMonths,
        costRate,
        calculatedCost,
      };
    });

    const totalPersonMonths = summaryByParticipant.reduce((sum, s) => sum + s.totalPersonMonths, 0);
    const totalPersonnelCost = summaryByParticipant.reduce((sum, s) => sum + s.calculatedCost, 0);

    return {
      summaryByParticipant,
      totalPersonMonths,
      totalPersonnelCost,
    };
  }, [allTasks, participants]);
}

/**
 * Calculate personnel cost for a single participant
 */
export function calculatePersonnelCost(
  personMonths: number,
  costRate: number = DEFAULT_COST_RATE
): number {
  return personMonths * costRate;
}
