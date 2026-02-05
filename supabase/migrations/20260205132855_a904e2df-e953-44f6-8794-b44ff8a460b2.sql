-- Create b31_deliverables table for Section 3.1c
CREATE TABLE public.b31_deliverables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  number TEXT NOT NULL, -- e.g. "D1.1"
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  wp_number INTEGER, -- single WP reference
  lead_participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  type TEXT, -- R, DEM, DEC, DATA, DMP, ETHICS, SECURITY, OTHER
  dissemination_level TEXT, -- PU, SEN, EU-RES, EU-CON, EU-SEC
  due_month INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.b31_deliverables ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view deliverables for proposals they have access to"
ON public.b31_deliverables FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = b31_deliverables.proposal_id
  )
);

CREATE POLICY "Users can insert deliverables"
ON public.b31_deliverables FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = b31_deliverables.proposal_id
  )
);

CREATE POLICY "Users can update deliverables"
ON public.b31_deliverables FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = b31_deliverables.proposal_id
  )
);

CREATE POLICY "Users can delete deliverables"
ON public.b31_deliverables FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = b31_deliverables.proposal_id
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_b31_deliverables_updated_at
BEFORE UPDATE ON public.b31_deliverables
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();