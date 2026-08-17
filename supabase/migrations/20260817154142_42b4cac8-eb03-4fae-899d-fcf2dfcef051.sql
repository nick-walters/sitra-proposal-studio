
CREATE TABLE public.card_guidelines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guideline_type text NOT NULL CHECK (guideline_type IN ('evaluation','commission','sitra')),
  title text NULL,
  content text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  condition_budget_type public.budget_type NULL,
  condition_uses_fstp boolean NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.card_guideline_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guideline_id uuid NOT NULL REFERENCES public.card_guidelines(id) ON DELETE CASCADE,
  card_template_id uuid NOT NULL REFERENCES public.card_templates(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_guideline_templates_uniq UNIQUE (guideline_id, card_template_id)
);
CREATE INDEX card_guideline_templates_card_order_idx
  ON public.card_guideline_templates (card_template_id, order_index);

CREATE TABLE public.card_guideline_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guideline_id uuid NOT NULL REFERENCES public.card_guidelines(id) ON DELETE CASCADE,
  section_source_id uuid NOT NULL REFERENCES public.template_sections(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_guideline_sections_uniq UNIQUE (guideline_id, section_source_id)
);
CREATE INDEX card_guideline_sections_section_idx
  ON public.card_guideline_sections (section_source_id);

GRANT SELECT, INSERT, UPDATE ON public.card_guidelines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.card_guideline_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.card_guideline_sections TO authenticated;
GRANT ALL ON public.card_guidelines TO service_role;
GRANT ALL ON public.card_guideline_templates TO service_role;
GRANT ALL ON public.card_guideline_sections TO service_role;

ALTER TABLE public.card_guidelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_guideline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_guideline_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view card guidelines"
  ON public.card_guidelines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Global admins can insert card guidelines"
  ON public.card_guidelines FOR INSERT TO authenticated WITH CHECK (public.is_global_admin(auth.uid()));
CREATE POLICY "Global admins can update card guidelines"
  ON public.card_guidelines FOR UPDATE TO authenticated
  USING (public.is_global_admin(auth.uid())) WITH CHECK (public.is_global_admin(auth.uid()));

CREATE POLICY "Authenticated users can view guideline template links"
  ON public.card_guideline_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Global admins can insert guideline template links"
  ON public.card_guideline_templates FOR INSERT TO authenticated WITH CHECK (public.is_global_admin(auth.uid()));
CREATE POLICY "Global admins can update guideline template links"
  ON public.card_guideline_templates FOR UPDATE TO authenticated
  USING (public.is_global_admin(auth.uid())) WITH CHECK (public.is_global_admin(auth.uid()));

CREATE POLICY "Authenticated users can view guideline section links"
  ON public.card_guideline_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Global admins can insert guideline section links"
  ON public.card_guideline_sections FOR INSERT TO authenticated WITH CHECK (public.is_global_admin(auth.uid()));
CREATE POLICY "Global admins can update guideline section links"
  ON public.card_guideline_sections FOR UPDATE TO authenticated
  USING (public.is_global_admin(auth.uid())) WITH CHECK (public.is_global_admin(auth.uid()));

CREATE TRIGGER card_guidelines_updated_at BEFORE UPDATE ON public.card_guidelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER card_guideline_templates_updated_at BEFORE UPDATE ON public.card_guideline_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER card_guideline_sections_updated_at BEFORE UPDATE ON public.card_guideline_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
