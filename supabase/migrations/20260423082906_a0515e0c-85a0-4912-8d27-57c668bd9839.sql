
-- ============================================================
-- PART 1.1: Extend proposal_analyses
-- ============================================================
-- Note: instrument_id FK added later after instrument_types exists
ALTER TABLE public.proposal_analyses
  ADD COLUMN IF NOT EXISTS instrument_id uuid,
  ADD COLUMN IF NOT EXISTS proposal_stage text,
  ADD COLUMN IF NOT EXISTS budget_type_used text,
  ADD COLUMN IF NOT EXISTS evaluators_selected jsonb,
  ADD COLUMN IF NOT EXISTS eligibility_flags jsonb,
  ADD COLUMN IF NOT EXISTS excellence_score numeric(3,1),
  ADD COLUMN IF NOT EXISTS impact_score_raw numeric(3,1),
  ADD COLUMN IF NOT EXISTS impact_score_weighted numeric(4,1),
  ADD COLUMN IF NOT EXISTS implementation_score numeric(3,1),
  ADD COLUMN IF NOT EXISTS total_score_unweighted numeric(4,1),
  ADD COLUMN IF NOT EXISTS total_score_weighted numeric(4,1),
  ADD COLUMN IF NOT EXISTS model_used text,
  ADD COLUMN IF NOT EXISTS tokens_input integer,
  ADD COLUMN IF NOT EXISTS tokens_output integer,
  ADD COLUMN IF NOT EXISTS tokens_cached integer,
  ADD COLUMN IF NOT EXISTS cost_usd numeric(8,4),
  ADD COLUMN IF NOT EXISTS cost_eur numeric(8,4);

-- ============================================================
-- PART 1.2: instrument_types
-- ============================================================
CREATE TABLE IF NOT EXISTS public.instrument_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  page_limit_traditional integer,
  page_limit_lump_sum integer,
  stage1_page_limit integer,
  has_stage1 boolean DEFAULT false,
  has_lump_sum boolean DEFAULT true,
  impact_weighting numeric DEFAULT 1.0,
  notes text,
  special_exceptions text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users
);

ALTER TABLE public.instrument_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view instrument types"
  ON public.instrument_types FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins/owners can insert instrument types"
  ON public.instrument_types FOR INSERT
  TO authenticated
  WITH CHECK (public.is_global_admin(auth.uid()));

CREATE POLICY "Admins/owners can update instrument types"
  ON public.instrument_types FOR UPDATE
  TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE POLICY "Admins/owners can delete instrument types"
  ON public.instrument_types FOR DELETE
  TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE TRIGGER update_instrument_types_updated_at
  BEFORE UPDATE ON public.instrument_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Now add FK from proposal_analyses
ALTER TABLE public.proposal_analyses
  ADD CONSTRAINT proposal_analyses_instrument_id_fkey
  FOREIGN KEY (instrument_id) REFERENCES public.instrument_types(id) ON DELETE SET NULL;

-- Seed instruments
INSERT INTO public.instrument_types (name, code, page_limit_traditional, page_limit_lump_sum, stage1_page_limit, has_stage1, has_lump_sum, impact_weighting)
VALUES
  ('RIA', 'ria', 40, 45, 10, true,  true, 1.0),
  ('IA',  'ia',  40, 45, 10, true,  true, 1.5),
  ('CSA', 'csa', 25, 28, NULL, false, true, 1.0)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- PART 1.3: evaluation_criteria
-- ============================================================
CREATE TABLE IF NOT EXISTS public.evaluation_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid REFERENCES public.instrument_types(id) ON DELETE CASCADE,
  criterion_name text NOT NULL,
  criterion_order integer NOT NULL,
  sub_criteria text NOT NULL,
  scoring_descriptors text NOT NULL,
  threshold_full numeric,
  threshold_stage1 numeric,
  applicable_stages text[] NOT NULL,
  weighting numeric DEFAULT 1.0,
  notes text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users
);

ALTER TABLE public.evaluation_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view evaluation criteria"
  ON public.evaluation_criteria FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins/owners can insert evaluation criteria"
  ON public.evaluation_criteria FOR INSERT
  TO authenticated
  WITH CHECK (public.is_global_admin(auth.uid()));

CREATE POLICY "Admins/owners can update evaluation criteria"
  ON public.evaluation_criteria FOR UPDATE
  TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE POLICY "Admins/owners can delete evaluation criteria"
  ON public.evaluation_criteria FOR DELETE
  TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE TRIGGER update_evaluation_criteria_updated_at
  BEFORE UPDATE ON public.evaluation_criteria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default criteria for RIA / IA / CSA
DO $$
DECLARE
  ria_id uuid;
  ia_id  uuid;
  csa_id uuid;
  excellence_sub_ria text := E'- **Clarity and pertinence of the project''s objectives**, and the extent to which the proposed work is ambitious, and goes beyond the state of the art.\n- **Soundness of the proposed methodology**, including the underlying concepts, models, assumptions, inter-disciplinary approaches, appropriate consideration of the gender dimension in research and innovation content, and the quality of open science practices including sharing and management of research outputs and engagement of citizens, civil society and end users where appropriate.';
  excellence_sub_ia text := E'- **Clarity and pertinence of the project''s objectives**, and the extent to which the proposed work is ambitious, and goes beyond the state of the art.\n- **Soundness of the proposed methodology**, including the underlying concepts, models, assumptions, inter-disciplinary approaches, appropriate consideration of the gender dimension in research and innovation content, and the quality of open science practices.';
  excellence_sub_csa text := E'- **Clarity and pertinence of the project''s objectives**, and the extent to which the proposed work is ambitious, and goes beyond the state of the art.\n- **Soundness of the proposed methodology**, including the underlying concepts, models and assumptions, inter-disciplinary approaches, appropriate consideration of the gender dimension in research and innovation content, and the quality of open science practices.';
  impact_sub_ria text := E'- **Credibility of the pathways to achieve the expected outcomes and impacts** specified in the work programme, and the likely scale and significance of the contributions due to the project.\n- **Suitability and quality of the measures to maximise expected outcomes and impacts**, as set out in the dissemination and exploitation plan, including communication activities.';
  impact_sub_ia text := E'- **Credibility of the pathways to achieve the expected outcomes and impacts** specified in the work programme, and the likely scale and significance of the contributions due to the project.\n- **Suitability and quality of the measures to maximise expected outcomes and impacts**, as set out in the dissemination and exploitation plan, including communication activities.';
  impact_sub_csa text := E'- **Credibility of the pathways to achieve the expected outcomes and impacts** specified in the work programme, and the likely scale and significance of the contributions due to the project.\n- **Suitability and quality of the measures to maximise expected outcomes and impacts**, as set out in the dissemination and exploitation plan, including communication activities.';
  impl_sub_ria text := E'- **Quality and effectiveness of the work plan**, assessment of risks, and appropriateness of the effort assigned to work packages, and the resources overall.\n- **Capacity and role of each participant**, and extent to which the consortium as a whole brings together the necessary expertise.';
  impl_sub_ia text := E'- **Quality and effectiveness of the work plan**, assessment of risks, and appropriateness of the effort assigned to work packages, and the resources overall.\n- **Capacity and role of each participant**, and extent to which the consortium as a whole brings together the necessary expertise.';
  impl_sub_csa text := E'- **Quality and effectiveness of the work plan**, assessment of risks, and appropriateness of the effort assigned to work packages, and the resources overall.\n- **Capacity and role of each participant**, and extent to which the consortium as a whole brings together the necessary expertise.';
  scoring_descriptors_default text := E'- **0 — Fail**: Proposal fails to address the criterion or cannot be assessed due to missing or incomplete information.\n- **1 — Poor**: The criterion is inadequately addressed, or there are serious inherent weaknesses.\n- **2 — Fair**: The proposal broadly addresses the criterion, but there are significant weaknesses.\n- **3 — Good**: The proposal addresses the criterion well, but a number of shortcomings are present.\n- **4 — Very Good**: The proposal addresses the criterion very well, but a small number of shortcomings are present.\n- **5 — Excellent**: The proposal successfully addresses all relevant aspects of the criterion. Any shortcomings are minor.';
BEGIN
  SELECT id INTO ria_id FROM public.instrument_types WHERE code = 'ria';
  SELECT id INTO ia_id  FROM public.instrument_types WHERE code = 'ia';
  SELECT id INTO csa_id FROM public.instrument_types WHERE code = 'csa';

  -- RIA
  INSERT INTO public.evaluation_criteria (instrument_id, criterion_name, criterion_order, sub_criteria, scoring_descriptors, threshold_full, threshold_stage1, applicable_stages, weighting)
  VALUES
    (ria_id, 'Excellence',     1, excellence_sub_ria, scoring_descriptors_default, 3.0, 4.0, ARRAY['stage1','full'], 1.0),
    (ria_id, 'Impact',         2, impact_sub_ria,     scoring_descriptors_default, 3.0, 4.0, ARRAY['stage1','full'], 1.0),
    (ria_id, 'Implementation', 3, impl_sub_ria,       scoring_descriptors_default, 3.0, NULL, ARRAY['full'],          1.0);

  -- IA (Impact weighting 1.5 lives on instrument; criterion weighting still 1.0)
  INSERT INTO public.evaluation_criteria (instrument_id, criterion_name, criterion_order, sub_criteria, scoring_descriptors, threshold_full, threshold_stage1, applicable_stages, weighting)
  VALUES
    (ia_id, 'Excellence',     1, excellence_sub_ia, scoring_descriptors_default, 3.0, 4.0, ARRAY['stage1','full'], 1.0),
    (ia_id, 'Impact',         2, impact_sub_ia,     scoring_descriptors_default, 3.0, 4.0, ARRAY['stage1','full'], 1.0),
    (ia_id, 'Implementation', 3, impl_sub_ia,       scoring_descriptors_default, 3.0, NULL, ARRAY['full'],          1.0);

  -- CSA
  INSERT INTO public.evaluation_criteria (instrument_id, criterion_name, criterion_order, sub_criteria, scoring_descriptors, threshold_full, threshold_stage1, applicable_stages, weighting)
  VALUES
    (csa_id, 'Excellence',     1, excellence_sub_csa, scoring_descriptors_default, 3.0, NULL, ARRAY['full'], 1.0),
    (csa_id, 'Impact',         2, impact_sub_csa,     scoring_descriptors_default, 3.0, NULL, ARRAY['full'], 1.0),
    (csa_id, 'Implementation', 3, impl_sub_csa,       scoring_descriptors_default, 3.0, NULL, ARRAY['full'], 1.0);
END $$;

-- ============================================================
-- PART 1.4: evaluator_personas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.evaluator_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_number serial,
  name text NOT NULL,
  brief text NOT NULL,
  thematic_area text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users,
  active boolean DEFAULT true
);

ALTER TABLE public.evaluator_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view evaluator personas"
  ON public.evaluator_personas FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins/owners can insert evaluator personas"
  ON public.evaluator_personas FOR INSERT
  TO authenticated
  WITH CHECK (public.is_global_admin(auth.uid()));

CREATE POLICY "Admins/owners can update evaluator personas"
  ON public.evaluator_personas FOR UPDATE
  TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE POLICY "Admins/owners can delete evaluator personas"
  ON public.evaluator_personas FOR DELETE
  TO authenticated
  USING (public.is_global_admin(auth.uid()));

-- Seed 44 evaluator personas (placeholders; full briefs editable later via admin UI)
INSERT INTO public.evaluator_personas (name, brief, thematic_area) VALUES
  ('Dr. Anya Sharma',         'Senior climate adaptation researcher with 20 years of EU-funded project experience.', 'Climate & Environment'),
  ('Prof. Marco Bianchi',     'Renewable energy systems expert focused on grid integration and storage.',          'Climate & Environment'),
  ('Dr. Elena Petrova',       'Circular economy and industrial symbiosis specialist.',                              'Climate & Environment'),
  ('Dr. Henrik Larsen',       'Marine biodiversity and ocean governance researcher.',                               'Climate & Environment'),
  ('Dr. Fatima El-Sayed',     'Agricultural sustainability and food systems policy expert.',                        'Climate & Environment'),
  ('Prof. Liam O''Connor',    'Hydrogen technology and decarbonisation industrial researcher.',                     'Climate & Environment'),
  ('Dr. Yuki Tanaka',         'Earth observation and climate modelling scientist.',                                 'Climate & Environment'),
  ('Dr. Sofia Rossi',         'Public health epidemiologist specialising in non-communicable diseases.',            'Health'),
  ('Prof. David Klein',       'Translational medicine and clinical trials methodology expert.',                     'Health'),
  ('Dr. Aisha Mohammed',      'Mental health services researcher with focus on digital interventions.',             'Health'),
  ('Dr. Lars Andersson',      'Antimicrobial resistance and infectious disease specialist.',                        'Health'),
  ('Prof. Nadia Haddad',      'Personalised medicine and genomics researcher.',                                     'Health'),
  ('Dr. Emma Schmidt',        'Health systems and health economics evaluator.',                                     'Health'),
  ('Dr. Rajesh Kumar',        'Medical devices and health technology assessment specialist.',                       'Health'),
  ('Prof. Isabella Fernandez','AI safety and machine learning systems researcher.',                                 'Digital & Industry'),
  ('Dr. Kenji Watanabe',      'Quantum computing hardware and algorithms expert.',                                  'Digital & Industry'),
  ('Dr. Anika Verma',         'Cybersecurity and privacy-preserving technologies researcher.',                      'Digital & Industry'),
  ('Prof. Olaf Jensen',       'Advanced manufacturing and Industry 4.0 specialist.',                                'Digital & Industry'),
  ('Dr. Mei Lin',             'Robotics and autonomous systems researcher.',                                        'Digital & Industry'),
  ('Dr. Stefano Greco',       'Photonics and semiconductor materials expert.',                                      'Digital & Industry'),
  ('Dr. Hannah Becker',       'Human-computer interaction and accessibility researcher.',                           'Digital & Industry'),
  ('Prof. Pierre Dubois',     'Social sciences researcher on European integration and democratic governance.',      'Society & Culture'),
  ('Dr. Maria Costa',         'Migration and inclusion policy expert.',                                             'Society & Culture'),
  ('Dr. Thomas Müller',       'Cultural heritage and digital humanities scholar.',                                  'Society & Culture'),
  ('Dr. Helena Novak',        'Education innovation and lifelong learning researcher.',                             'Society & Culture'),
  ('Prof. Adebayo Okafor',    'Gender studies and intersectionality researcher.',                                   'Society & Culture'),
  ('Dr. Ingrid Lindqvist',    'Behavioural science and public policy expert.',                                      'Society & Culture'),
  ('Dr. Carlos Mendes',       'Smart cities and urban mobility researcher.',                                        'Mobility & Cities'),
  ('Prof. Julia Kovač',       'Transport electrification and battery technology expert.',                           'Mobility & Cities'),
  ('Dr. Martin Weiss',        'Aviation decarbonisation and sustainable fuels specialist.',                         'Mobility & Cities'),
  ('Dr. Priya Iyer',          'Logistics, supply chain and freight transport researcher.',                          'Mobility & Cities'),
  ('Dr. Andreas Papadopoulos','Maritime transport and port operations expert.',                                     'Mobility & Cities'),
  ('Dr. Beatrice Lefèvre',    'Space technology and satellite applications researcher.',                            'Space & Security'),
  ('Prof. Viktor Ivanov',     'Civil security and disaster resilience specialist.',                                 'Space & Security'),
  ('Dr. Sara Khoury',         'Critical infrastructure protection expert.',                                         'Space & Security'),
  ('Dr. Felix Werner',        'Defence research and dual-use technologies analyst.',                                'Space & Security'),
  ('Dr. Léa Garnier',         'Innovation policy and SME support specialist.',                                      'Innovation & Economy'),
  ('Prof. Roberto Marchetti', 'Industrial policy and competitiveness researcher.',                                  'Innovation & Economy'),
  ('Dr. Paula Krause',        'Open science, research data and reproducibility expert.',                            'Innovation & Economy'),
  ('Dr. Mateo Silva',         'Technology transfer and intellectual property analyst.',                             'Innovation & Economy'),
  ('Dr. Camille Roux',        'Citizen science and responsible research and innovation researcher.',                'Innovation & Economy'),
  ('Prof. Heinrich Bauer',    'Bioeconomy and biorefinery technologies expert.',                                    'Bioeconomy & Food'),
  ('Dr. Lucia Moretti',       'Plant breeding and crop resilience scientist.',                                      'Bioeconomy & Food'),
  ('Dr. Johan Nilsson',       'Forestry and sustainable land use researcher.',                                      'Bioeconomy & Food')
ON CONFLICT DO NOTHING;

-- ============================================================
-- PART 1.5: ai_platform_config
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  display_name text,
  notes text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users
);

ALTER TABLE public.ai_platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view AI platform config"
  ON public.ai_platform_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins/owners can insert AI platform config"
  ON public.ai_platform_config FOR INSERT
  TO authenticated
  WITH CHECK (public.is_global_admin(auth.uid()));

CREATE POLICY "Admins/owners can update AI platform config"
  ON public.ai_platform_config FOR UPDATE
  TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE POLICY "Admins/owners can delete AI platform config"
  ON public.ai_platform_config FOR DELETE
  TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE TRIGGER update_ai_platform_config_updated_at
  BEFORE UPDATE ON public.ai_platform_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ai_platform_config (key, value, display_name) VALUES
  ('evaluation_model',             'claude-opus-4-7',           'Claude Opus 4.7'),
  ('eligibility_model',            'claude-haiku-4-5-20251001', 'Claude Haiku 4.5'),
  ('assembly_model',               'claude-haiku-4-5-20251001', 'Claude Haiku 4.5'),
  ('persona_creation_model',       'claude-haiku-4-5-20251001', 'Claude Haiku 4.5'),
  ('opus_price_input_per_mtok',    '5.00',                      'Opus input USD/M tokens'),
  ('opus_price_output_per_mtok',   '25.00',                     'Opus output USD/M tokens'),
  ('haiku_price_input_per_mtok',   '0.80',                      'Haiku input USD/M tokens'),
  ('haiku_price_output_per_mtok',  '4.00',                      'Haiku output USD/M tokens'),
  ('cache_read_multiplier',        '0.10',                      'Cache read cost multiplier'),
  ('usd_eur_rate',                 '0.92',                      'USD to EUR rate')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- PART 1.6: evaluation_cost_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.evaluation_cost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid REFERENCES public.proposal_analyses(id) ON DELETE CASCADE,
  instrument_code text,
  proposal_stage text,
  budget_type text,
  cost_usd numeric(8,4),
  cost_eur numeric(8,4),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.evaluation_cost_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/owners can view cost log"
  ON public.evaluation_cost_log FOR SELECT
  TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE POLICY "Authenticated users can insert cost log"
  ON public.evaluation_cost_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
