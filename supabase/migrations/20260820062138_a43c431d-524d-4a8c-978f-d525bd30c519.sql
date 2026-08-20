CREATE TABLE public.evaluation_model_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text NOT NULL UNIQUE,
  label text NOT NULL,
  price_input_per_mtok numeric NOT NULL,
  price_output_per_mtok numeric NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.evaluation_model_options TO authenticated;
GRANT ALL ON public.evaluation_model_options TO service_role;

ALTER TABLE public.evaluation_model_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read evaluation model options"
ON public.evaluation_model_options FOR SELECT TO authenticated USING (true);

CREATE POLICY "Global admins can insert evaluation model options"
ON public.evaluation_model_options FOR INSERT TO authenticated
WITH CHECK (public.is_global_admin(auth.uid()));

CREATE POLICY "Global admins can update evaluation model options"
ON public.evaluation_model_options FOR UPDATE TO authenticated
USING (public.is_global_admin(auth.uid()))
WITH CHECK (public.is_global_admin(auth.uid()));

CREATE TRIGGER update_evaluation_model_options_updated_at
BEFORE UPDATE ON public.evaluation_model_options
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.evaluation_model_options (model_id, label, price_input_per_mtok, price_output_per_mtok, sort_order, notes)
VALUES
  ('claude-sonnet-5', 'Sonnet 5', 2.00, 10.00, 1, 'Introductory pricing; standard $3/$15 from 2026-09-01'),
  ('claude-opus-5', 'Opus 5', 5.00, 25.00, 2, NULL);