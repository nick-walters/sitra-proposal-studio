import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface B31CostPresence {
  subcontracting: boolean;
  travel: boolean;
  equipment: boolean;
  equipmentAboveThreshold: boolean; // any participant whose equipment > 15% of personnel
  equipmentBelowThreshold: boolean; // any participant with equipment items but <= 15% of personnel
  otherGoods: boolean;
  fstp: boolean;
  internallyInvoiced: boolean;
  loading: boolean;
}

/**
 * Detects whether any cost items exist in each cost-justification category for a proposal.
 * Used by the A3 panel to grey-out / auto-lock checkboxes.
 */
export function useB31CostPresence(proposalId: string): B31CostPresence {
  const q = useQuery({
    queryKey: ['b31-cost-presence', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data: rows, error: brErr } = await supabase
        .from('budget_rows')
        .select('id, participant_id, personnel_costs, pm_rate, subcontracting_costs, purchase_travel, purchase_equipment, purchase_other_goods, financial_support_third_parties, internally_invoiced')
        .eq('proposal_id', proposalId);
      if (brErr) throw brErr;

      const rowIds = (rows || []).map((r: any) => r.id);
      let items: any[] = [];
      if (rowIds.length > 0) {
        const { data, error } = await supabase
          .from('budget_cost_justification_items')
          .select('budget_row_id, category, amount')
          .in('budget_row_id', rowIds);
        if (error) throw error;
        items = data || [];
      }


      const { data: effortData } = await supabase
        .from('wp_draft_effort')
        .select('participant_id, person_months, wp_drafts!inner(proposal_id)')
        .eq('wp_drafts.proposal_id', proposalId);
      const pmTotals = new Map<string, number>();
      (effortData || []).forEach((e: any) => {
        pmTotals.set(e.participant_id, (pmTotals.get(e.participant_id) || 0) + Number(e.person_months || 0));
      });

      // A category is "present" if any participant has either an itemised entry OR a top-level column total > 0.
      const colTotal = (col: string) =>
        (rows || []).some((r: any) => Number(r[col] || 0) > 0);
      const hasItem = (cat: string) =>
        items.some((i: any) => i.category === cat && Number(i.amount || 0) > 0);
      const has = (cat: string, col: string) => hasItem(cat) || colTotal(col);

      // Equipment threshold logic per participant. Use itemised total when present, else column total.
      let equipmentAboveThreshold = false;
      let equipmentBelowThreshold = false;
      for (const r of rows || []) {
        const row = r as any;
        const equipItems = items.filter(
          (i: any) => i.budget_row_id === row.id && i.category === 'equipment',
        );
        const itemTotal = equipItems.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
        const totalEquip = itemTotal > 0 ? itemTotal : Number(row.purchase_equipment || 0);
        if (totalEquip <= 0) continue;
        const pmRate = row.pm_rate != null ? Number(row.pm_rate) : 0;
        const totalPM = pmTotals.get(row.participant_id) || 0;
        const personnel = pmRate > 0 ? Math.round(pmRate * totalPM) : Number(row.personnel_costs) || 0;
        if (personnel > 0 && totalEquip > personnel * 0.15) {
          equipmentAboveThreshold = true;
        } else {
          equipmentBelowThreshold = true;
        }
      }

      return {
        subcontracting: has('subcontracting', 'subcontracting_costs'),
        travel: has('travel', 'purchase_travel'),
        equipment: has('equipment', 'purchase_equipment'),
        equipmentAboveThreshold,
        equipmentBelowThreshold,
        otherGoods: has('other_goods', 'purchase_other_goods'),
        fstp: has('fstp', 'financial_support_third_parties'),
        internallyInvoiced: has('internally_invoiced', 'internally_invoiced'),

      };
    },
  });

  return {
    subcontracting: !!q.data?.subcontracting,
    travel: !!q.data?.travel,
    equipment: !!q.data?.equipment,
    equipmentAboveThreshold: !!q.data?.equipmentAboveThreshold,
    equipmentBelowThreshold: !!q.data?.equipmentBelowThreshold,
    otherGoods: !!q.data?.otherGoods,
    fstp: !!q.data?.fstp,
    internallyInvoiced: !!q.data?.internallyInvoiced,
    loading: q.isLoading,
  };
}
