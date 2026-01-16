-- Create enums
CREATE TYPE public.proposal_type AS ENUM ('RIA', 'IA', 'CSA', 'OTHER');
CREATE TYPE public.proposal_status AS ENUM ('draft', 'in_review', 'submitted');
CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE public.budget_type AS ENUM ('traditional', 'lump_sum');
CREATE TYPE public.participant_type AS ENUM (
  'beneficiary', 
  'affiliated_entity',
  'associated_partner', 
  'third_party_against_payment',
  'third_party_free_of_charge',
  'subcontractor',
  'international_partner',
  'associated_country_partner'
);

-- Profiles table for user info
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  organisation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Proposals table
CREATE TABLE public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acronym TEXT NOT NULL,
  title TEXT NOT NULL,
  type proposal_type NOT NULL DEFAULT 'RIA',
  status proposal_status NOT NULL DEFAULT 'draft',
  budget_type budget_type NOT NULL DEFAULT 'traditional',
  topic_url TEXT,
  topic_id TEXT,
  total_budget NUMERIC(15,2),
  deadline TIMESTAMPTZ,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- User roles for proposals (separate table as required)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, proposal_id)
);

-- Participant organisations
CREATE TABLE public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  organisation_name TEXT NOT NULL,
  organisation_short_name TEXT,
  organisation_type participant_type NOT NULL DEFAULT 'beneficiary',
  country TEXT,
  logo_url TEXT,
  pic_number TEXT,
  legal_entity_type TEXT,
  is_sme BOOLEAN DEFAULT false,
  participant_number INTEGER,
  contact_email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Participant members (people from each organisation)
CREATE TABLE public.participant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  role_in_project TEXT,
  person_months NUMERIC(5,2),
  is_primary_contact BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Proposal sections content
CREATE TABLE public.section_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  content TEXT DEFAULT '',
  last_edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, section_id)
);

-- References/citations
CREATE TABLE public.references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  citation_number INTEGER NOT NULL,
  doi TEXT,
  authors TEXT[],
  year INTEGER,
  title TEXT NOT NULL,
  journal TEXT,
  volume TEXT,
  pages TEXT,
  formatted_citation TEXT,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, citation_number)
);

-- Section footnotes (linking citations to sections)
CREATE TABLE public.section_footnotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_content_id UUID NOT NULL REFERENCES public.section_content(id) ON DELETE CASCADE,
  reference_id UUID NOT NULL REFERENCES public.references(id) ON DELETE CASCADE,
  position_in_text INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Version history
CREATE TABLE public.versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  description TEXT,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Budget items
CREATE TABLE public.budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  justification TEXT,
  work_package TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ethics self-assessment (shared by all partners)
CREATE TABLE public.ethics_assessment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE UNIQUE,
  human_subjects BOOLEAN DEFAULT false,
  human_subjects_details TEXT,
  personal_data BOOLEAN DEFAULT false,
  personal_data_details TEXT,
  animals BOOLEAN DEFAULT false,
  animals_details TEXT,
  human_cells BOOLEAN DEFAULT false,
  human_cells_details TEXT,
  third_countries BOOLEAN DEFAULT false,
  third_countries_details TEXT,
  environment BOOLEAN DEFAULT false,
  environment_details TEXT,
  dual_use BOOLEAN DEFAULT false,
  dual_use_details TEXT,
  misuse BOOLEAN DEFAULT false,
  misuse_details TEXT,
  other_ethics BOOLEAN DEFAULT false,
  other_ethics_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Part A administrative data
CREATE TABLE public.part_a_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE UNIQUE,
  dependencies TEXT,
  resources TEXT,
  previous_proposals TEXT,
  declarations TEXT,
  additional_info JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_footnotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ethics_assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_a_data ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_proposal_role(_user_id UUID, _proposal_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND proposal_id = _proposal_id
      AND role = _role
  )
$$;

-- Function to check if user has any role on proposal
CREATE OR REPLACE FUNCTION public.has_any_proposal_role(_user_id UUID, _proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND proposal_id = _proposal_id
  )
$$;

-- Function to check if user is admin or editor
CREATE OR REPLACE FUNCTION public.can_edit_proposal(_user_id UUID, _proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND proposal_id = _proposal_id
      AND role IN ('admin', 'editor')
  )
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_proposal_admin(_user_id UUID, _proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND proposal_id = _proposal_id
      AND role = 'admin'
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Proposals policies
CREATE POLICY "Users can view proposals they have access to" ON public.proposals FOR SELECT TO authenticated 
  USING (public.has_any_proposal_role(auth.uid(), id));
CREATE POLICY "Admins can update proposals" ON public.proposals FOR UPDATE TO authenticated 
  USING (public.is_proposal_admin(auth.uid(), id));
CREATE POLICY "Authenticated users can create proposals" ON public.proposals FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins can delete proposals" ON public.proposals FOR DELETE TO authenticated 
  USING (public.is_proposal_admin(auth.uid(), id));

-- User roles policies
CREATE POLICY "Users can view roles for their proposals" ON public.user_roles FOR SELECT TO authenticated 
  USING (public.has_any_proposal_role(auth.uid(), proposal_id) OR user_id = auth.uid());
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated 
  USING (public.is_proposal_admin(auth.uid(), proposal_id));
CREATE POLICY "Users can add themselves when creating proposal" ON public.user_roles FOR INSERT TO authenticated 
  WITH CHECK (user_id = auth.uid());

-- Participants policies
CREATE POLICY "Users can view participants" ON public.participants FOR SELECT TO authenticated 
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Admins and editors can manage participants" ON public.participants FOR ALL TO authenticated 
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

-- Participant members policies
CREATE POLICY "Users can view participant members" ON public.participant_members FOR SELECT TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM public.participants p 
    WHERE p.id = participant_id 
    AND public.has_any_proposal_role(auth.uid(), p.proposal_id)
  ));
CREATE POLICY "Admins and editors can manage participant members" ON public.participant_members FOR ALL TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM public.participants p 
    WHERE p.id = participant_id 
    AND public.can_edit_proposal(auth.uid(), p.proposal_id)
  ));

-- Section content policies
CREATE POLICY "Users can view section content" ON public.section_content FOR SELECT TO authenticated 
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Admins and editors can manage section content" ON public.section_content FOR ALL TO authenticated 
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

-- References policies
CREATE POLICY "Users can view references" ON public.references FOR SELECT TO authenticated 
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Admins and editors can manage references" ON public.references FOR ALL TO authenticated 
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

-- Section footnotes policies
CREATE POLICY "Users can view footnotes" ON public.section_footnotes FOR SELECT TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM public.section_content sc 
    WHERE sc.id = section_content_id 
    AND public.has_any_proposal_role(auth.uid(), sc.proposal_id)
  ));
CREATE POLICY "Admins and editors can manage footnotes" ON public.section_footnotes FOR ALL TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM public.section_content sc 
    WHERE sc.id = section_content_id 
    AND public.can_edit_proposal(auth.uid(), sc.proposal_id)
  ));

-- Versions policies
CREATE POLICY "Users can view versions" ON public.versions FOR SELECT TO authenticated 
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Admins and editors can create versions" ON public.versions FOR INSERT TO authenticated 
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

-- Comments policies
CREATE POLICY "Users can view comments" ON public.comments FOR SELECT TO authenticated 
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Admins and editors can create comments" ON public.comments FOR INSERT TO authenticated 
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id) AND user_id = auth.uid());
CREATE POLICY "Users can update own comments" ON public.comments FOR UPDATE TO authenticated 
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own comments" ON public.comments FOR DELETE TO authenticated 
  USING (user_id = auth.uid());

-- Budget items policies
CREATE POLICY "Users can view budget items" ON public.budget_items FOR SELECT TO authenticated 
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Admins and editors can manage budget items" ON public.budget_items FOR ALL TO authenticated 
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

-- Ethics assessment policies (everyone can edit)
CREATE POLICY "Users can view ethics assessment" ON public.ethics_assessment FOR SELECT TO authenticated 
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "All proposal members can manage ethics" ON public.ethics_assessment FOR ALL TO authenticated 
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

-- Part A data policies (own participant only, admins can edit all)
CREATE POLICY "Users can view part A data" ON public.part_a_data FOR SELECT TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM public.participants p 
    WHERE p.id = participant_id 
    AND public.has_any_proposal_role(auth.uid(), p.proposal_id)
  ));
CREATE POLICY "Users can edit own part A data or admins can edit all" ON public.part_a_data FOR ALL TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM public.participants p 
    JOIN public.participant_members pm ON pm.participant_id = p.id
    WHERE p.id = participant_id 
    AND (pm.user_id = auth.uid() OR public.is_proposal_admin(auth.uid(), p.proposal_id))
  ));

-- Create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_participants_updated_at BEFORE UPDATE ON public.participants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_participant_members_updated_at BEFORE UPDATE ON public.participant_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_section_content_updated_at BEFORE UPDATE ON public.section_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_references_updated_at BEFORE UPDATE ON public.references FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_budget_items_updated_at BEFORE UPDATE ON public.budget_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_ethics_assessment_updated_at BEFORE UPDATE ON public.ethics_assessment FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_part_a_data_updated_at BEFORE UPDATE ON public.part_a_data FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();