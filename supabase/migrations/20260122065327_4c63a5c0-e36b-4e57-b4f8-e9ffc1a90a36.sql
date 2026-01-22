-- =====================================================
-- NEW TEMPLATE SYSTEM: Hybrid Inheritance Model
-- =====================================================

-- 1. EVOLVE template_types into base_templates
-- Add new columns to existing template_types table
ALTER TABLE public.template_types
ADD COLUMN IF NOT EXISTS action_types text[] DEFAULT ARRAY['RIA']::text[],
ADD COLUMN IF NOT EXISTS submission_stage text DEFAULT 'full',
ADD COLUMN IF NOT EXISTS base_page_limit integer DEFAULT 45,
ADD COLUMN IF NOT EXISTS includes_branding boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS includes_participant_table boolean DEFAULT true;

-- Add check constraint for submission_stage
ALTER TABLE public.template_types
ADD CONSTRAINT template_types_submission_stage_check 
CHECK (submission_stage IN ('stage_1', 'full'));

-- 2. CREATE template_modifiers table
CREATE TABLE IF NOT EXISTS public.template_modifiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  conditions jsonb NOT NULL DEFAULT '{}',
  effects jsonb NOT NULL DEFAULT '{}',
  is_admin_editable boolean DEFAULT true,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add comments for clarity
COMMENT ON TABLE public.template_modifiers IS 'Conditional modifiers that adjust templates based on budget type, work programme, etc.';
COMMENT ON COLUMN public.template_modifiers.conditions IS 'JSON object with keys: budget_type, action_type, work_programme, submission_stage';
COMMENT ON COLUMN public.template_modifiers.effects IS 'JSON object with keys: page_limit_delta, add_section_ids, funding_rate_override';

-- 3. CREATE work_programme_extensions table
CREATE TABLE IF NOT EXISTS public.work_programme_extensions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_programme_code text NOT NULL,
  name text NOT NULL,
  description text,
  extra_section_ids uuid[] DEFAULT ARRAY[]::uuid[],
  extra_part_a_fields jsonb DEFAULT '[]',
  funding_overrides jsonb DEFAULT '{}',
  page_limit_delta integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(work_programme_code)
);

COMMENT ON TABLE public.work_programme_extensions IS 'Programme-specific extensions (CBE JU, Chips JU, Missions, etc.)';
COMMENT ON COLUMN public.work_programme_extensions.funding_overrides IS 'JSON object like {"IA_company": 0.60} for CBE JU';

-- 4. CREATE funding_rules table
CREATE TABLE IF NOT EXISTS public.funding_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  conditions jsonb NOT NULL DEFAULT '{}',
  funding_rate numeric(4,2) NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.funding_rules IS 'Rules engine for calculating funding rates based on action type, participant type, and work programme';
COMMENT ON COLUMN public.funding_rules.conditions IS 'JSON object with keys: action_type, participant_type, work_programme';
COMMENT ON COLUMN public.funding_rules.priority IS 'Higher priority rules are evaluated first';

-- 5. CREATE proposal_templates table (frozen copy per proposal)
CREATE TABLE IF NOT EXISTS public.proposal_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  source_template_type_id uuid REFERENCES public.template_types(id),
  applied_modifier_ids uuid[] DEFAULT ARRAY[]::uuid[],
  applied_extension_ids uuid[] DEFAULT ARRAY[]::uuid[],
  includes_branding boolean DEFAULT true,
  includes_participant_table boolean DEFAULT true,
  base_page_limit integer DEFAULT 45,
  is_customized boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(proposal_id)
);

COMMENT ON TABLE public.proposal_templates IS 'Frozen template copy for each proposal, allowing per-proposal customization';

-- 6. CREATE proposal_template_sections table (copied sections per proposal)
CREATE TABLE IF NOT EXISTS public.proposal_template_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_template_id uuid NOT NULL REFERENCES public.proposal_templates(id) ON DELETE CASCADE,
  source_section_id uuid REFERENCES public.template_sections(id),
  section_number text NOT NULL,
  title text NOT NULL,
  description text,
  part text NOT NULL,
  editor_type text NOT NULL DEFAULT 'rich_text',
  page_limit integer,
  word_limit integer,
  section_tag text,
  order_index integer NOT NULL DEFAULT 0,
  parent_section_id uuid REFERENCES public.proposal_template_sections(id),
  is_required boolean DEFAULT true,
  is_active boolean DEFAULT true,
  is_custom boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.proposal_template_sections IS 'Per-proposal copy of template sections, allowing admin customization';
COMMENT ON COLUMN public.proposal_template_sections.is_custom IS 'True if this section was added or modified by admin for this specific proposal';

-- 7. CREATE proposal_section_guidelines (copied guidelines per proposal section)
CREATE TABLE IF NOT EXISTS public.proposal_section_guidelines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_section_id uuid NOT NULL REFERENCES public.proposal_template_sections(id) ON DELETE CASCADE,
  source_guideline_id uuid REFERENCES public.section_guidelines(id),
  guideline_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 8. Enable RLS on all new tables
ALTER TABLE public.template_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_programme_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_section_guidelines ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies for template_modifiers (public read, owner manage)
CREATE POLICY "Anyone can view template modifiers"
ON public.template_modifiers FOR SELECT
USING (true);

CREATE POLICY "Owners can manage template modifiers"
ON public.template_modifiers FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'owner'
));

-- 10. RLS Policies for work_programme_extensions
CREATE POLICY "Anyone can view work programme extensions"
ON public.work_programme_extensions FOR SELECT
USING (true);

CREATE POLICY "Owners can manage work programme extensions"
ON public.work_programme_extensions FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'owner'
));

-- 11. RLS Policies for funding_rules
CREATE POLICY "Anyone can view funding rules"
ON public.funding_rules FOR SELECT
USING (true);

CREATE POLICY "Owners can manage funding rules"
ON public.funding_rules FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'owner'
));

-- 12. RLS Policies for proposal_templates
CREATE POLICY "Users can view proposal templates"
ON public.proposal_templates FOR SELECT
USING (has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Admins can manage proposal templates"
ON public.proposal_templates FOR ALL
USING (is_proposal_admin(auth.uid(), proposal_id));

-- Allow insert when creating proposal (same user check)
CREATE POLICY "Users can create proposal templates for own proposals"
ON public.proposal_templates FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.proposals
  WHERE proposals.id = proposal_id AND proposals.created_by = auth.uid()
));

-- 13. RLS Policies for proposal_template_sections
CREATE POLICY "Users can view proposal template sections"
ON public.proposal_template_sections FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.proposal_templates pt
  WHERE pt.id = proposal_template_id
  AND has_any_proposal_role(auth.uid(), pt.proposal_id)
));

CREATE POLICY "Admins can manage proposal template sections"
ON public.proposal_template_sections FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.proposal_templates pt
  WHERE pt.id = proposal_template_id
  AND is_proposal_admin(auth.uid(), pt.proposal_id)
));

-- 14. RLS Policies for proposal_section_guidelines
CREATE POLICY "Users can view proposal section guidelines"
ON public.proposal_section_guidelines FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.proposal_template_sections pts
  JOIN public.proposal_templates pt ON pt.id = pts.proposal_template_id
  WHERE pts.id = proposal_section_id
  AND has_any_proposal_role(auth.uid(), pt.proposal_id)
));

CREATE POLICY "Admins can manage proposal section guidelines"
ON public.proposal_section_guidelines FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.proposal_template_sections pts
  JOIN public.proposal_templates pt ON pt.id = pts.proposal_template_id
  WHERE pts.id = proposal_section_id
  AND is_proposal_admin(auth.uid(), pt.proposal_id)
));

-- 15. Add updated_at triggers
CREATE TRIGGER update_template_modifiers_updated_at
  BEFORE UPDATE ON public.template_modifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_work_programme_extensions_updated_at
  BEFORE UPDATE ON public.work_programme_extensions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_funding_rules_updated_at
  BEFORE UPDATE ON public.funding_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_proposal_templates_updated_at
  BEFORE UPDATE ON public.proposal_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_proposal_template_sections_updated_at
  BEFORE UPDATE ON public.proposal_template_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_proposal_section_guidelines_updated_at
  BEFORE UPDATE ON public.proposal_section_guidelines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 16. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_proposal_templates_proposal_id ON public.proposal_templates(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_template_sections_template_id ON public.proposal_template_sections(proposal_template_id);
CREATE INDEX IF NOT EXISTS idx_proposal_template_sections_parent ON public.proposal_template_sections(parent_section_id);
CREATE INDEX IF NOT EXISTS idx_proposal_section_guidelines_section ON public.proposal_section_guidelines(proposal_section_id);
CREATE INDEX IF NOT EXISTS idx_funding_rules_priority ON public.funding_rules(priority DESC);
CREATE INDEX IF NOT EXISTS idx_template_modifiers_code ON public.template_modifiers(code);
CREATE INDEX IF NOT EXISTS idx_work_programme_extensions_code ON public.work_programme_extensions(work_programme_code);