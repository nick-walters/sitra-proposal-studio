-- ============================================
-- Part A2 Enhanced Participant Details Schema
-- ============================================

-- 1. Update participants table with enhanced main contact and GEP fields
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS main_contact_first_name TEXT,
  ADD COLUMN IF NOT EXISTS main_contact_last_name TEXT,
  ADD COLUMN IF NOT EXISTS main_contact_gender TEXT,
  ADD COLUMN IF NOT EXISTS main_contact_street TEXT,
  ADD COLUMN IF NOT EXISTS main_contact_town TEXT,
  ADD COLUMN IF NOT EXISTS main_contact_postcode TEXT,
  ADD COLUMN IF NOT EXISTS main_contact_country TEXT,
  ADD COLUMN IF NOT EXISTS use_organisation_address BOOLEAN DEFAULT true,
  -- GEP building blocks
  ADD COLUMN IF NOT EXISTS gep_publication BOOLEAN,
  ADD COLUMN IF NOT EXISTS gep_dedicated_resources BOOLEAN,
  ADD COLUMN IF NOT EXISTS gep_data_collection BOOLEAN,
  ADD COLUMN IF NOT EXISTS gep_training BOOLEAN,
  -- GEP content areas
  ADD COLUMN IF NOT EXISTS gep_work_life_balance BOOLEAN,
  ADD COLUMN IF NOT EXISTS gep_gender_leadership BOOLEAN,
  ADD COLUMN IF NOT EXISTS gep_recruitment_progression BOOLEAN,
  ADD COLUMN IF NOT EXISTS gep_research_teaching BOOLEAN,
  ADD COLUMN IF NOT EXISTS gep_gender_violence BOOLEAN;

-- 2. Create participant_researchers table
CREATE TABLE IF NOT EXISTS public.participant_researchers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  title TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT,
  nationality TEXT,
  email TEXT,
  career_stage TEXT,
  role_in_project TEXT,
  reference_identifier TEXT,
  identifier_type TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Create participant_organisation_roles table
CREATE TABLE IF NOT EXISTS public.participant_organisation_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  role_type TEXT NOT NULL,
  other_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Create participant_achievements table
CREATE TABLE IF NOT EXISTS public.participant_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL,
  description TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Create participant_previous_projects table
CREATE TABLE IF NOT EXISTS public.participant_previous_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Create participant_infrastructure table
CREATE TABLE IF NOT EXISTS public.participant_infrastructure (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Create participant_dependencies table
CREATE TABLE IF NOT EXISTS public.participant_dependencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  linked_participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  link_type TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.participant_researchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participant_organisation_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participant_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participant_previous_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participant_infrastructure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participant_dependencies ENABLE ROW LEVEL SECURITY;

-- RLS Policies using existing helper functions (via participant->proposal lookup)
-- participant_researchers
CREATE POLICY "Users can view researchers for accessible proposals"
  ON public.participant_researchers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_researchers.participant_id
      AND has_any_proposal_role(auth.uid(), p.proposal_id)
    )
  );

CREATE POLICY "Users can manage researchers for editable proposals"
  ON public.participant_researchers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_researchers.participant_id
      AND can_edit_proposal(auth.uid(), p.proposal_id)
    )
  );

-- participant_organisation_roles
CREATE POLICY "Users can view org roles for accessible proposals"
  ON public.participant_organisation_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_organisation_roles.participant_id
      AND has_any_proposal_role(auth.uid(), p.proposal_id)
    )
  );

CREATE POLICY "Users can manage org roles for editable proposals"
  ON public.participant_organisation_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_organisation_roles.participant_id
      AND can_edit_proposal(auth.uid(), p.proposal_id)
    )
  );

-- participant_achievements
CREATE POLICY "Users can view achievements for accessible proposals"
  ON public.participant_achievements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_achievements.participant_id
      AND has_any_proposal_role(auth.uid(), p.proposal_id)
    )
  );

CREATE POLICY "Users can manage achievements for editable proposals"
  ON public.participant_achievements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_achievements.participant_id
      AND can_edit_proposal(auth.uid(), p.proposal_id)
    )
  );

-- participant_previous_projects
CREATE POLICY "Users can view projects for accessible proposals"
  ON public.participant_previous_projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_previous_projects.participant_id
      AND has_any_proposal_role(auth.uid(), p.proposal_id)
    )
  );

CREATE POLICY "Users can manage projects for editable proposals"
  ON public.participant_previous_projects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_previous_projects.participant_id
      AND can_edit_proposal(auth.uid(), p.proposal_id)
    )
  );

-- participant_infrastructure
CREATE POLICY "Users can view infrastructure for accessible proposals"
  ON public.participant_infrastructure FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_infrastructure.participant_id
      AND has_any_proposal_role(auth.uid(), p.proposal_id)
    )
  );

CREATE POLICY "Users can manage infrastructure for editable proposals"
  ON public.participant_infrastructure FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_infrastructure.participant_id
      AND can_edit_proposal(auth.uid(), p.proposal_id)
    )
  );

-- participant_dependencies
CREATE POLICY "Users can view dependencies for accessible proposals"
  ON public.participant_dependencies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_dependencies.participant_id
      AND has_any_proposal_role(auth.uid(), p.proposal_id)
    )
  );

CREATE POLICY "Users can manage dependencies for editable proposals"
  ON public.participant_dependencies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_dependencies.participant_id
      AND can_edit_proposal(auth.uid(), p.proposal_id)
    )
  );

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_participant_researchers_participant ON public.participant_researchers(participant_id);
CREATE INDEX IF NOT EXISTS idx_participant_organisation_roles_participant ON public.participant_organisation_roles(participant_id);
CREATE INDEX IF NOT EXISTS idx_participant_achievements_participant ON public.participant_achievements(participant_id);
CREATE INDEX IF NOT EXISTS idx_participant_previous_projects_participant ON public.participant_previous_projects(participant_id);
CREATE INDEX IF NOT EXISTS idx_participant_infrastructure_participant ON public.participant_infrastructure(participant_id);
CREATE INDEX IF NOT EXISTS idx_participant_dependencies_participant ON public.participant_dependencies(participant_id);

-- Add updated_at triggers
CREATE OR REPLACE TRIGGER update_participant_researchers_updated_at
  BEFORE UPDATE ON public.participant_researchers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_participant_achievements_updated_at
  BEFORE UPDATE ON public.participant_achievements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_participant_previous_projects_updated_at
  BEFORE UPDATE ON public.participant_previous_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_participant_infrastructure_updated_at
  BEFORE UPDATE ON public.participant_infrastructure
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();