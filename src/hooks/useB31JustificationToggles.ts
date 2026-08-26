import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface B31JustificationToggles {
  // umbrella
  purchase_costs: boolean;
  // C sub-toggles
  travel: boolean;
  equipment: boolean;          // user-controlled C.2 inclusion (forced on by >15% rule in UI)
  other_goods: boolean;
}

const DEFAULTS: B31JustificationToggles = {
  purchase_costs: false,
  travel: false,
  equipment: false,
  other_goods: false,
};

const COLUMN_MAP: Record<keyof B31JustificationToggles, string> = {
  purchase_costs: 'b31_show_purchase_costs',
  travel: 'b31_show_travel_justification',
  equipment: 'b31_show_equipment_justification',
  other_goods: 'b31_show_other_goods_justification',
};

const SELECT_COLS = Object.values(COLUMN_MAP).join(', ');

export function useB31JustificationToggles(proposalId: string) {
  const qc = useQueryClient();
  const queryKey = ['b31-justification-toggles', proposalId];

  const query = useQuery({
    queryKey,
    enabled: !!proposalId,
    queryFn: async (): Promise<B31JustificationToggles> => {
      const { data, error } = await (supabase as any)
        .from('proposals')
        .select(SELECT_COLS)
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      const row = (data as any) || {};
      const out: any = {};
      (Object.keys(COLUMN_MAP) as (keyof B31JustificationToggles)[]).forEach(k => {
        out[k] = !!row[COLUMN_MAP[k]];
      });
      return out as B31JustificationToggles;
    },
  });

  const setToggle = async (key: keyof B31JustificationToggles, value: boolean) => {
    const prev = query.data ?? DEFAULTS;
    const next = { ...prev, [key]: value };
    qc.setQueryData(queryKey, next);
    const { error } = await supabase
      .from('proposals')
      .update({ [COLUMN_MAP[key]]: value } as any)
      .eq('id', proposalId);
    if (error) {
      qc.setQueryData(queryKey, prev);
      throw error;
    }
    qc.invalidateQueries({ queryKey: ['b31-budget-rows', proposalId] });
  };

  return {
    toggles: query.data ?? DEFAULTS,
    loading: query.isLoading,
    setToggle,
  };
}
