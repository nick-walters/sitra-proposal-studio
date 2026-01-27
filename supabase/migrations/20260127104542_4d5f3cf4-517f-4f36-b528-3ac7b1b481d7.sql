-- Create case_types enum-like table for storing case type definitions
-- Case types: case_study, use_case, living_lab, pilot, demonstration, other

-- Create case_drafts table similar to wp_drafts
CREATE TABLE public.case_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  number integer NOT NULL,
  case_type text NOT NULL DEFAULT 'case_study', -- case_study, use_case, living_lab, pilot, demonstration, other
  custom_type_name text, -- For 'other' type, the custom name
  short_name text,
  title text,
  lead_participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  description text,
  color text NOT NULL DEFAULT '#7C3AED',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, number)
);

-- Add cases_enabled flag to proposals table
ALTER TABLE public.proposals 
ADD COLUMN cases_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN cases_type text; -- The selected case type when enabled

-- Enable RLS
ALTER TABLE public.case_drafts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for case_drafts
CREATE POLICY "Users with proposal access can view case drafts"
  ON public.case_drafts FOR SELECT
  USING (
    public.is_owner(auth.uid()) OR 
    public.has_any_proposal_role(auth.uid(), proposal_id)
  );

CREATE POLICY "Admins/owners can insert case drafts"
  ON public.case_drafts FOR INSERT
  WITH CHECK (
    public.is_owner(auth.uid()) OR 
    public.is_proposal_admin(auth.uid(), proposal_id)
  );

CREATE POLICY "Admins/owners can update case drafts"
  ON public.case_drafts FOR UPDATE
  USING (
    public.is_owner(auth.uid()) OR 
    public.is_proposal_admin(auth.uid(), proposal_id)
  );

CREATE POLICY "Admins/owners can delete case drafts"
  ON public.case_drafts FOR DELETE
  USING (
    public.is_owner(auth.uid()) OR 
    public.is_proposal_admin(auth.uid(), proposal_id)
  );

-- Create updated_at trigger
CREATE TRIGGER update_case_drafts_updated_at
  BEFORE UPDATE ON public.case_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for case_drafts
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_drafts;