import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EvaluationModelOption {
  id: string;
  model_id: string;
  label: string;
  price_input_per_mtok: number;
  price_output_per_mtok: number;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
}

/**
 * Runtime-configurable model choices for the mock evaluation.
 *
 * The ids, labels and per-MTok prices live in `evaluation_model_options`, which
 * every signed-in user may read but only platform owners (is_global_admin) may
 * change. Nothing about the model choice is hardcoded in the client any more.
 */
export function useEvaluationModelOptions() {
  const query = useQuery({
    queryKey: ["evaluation-model-options"],
    queryFn: async (): Promise<EvaluationModelOption[]> => {
      const { data, error } = await supabase
        .from("evaluation_model_options")
        .select("id, model_id, label, price_input_per_mtok, price_output_per_mtok, sort_order, is_active, notes")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []).map((row) => ({
        ...row,
        price_input_per_mtok: Number(row.price_input_per_mtok),
        price_output_per_mtok: Number(row.price_output_per_mtok),
      }));
    },
    staleTime: 60_000,
  });

  return {
    options: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
