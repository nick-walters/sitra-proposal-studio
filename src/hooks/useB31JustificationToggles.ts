import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface B31JustificationToggles {
  travel: boolean;
  other_goods: boolean;
  fstp: boolean;
  internally_invoiced: boolean;
}

const DEFAULTS: B31JustificationToggles = {
  travel: false,
  other_goods: false,
  fstp: false,
  internally_invoiced: false,
};

const COLUMN_MAP: Record<keyof B31JustificationToggles, string> = {
  travel: 'b31_show_travel_justification',
  other_goods: 'b31_show_other_goods_justification',
  fstp: 'b31_show_fstp_justification',
  internally_invoiced: 'b31_show_internally_invoiced_justification',
};

export function useB31JustificationToggles(proposalId: string) {
  const qc = useQueryClient();
  const queryKey = ['b31-justification-toggles', proposalId];

  const query = useQuery({
    queryKey,
    enabled: !!proposalId,
    queryFn: async (): Promise<B31JustificationToggles> => {
      const { data, error } = await supabase
        .from('proposals')
        .select(
          'b31_show_travel_justification, b31_show_other_goods_justification, b31_show_fstp_justification, b31_show_internally_invoiced_justification',
        )
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      const row = (data as any) || {};
      return {
        travel: !!row.b31_show_travel_justification,
        other_goods: !!row.b31_show_other_goods_justification,
        fstp: !!row.b31_show_fstp_justification,
        internally_invoiced: !!row.b31_show_internally_invoiced_justification,
      };
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
