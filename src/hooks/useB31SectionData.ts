import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchDerivedFigureNumbers, fetchB31SystemFigureNumbers } from '@/lib/figureNumbering';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { budgetSourceQueryKey, fetchBudgetSource, type B31JustificationItem as BudgetJustificationItem } from '@/lib/budgetSourceAdapter';

export interface B31Task {
  id: string;
  number: number;
  title: string | null;
  description: string | null;
  lead_participant_id: string | null;
  start_month: number | null;
  end_month: number | null;
  participants: { participant_id: string }[];
  effort?: { participant_id: string; person_months: number }[];
}

export interface B31WPData {
  id: string;
  number: number;
  title: string | null;
  short_name: string | null;
  lead_participant_id: string | null;
  color: string;
  objectives: string | null;
  description_before_tasks: string | null;
  
  manual_person_months: number | null;
  manual_duration: string | null;
  tasks: B31Task[];
  deliverables: {
    id: string;
    number: number;
    title: string | null;
    type: string | null;
    dissemination_level: string | null;
    responsible_participant_id: string | null;
    due_month: number | null;
    description: string | null;
  }[];
  wp_effort: { participant_id: string; person_months: number }[];
}

export interface B31Participant {
  id: string;
  organisation_name: string;
  organisation_short_name: string | null;
  participant_number: number | null;
  personnel_cost_rate: number | null;
}

export interface B31Figure {
  id: string;
  figure_number: string;
  figure_type: string;
  title: string;
  caption: string | null;
  content: any;
}

export interface B31JustificationItem extends BudgetJustificationItem {}

export interface B31SubcontractingParticipant {
  participantId: string;
  items: B31JustificationItem[];
  totalCost: number;
}

export interface B31EquipmentParticipant {
  participantId: string;
  items: B31JustificationItem[];
  totalCost: number;
  personnelCosts: number;
}

export function useB31SectionData(proposalId: string) {
  // Live source of truth: wp_drafts + wp_draft_tasks + wp_draft_deliverables.
  const wpQuery = useQuery({
    queryKey: ['b31-wp-data', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data: wps, error: wpErr } = await supabase
        .from('wp_drafts')
        .select(`
          id, number, title, short_name, lead_participant_id, color,
          objectives, description_before_tasks,
          manual_person_months, manual_duration,
           tasks:wp_draft_tasks(
             id, number, title, description, lead_participant_id, start_month, end_month, order_index,
             participants:wp_draft_task_participants(participant_id),
             effort:wp_draft_task_effort(participant_id, person_months)
           ),
           deliverables:wp_draft_deliverables(
             id, number, title, type, dissemination_level, responsible_participant_id, due_month, description, order_index
           )
         `)
        .eq('proposal_id', proposalId)
        .order('number');
      if (wpErr) throw wpErr;

      return (wps || []).map((wp: any) => ({
         ...wp,
         color: wp.color || DEFAULT_WP_COLORS[(wp.number - 1) % DEFAULT_WP_COLORS.length],
         tasks: (wp.tasks || []).slice().sort(
           (a: any, b: any) => (a.order_index ?? a.number) - (b.order_index ?? b.number),
         ),
         deliverables: (wp.deliverables || []).slice().sort(
           (a: any, b: any) => (a.order_index ?? a.number) - (b.order_index ?? b.number),
         ),
         wp_effort: [],
       })) as B31WPData[];
    },
  });

  const participantsQuery = useQuery({
    queryKey: ['b31-participants', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, organisation_name, organisation_short_name, participant_number, personnel_cost_rate')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      if (error) throw error;
      return data as B31Participant[];
    },
  });

  const figuresQuery = useQuery({
    queryKey: ['b31-figures', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('figures')
        .select('id, figure_type, title, caption, content')
        .eq('proposal_id', proposalId)
        .in('figure_type', ['pert', 'gantt']);
      if (error) throw error;
      // Figure numbers are DERIVED from the placing block (prompt 179); the
      // stored `figures.figure_number` column is dead and often blank.
      const numbers = await fetchDerivedFigureNumbers(proposalId);
      // Pert and Gantt are source-fed blocks, not `card_figure` placements, so
      // they have no derived placement number of their own.
      const system = await fetchB31SystemFigureNumbers(proposalId);
      return (data || []).map((f: any) => ({
        ...f,
        figure_number:
          numbers.get(f.id) ??
          (f.figure_type === 'pert' ? system.pert : f.figure_type === 'gantt' ? system.gantt : ''),
      })) as B31Figure[];
    },
  });

  const budgetSourceQuery = useQuery({
    queryKey: budgetSourceQueryKey(proposalId),
    enabled: !!proposalId,
    queryFn: () => fetchBudgetSource(proposalId),
  });

  const pertFigure = figuresQuery.data?.find(f => f.figure_type === 'pert') || null;
  const ganttFigure = figuresQuery.data?.find(f => f.figure_type === 'gantt') || null;

  const source = budgetSourceQuery.data;
  const subcontractingByParticipant = source?.categories.subcontracting ?? [];
  // Lump-sum mirroring has already been resolved by budgetSourceAdapter. Keep
  // the legacy threshold filter for traditional proposals unchanged.
  const equipmentByParticipant: B31EquipmentParticipant[] = (source?.categories.equipment ?? [])
    .filter((entry) => source?.isLumpSum || source?.presence.equipmentAboveThreshold)
    .map((entry) => ({
      ...entry,
      personnelCosts: source?.personnelCosts[entry.participantId] ?? 0,
    }));
  const travelByParticipant = source?.categories.travel ?? [];
  const otherGoodsByParticipant = source?.categories.other_goods ?? [];

  return {
    wpData: (wpQuery.data || []).map((wp) => ({
      ...wp,
      wp_effort: budgetSourceQuery.data?.effortByWp[wp.id] ?? [],
    })),
    participants: participantsQuery.data || [],
    pertFigure,
    ganttFigure,
    subcontractingByParticipant,
    equipmentByParticipant: source?.isLumpSum
      ? equipmentByParticipant
      : equipmentByParticipant.filter(
        (entry) => (source?.personnelCosts[entry.participantId] ?? 0) > 0 &&
          entry.totalCost > (source?.personnelCosts[entry.participantId] ?? 0) * 0.15,
      ),
    travelByParticipant,
    otherGoodsByParticipant,
    loading: wpQuery.isLoading || participantsQuery.isLoading || figuresQuery.isLoading || budgetSourceQuery.isLoading,
  };
}
