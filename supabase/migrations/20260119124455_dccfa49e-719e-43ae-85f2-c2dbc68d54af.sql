-- Create work_packages table for defining project work packages
CREATE TABLE public.work_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  lead_participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  start_month INTEGER DEFAULT 1,
  end_month INTEGER DEFAULT 36,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, number)
);

-- Create member_wp_allocations table for person-months per work package
CREATE TABLE public.member_wp_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.participant_members(id) ON DELETE CASCADE,
  work_package_id UUID NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  person_months NUMERIC NOT NULL DEFAULT 0,
  role TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(member_id, work_package_id)
);

-- Enable RLS
ALTER TABLE public.work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_wp_allocations ENABLE ROW LEVEL SECURITY;

-- RLS policies for work_packages
CREATE POLICY "Users can view work packages"
ON public.work_packages FOR SELECT
USING (has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Editors can manage work packages"
ON public.work_packages FOR ALL
USING (can_edit_proposal(auth.uid(), proposal_id));

-- RLS policies for member_wp_allocations
CREATE POLICY "Users can view allocations"
ON public.member_wp_allocations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.participant_members pm
    JOIN public.participants p ON p.id = pm.participant_id
    WHERE pm.id = member_wp_allocations.member_id
    AND has_any_proposal_role(auth.uid(), p.proposal_id)
  )
);

CREATE POLICY "Editors can manage allocations"
ON public.member_wp_allocations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.participant_members pm
    JOIN public.participants p ON p.id = pm.participant_id
    WHERE pm.id = member_wp_allocations.member_id
    AND can_edit_proposal(auth.uid(), p.proposal_id)
  )
);

-- Triggers for updated_at
CREATE TRIGGER update_work_packages_updated_at
BEFORE UPDATE ON public.work_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_member_wp_allocations_updated_at
BEFORE UPDATE ON public.member_wp_allocations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();