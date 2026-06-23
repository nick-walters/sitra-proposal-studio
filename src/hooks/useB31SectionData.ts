import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';

export interface B31Task {
  id: string;
  number: number;
  title: string | null;
  description: string | null;
  lead_participant_id: string | null;
  start_month: number | null;
  end_month: number | null;
  participants: { participant_id: string }[];
}

export interface B31WPData {
  id: string;
  number: number;
  title: string | null;
  short_name: string | null;
  lead_participant_id: string | null;
  color: string;
  objectives: string | null;
  b31_objectives: string | null;
  description_before_tasks: string | null;
  b31_description_before_tasks: string | null;
  methodology: string | null;
  manual_person_months: number | null;
  manual_duration: string | null;
  b31_tasks: B31Task[];
  tasks: {
    id: string;
    number: number;
    title: string | null;
    description: string | null;
    b31_description: string | null;
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
    enabled: !!proposalId,
    queryFn: async () => {
      const { data: wps, error: wpErr } = await supabase
        .from('wp_drafts')
        .select(`
          id, number, title, short_name, lead_participant_id, color, objectives, b31_objectives, description_before_tasks, b31_description_before_tasks, methodology, manual_person_months, manual_duration,
          tasks:wp_draft_tasks(
            id, number, title, description, b31_description, lead_participant_id, start_month, end_month,
            effort:wp_draft_task_effort(participant_id, person_months),
            participants:wp_draft_task_participants(participant_id)
          ),
          deliverables:wp_draft_deliverables(
            id, number, title, type, dissemination_level, responsible_participant_id, due_month, description
          ),
          wp_effort:wp_draft_effort(participant_id, person_months)
        `)
        .eq('proposal_id', proposalId)
        .order('number');
      if (wpErr) throw wpErr;

      const wpIds = (wps || []).map((w: any) => w.id);

      let b31TasksData: any[] = [];
      if (wpIds.length > 0) {
        const { data, error: b31Err } = await supabase
          .from('b31_tasks')
          .select(`
            id, wp_draft_id, number, title, description, lead_participant_id, start_month, end_month, order_index,
            participants:b31_task_participants(participant_id)
          `)
          .in('wp_draft_id', wpIds)
          .order('number');
        if (b31Err) throw b31Err;
        b31TasksData = data || [];
      }

      // Group b31_tasks by wp_draft_id
      const b31TasksByWP = new Map<string, any[]>();
      b31TasksData.forEach((t: any) => {
        const arr = b31TasksByWP.get(t.wp_draft_id) || [];
        arr.push(t);
        b31TasksByWP.set(t.wp_draft_id, arr);
      });

      return (wps || []).map((wp: any) => ({
        ...wp,
        color: wp.color || DEFAULT_WP_COLORS[(wp.number - 1) % DEFAULT_WP_COLORS.length],
        tasks: (wp.tasks || []).sort((a: any, b: any) => a.number - b.number),
        b31_tasks: (b31TasksByWP.get(wp.id) || []).sort((a: any, b: any) => a.number - b.number),
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
      let equipItems: any[] = [];
      if (rowIds.length > 0) {
        const [{ data: subData }, { data: equipData }] = await Promise.all([
          supabase
            .from('budget_subcontracting_items')
            .select('*')
            .in('budget_row_id', rowIds)
            .order('order_index'),
          supabase
            .from('budget_equipment_items')
            .select('*')
            .in('budget_row_id', rowIds)
            .order('order_index'),
        ]);
        subItems = subData || [];
        equipItems = equipData || [];
      }

      return { budgetRows: budgetRows || [], subItems, equipItems, pmTotals };
    },
  });

  const pertFigure = figuresQuery.data?.find(f => f.figure_type === 'pert') || null;
  const ganttFigure = figuresQuery.data?.find(f => f.figure_type === 'gantt') || null;

  // Aggregate subcontracting by participant (single cost + justification)
  const subcontractingByParticipant: B31SubcontractingParticipant[] = (() => {
    const br = budgetRowsQuery.data;
    if (!br) return [];
    const result: B31SubcontractingParticipant[] = [];
    for (const row of br.budgetRows) {
      const r = row as any;
      const totalCost = Number(r.subcontracting_costs) || 0;
      if (totalCost <= 0) continue;
      const subItem = br.subItems.find((i: any) => i.budget_row_id === r.id);
      const justification = subItem?.justification || '';
      result.push({
        participantId: r.participant_id,
        items: [{ description: '', amount: totalCost, justification }],
        totalCost,
      });
    }
    return result;
  })();

  // Equipment items exceeding 15% of personnel costs (single cost + justification)
  const equipmentByParticipant: B31EquipmentParticipant[] = (() => {
    const br = budgetRowsQuery.data;
    if (!br) return [];
    const result: B31EquipmentParticipant[] = [];
    for (const row of br.budgetRows) {
      const r = row as any;
      const totalEquipCost = Number(r.purchase_equipment) || 0;
      if (totalEquipCost <= 0) continue;
      const pmRate = r.pm_rate != null ? Number(r.pm_rate) : 0;
      const totalPMs = br.pmTotals.get(r.participant_id) || 0;
      const personnelCosts = pmRate > 0 ? Math.round(pmRate * totalPMs) : Number(r.personnel_costs) || 0;
      if (personnelCosts <= 0 || totalEquipCost <= personnelCosts * 0.15) continue;
      const equipItem = br.equipItems.find((i: any) => i.budget_row_id === r.id);
      const justification = equipItem?.justification || '';
      result.push({
        participantId: r.participant_id,
        items: [{ description: '', amount: totalEquipCost, justification }],
        totalCost: totalEquipCost,
        personnelCosts,
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
