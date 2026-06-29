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

export interface B31JustificationItem {
  amount: number;
  justification: string;
}

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
          ),
          wp_effort:wp_draft_effort(participant_id, person_months)
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
        .select('id, figure_number, figure_type, title, caption, content')
        .eq('proposal_id', proposalId)
        .in('figure_type', ['pert', 'gantt']);
      if (error) throw error;
      return data as B31Figure[];
    },
  });

  const budgetRowsQuery = useQuery({
    queryKey: ['b31-budget-rows', proposalId],
    queryFn: async () => {
      const { data: budgetRows, error: brError } = await supabase
        .from('budget_rows')
        .select('id, participant_id, subcontracting_costs, purchase_equipment, personnel_costs, pm_rate')
        .eq('proposal_id', proposalId);
      if (brError) throw brError;

      const { data: effortData } = await supabase
        .from('wp_draft_effort')
        .select('participant_id, person_months, wp_drafts!inner(proposal_id)')
        .eq('wp_drafts.proposal_id', proposalId);

      const pmTotals = new Map<string, number>();
      (effortData || []).forEach((e: any) => {
        pmTotals.set(e.participant_id, (pmTotals.get(e.participant_id) || 0) + Number(e.person_months || 0));
      });

      const rowIds = (budgetRows || []).map((r: any) => r.id);
      let justItems: any[] = [];
      if (rowIds.length > 0) {
        const { data } = await supabase
          .from('budget_cost_justification_items')
          .select('*')
          .in('budget_row_id', rowIds)
          .in('category', ['subcontracting', 'equipment', 'travel', 'other_goods', 'fstp', 'internally_invoiced'])
          .order('order_index');
        justItems = data || [];
      }

      return { budgetRows: budgetRows || [], justItems, pmTotals };
    },
  });

  const pertFigure = figuresQuery.data?.find(f => f.figure_type === 'pert') || null;
  const ganttFigure = figuresQuery.data?.find(f => f.figure_type === 'gantt') || null;

  const subcontractingByParticipant: B31SubcontractingParticipant[] = (() => {
    const br = budgetRowsQuery.data;
    if (!br) return [];
    const result: B31SubcontractingParticipant[] = [];
    for (const row of br.budgetRows) {
      const r = row as any;
      const items = br.justItems
        .filter((i: any) => i.budget_row_id === r.id && i.category === 'subcontracting')
        .map((i: any) => ({ amount: Number(i.amount) || 0, justification: i.justification || '' }));
      const totalCost = items.reduce((s, i) => s + i.amount, 0);
      if (totalCost <= 0 || items.length === 0) continue;
      result.push({ participantId: r.participant_id, items, totalCost });
    }
    return result;
  })();

  const equipmentByParticipant: B31EquipmentParticipant[] = (() => {
    const br = budgetRowsQuery.data;
    if (!br) return [];
    const result: B31EquipmentParticipant[] = [];
    for (const row of br.budgetRows) {
      const r = row as any;
      const items = br.justItems
        .filter((i: any) => i.budget_row_id === r.id && i.category === 'equipment')
        .map((i: any) => ({ amount: Number(i.amount) || 0, justification: i.justification || '' }));
      const totalEquipCost = items.reduce((s, i) => s + i.amount, 0);
      if (totalEquipCost <= 0 || items.length === 0) continue;
      const pmRate = r.pm_rate != null ? Number(r.pm_rate) : 0;
      const totalPMs = br.pmTotals.get(r.participant_id) || 0;
      const personnelCosts = pmRate > 0 ? Math.round(pmRate * totalPMs) : Number(r.personnel_costs) || 0;
      // 15%-of-personnel "major equipment" rule applied per participant
      if (personnelCosts <= 0 || totalEquipCost <= personnelCosts * 0.15) continue;
      result.push({
        participantId: r.participant_id,
        items,
        totalCost: totalEquipCost,
        personnelCosts,
      });
    }
    return result;
  })();

  // Generic per-participant accumulator for optional categories (travel / other_goods / fstp / internally_invoiced).
  const buildOptionalCategory = (category: string): B31SubcontractingParticipant[] => {
    const br = budgetRowsQuery.data;
    if (!br) return [];
    const result: B31SubcontractingParticipant[] = [];
    for (const row of br.budgetRows) {
      const r = row as any;
      const items = br.justItems
        .filter((i: any) => i.budget_row_id === r.id && i.category === category)
        .map((i: any) => ({ amount: Number(i.amount) || 0, justification: i.justification || '' }));
      const totalCost = items.reduce((s, i) => s + i.amount, 0);
      if (totalCost <= 0 || items.length === 0) continue;
      result.push({ participantId: r.participant_id, items, totalCost });
    }
    return result;
  };

  const travelByParticipant = buildOptionalCategory('travel');
  const otherGoodsByParticipant = buildOptionalCategory('other_goods');
  const fstpByParticipant = buildOptionalCategory('fstp');
  const internallyInvoicedByParticipant = buildOptionalCategory('internally_invoiced');

  return {
    wpData: wpQuery.data || [],
    participants: participantsQuery.data || [],
    pertFigure,
    ganttFigure,
    subcontractingByParticipant,
    equipmentByParticipant,
    travelByParticipant,
    otherGoodsByParticipant,
    fstpByParticipant,
    internallyInvoicedByParticipant,
    loading: wpQuery.isLoading || participantsQuery.isLoading || figuresQuery.isLoading || budgetRowsQuery.isLoading,
  };
}
