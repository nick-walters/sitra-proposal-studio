import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';

export interface B31WPData {
  id: string;
  number: number;
  title: string | null;
  short_name: string | null;
  lead_participant_id: string | null;
  color: string;
  objectives: string | null;
  description_before_tasks: string | null;
  methodology: string | null;
  manual_person_months: number | null;
  manual_duration: string | null;
  tasks: {
    id: string;
    number: number;
    title: string | null;
    description: string | null;
    lead_participant_id: string | null;
    start_month: number | null;
    end_month: number | null;
    effort: { participant_id: string; person_months: number }[];
    participants: { participant_id: string }[];
  }[];
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

export interface B31SubcontractingParticipant {
  participantId: string;
  items: { description: string; amount: number; justification: string }[];
  totalCost: number;
}

export interface B31EquipmentParticipant {
  participantId: string;
  items: { description: string; amount: number; justification: string }[];
  totalCost: number;
  personnelCosts: number;
}

export function useB31SectionData(proposalId: string) {
  // Fetch WP drafts with tasks, deliverables
  const wpQuery = useQuery({
    queryKey: ['b31-wp-data', proposalId],
    queryFn: async () => {
      const [{ data: wps, error: wpErr }, { data: palette }] = await Promise.all([
        supabase
          .from('wp_drafts')
          .select(`
            id, number, title, short_name, lead_participant_id, objectives, description_before_tasks, methodology, manual_person_months, manual_duration,
            tasks:wp_draft_tasks(
              id, number, title, description, lead_participant_id, start_month, end_month,
              effort:wp_draft_task_effort(participant_id, person_months),
              participants:wp_draft_task_participants(participant_id)
            ),
            deliverables:wp_draft_deliverables(
              id, number, title, type, dissemination_level, responsible_participant_id, due_month, description
            ),
            wp_effort:wp_draft_effort(participant_id, person_months)
          `)
          .eq('proposal_id', proposalId)
          .order('number'),
        supabase
          .from('wp_color_palette')
          .select('colors')
          .eq('proposal_id', proposalId)
          .single(),
      ]);
      if (wpErr) throw wpErr;
      const colors = (palette?.colors as string[]) || DEFAULT_WP_COLORS;
      return (wps || []).map((wp: any) => ({
        ...wp,
        color: colors[(wp.number - 1) % colors.length] || DEFAULT_WP_COLORS[0],
        tasks: (wp.tasks || []).sort((a: any, b: any) => a.number - b.number),
        deliverables: (wp.deliverables || []).sort((a: any, b: any) => a.number - b.number),
      })) as B31WPData[];
    },
  });

  // Fetch participants
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

  // Fetch PERT and Gantt figures
  const figuresQuery = useQuery({
    queryKey: ['b31-figures', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('figures')
        .select('id, figure_number, figure_type, title, caption, content')
        .eq('proposal_id', proposalId)
        .in('figure_type', ['pert', 'gantt']);
      if (error) throw error;
      return data as B31Figure[];
    },
  });

  // Fetch budget rows with subcontracting items for tables 3.1.g and 3.1.h
  const budgetRowsQuery = useQuery({
    queryKey: ['b31-budget-rows', proposalId],
    queryFn: async () => {
      const { data: budgetRows, error: brError } = await supabase
        .from('budget_rows')
        .select('id, participant_id, subcontracting_costs, purchase_equipment, purchase_equipment_justification, personnel_costs, pm_rate, participants!inner(participant_number)')
        .eq('proposal_id', proposalId);
      if (brError) throw brError;

      // Fetch effort totals for PM-based personnel cost calc
      const { data: effortData } = await supabase
        .from('wp_draft_effort')
        .select('participant_id, person_months, wp_drafts!inner(proposal_id)')
        .eq('wp_drafts.proposal_id', proposalId);

      const pmTotals = new Map<string, number>();
      (effortData || []).forEach((e: any) => {
        pmTotals.set(e.participant_id, (pmTotals.get(e.participant_id) || 0) + Number(e.person_months || 0));
      });

      // Fetch subcontracting line items
      const rowIds = (budgetRows || []).map((r: any) => r.id);
      let subItems: any[] = [];
      if (rowIds.length > 0) {
        const { data } = await supabase
          .from('budget_subcontracting_items')
          .select('*')
          .in('budget_row_id', rowIds)
          .order('order_index');
        subItems = data || [];
      }

      return { budgetRows: budgetRows || [], subItems, pmTotals };
    },
  });

  const pertFigure = figuresQuery.data?.find(f => f.figure_type === 'pert') || null;
  const ganttFigure = figuresQuery.data?.find(f => f.figure_type === 'gantt') || null;

  // Aggregate subcontracting by participant
  const subcontractingByParticipant: B31SubcontractingParticipant[] = (() => {
    const br = budgetRowsQuery.data;
    if (!br) return [];
    const map = new Map<string, { totalCost: number; justifications: string[] }>();
    for (const row of br.budgetRows) {
      const r = row as any;
      if (Number(r.subcontracting_costs) <= 0) continue;
      const items = br.subItems.filter((i: any) => i.budget_row_id === r.id);
      const totalCost = items.reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0) || Number(r.subcontracting_costs);
      const justifications = items
        .filter((i: any) => i.justification && i.justification.trim())
        .map((i: any) => {
          const desc = i.description?.trim();
          const just = i.justification.trim();
          return desc ? `${desc}: ${just}` : just;
        });
      map.set(r.participant_id, { totalCost, justifications });
    }
    return Array.from(map.entries()).map(([participantId, v]) => ({
      participantId,
      ...v,
    }));
  })();

  // Equipment items exceeding 15% of personnel costs
  const equipmentByParticipant: B31EquipmentParticipant[] = (() => {
    const br = budgetRowsQuery.data;
    if (!br) return [];
    const result: B31EquipmentParticipant[] = [];
    for (const row of br.budgetRows) {
      const r = row as any;
      const equipCost = Number(r.purchase_equipment) || 0;
      if (equipCost <= 0) continue;
      const pmRate = r.pm_rate != null ? Number(r.pm_rate) : 0;
      const totalPMs = br.pmTotals.get(r.participant_id) || 0;
      const personnelCosts = pmRate > 0 ? Math.round(pmRate * totalPMs) : Number(r.personnel_costs) || 0;
      if (personnelCosts <= 0 || equipCost <= personnelCosts * 0.15) continue;
      result.push({
        participantId: r.participant_id,
        equipmentCost: equipCost,
        personnelCosts,
        justification: r.purchase_equipment_justification || '',
      });
    }
    return result;
  })();

  return {
    wpData: wpQuery.data || [],
    participants: participantsQuery.data || [],
    pertFigure,
    ganttFigure,
    subcontractingByParticipant,
    equipmentByParticipant,
    loading: wpQuery.isLoading || participantsQuery.isLoading || figuresQuery.isLoading || budgetRowsQuery.isLoading,
  };
}
