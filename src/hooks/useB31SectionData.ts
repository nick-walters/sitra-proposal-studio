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
  methodology: string | null;
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

export interface B31BudgetItem {
  id: string;
  participant_id: string;
  category: string;
  description: string | null;
  amount: number;
  justification: string | null;
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
            id, number, title, short_name, lead_participant_id, objectives, methodology,
            tasks:wp_draft_tasks(
              id, number, title, description, lead_participant_id, start_month, end_month,
              effort:wp_draft_task_effort(participant_id, person_months),
              participants:wp_draft_task_participants(participant_id)
            ),
            deliverables:wp_draft_deliverables(
              id, number, title, type, dissemination_level, responsible_participant_id, due_month, description
            )
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

  // Fetch budget items for subcontracting and equipment
  const budgetQuery = useQuery({
    queryKey: ['b31-budget', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_items')
        .select('id, participant_id, category, description, amount, justification')
        .eq('proposal_id', proposalId)
        .in('category', ['subcontracting', 'equipment']);
      if (error) throw error;
      return data as B31BudgetItem[];
    },
  });

  const pertFigure = figuresQuery.data?.find(f => f.figure_type === 'pert') || null;
  const ganttFigure = figuresQuery.data?.find(f => f.figure_type === 'gantt') || null;

  const subcontractingItems = (budgetQuery.data || []).filter(b => b.category === 'subcontracting');
  const equipmentItems = (budgetQuery.data || []).filter(b => b.category === 'equipment');

  return {
    wpData: wpQuery.data || [],
    participants: participantsQuery.data || [],
    pertFigure,
    ganttFigure,
    subcontractingItems,
    equipmentItems,
    loading: wpQuery.isLoading || participantsQuery.isLoading || figuresQuery.isLoading || budgetQuery.isLoading,
  };
}
