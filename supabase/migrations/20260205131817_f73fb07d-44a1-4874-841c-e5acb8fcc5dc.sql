-- Create b31_milestones table for interactive milestone editing
CREATE TABLE public.b31_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  wps TEXT NOT NULL DEFAULT '',
  due_month INTEGER,
  means_of_verification TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create b31_risks table for interactive risk editing
CREATE TABLE public.b31_risks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  wps TEXT NOT NULL DEFAULT '',
  likelihood TEXT CHECK (likelihood IN ('L', 'M', 'H')),
  severity TEXT CHECK (severity IN ('L', 'M', 'H')),
  mitigation TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.b31_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b31_risks ENABLE ROW LEVEL SECURITY;

-- RLS policies for milestones
CREATE POLICY "Users can view milestones for proposals they have access to"
ON public.b31_milestones FOR SELECT
USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Users can insert milestones for proposals they can edit"
ON public.b31_milestones FOR INSERT
WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users can update milestones for proposals they can edit"
ON public.b31_milestones FOR UPDATE
USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users can delete milestones for proposals they can edit"
ON public.b31_milestones FOR DELETE
USING (public.can_edit_proposal(auth.uid(), proposal_id));

-- RLS policies for risks
CREATE POLICY "Users can view risks for proposals they have access to"
ON public.b31_risks FOR SELECT
USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Users can insert risks for proposals they can edit"
ON public.b31_risks FOR INSERT
WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users can update risks for proposals they can edit"
ON public.b31_risks FOR UPDATE
USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users can delete risks for proposals they can edit"
ON public.b31_risks FOR DELETE
USING (public.can_edit_proposal(auth.uid(), proposal_id));

-- Triggers for updated_at
CREATE TRIGGER update_b31_milestones_updated_at
BEFORE UPDATE ON public.b31_milestones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_b31_risks_updated_at
BEFORE UPDATE ON public.b31_risks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();