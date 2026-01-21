-- Funding programmes (e.g., Horizon Europe Pillar II, CBE JU, etc.)
CREATE TABLE public.funding_programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.funding_programmes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view funding programmes"
ON public.funding_programmes FOR SELECT
USING (true);

CREATE POLICY "Owners can manage funding programmes"
ON public.funding_programmes FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Template types (e.g., RIA, IA, CSA, CBE JU RIA)
CREATE TABLE public.template_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funding_programme_id uuid REFERENCES public.funding_programmes(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  parent_type_id uuid REFERENCES public.template_types(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.template_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view template types"
ON public.template_types FOR SELECT
USING (true);

CREATE POLICY "Owners can manage template types"
ON public.template_types FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Template sections (structure of Part A and Part B)
CREATE TABLE public.template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type_id uuid REFERENCES public.template_types(id) ON DELETE CASCADE NOT NULL,
  part text NOT NULL CHECK (part IN ('A', 'B')),
  section_number text NOT NULL,
  title text NOT NULL,
  description text,
  editor_type text NOT NULL CHECK (editor_type IN ('form', 'rich_text', 'summary')),
  word_limit integer,
  page_limit integer,
  order_index integer NOT NULL DEFAULT 0,
  parent_section_id uuid REFERENCES public.template_sections(id) ON DELETE CASCADE,
  is_required boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.template_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view template sections"
ON public.template_sections FOR SELECT
USING (true);

CREATE POLICY "Owners can manage template sections"
ON public.template_sections FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Section guidelines (Official EC and Sitra tips)
CREATE TABLE public.section_guidelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid REFERENCES public.template_sections(id) ON DELETE CASCADE NOT NULL,
  guideline_type text NOT NULL CHECK (guideline_type IN ('official', 'sitra_tip')),
  title text NOT NULL,
  content text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.section_guidelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view section guidelines"
ON public.section_guidelines FOR SELECT
USING (true);

CREATE POLICY "Owners can manage section guidelines"
ON public.section_guidelines FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Form fields for Part A forms
CREATE TABLE public.template_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid REFERENCES public.template_sections(id) ON DELETE CASCADE NOT NULL,
  field_name text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'textarea', 'select', 'checkbox', 'date', 'number', 'email', 'url', 'country', 'organisation')),
  placeholder text,
  options jsonb,
  validation_rules jsonb,
  help_text text,
  is_required boolean DEFAULT false,
  is_participant_specific boolean DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.template_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view template form fields"
ON public.template_form_fields FOR SELECT
USING (true);

CREATE POLICY "Owners can manage template form fields"
ON public.template_form_fields FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Budget template types
CREATE TABLE public.budget_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type_id uuid REFERENCES public.template_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  budget_type text NOT NULL CHECK (budget_type IN ('traditional', 'lump_sum')),
  categories jsonb NOT NULL,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view budget templates"
ON public.budget_templates FOR SELECT
USING (true);

CREATE POLICY "Owners can manage budget templates"
ON public.budget_templates FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Link proposals to template types
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS template_type_id uuid REFERENCES public.template_types(id);
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS budget_template_id uuid REFERENCES public.budget_templates(id);

-- Create updated_at triggers
CREATE TRIGGER update_funding_programmes_updated_at
  BEFORE UPDATE ON public.funding_programmes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_types_updated_at
  BEFORE UPDATE ON public.template_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_sections_updated_at
  BEFORE UPDATE ON public.template_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_section_guidelines_updated_at
  BEFORE UPDATE ON public.section_guidelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_form_fields_updated_at
  BEFORE UPDATE ON public.template_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_budget_templates_updated_at
  BEFORE UPDATE ON public.budget_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper function to check if user is owner
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'owner'
  )
$$;