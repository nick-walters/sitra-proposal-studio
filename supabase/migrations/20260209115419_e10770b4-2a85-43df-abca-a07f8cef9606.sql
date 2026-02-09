
-- Add structured address fields to participants
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS town text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS departments_not_applicable boolean DEFAULT false;

-- Migrate existing address data into street field as fallback
UPDATE public.participants SET street = address WHERE address IS NOT NULL AND street IS NULL;

-- Create departments table
CREATE TABLE public.participant_departments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  department_name text NOT NULL,
  street text,
  town text,
  postcode text,
  country text,
  same_as_organisation boolean DEFAULT false,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.participant_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view departments for accessible proposals"
  ON public.participant_departments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_departments.participant_id
        AND has_any_proposal_role(auth.uid(), p.proposal_id)
    )
  );

CREATE POLICY "Users can manage departments for editable proposals"
  ON public.participant_departments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_departments.participant_id
        AND can_edit_proposal(auth.uid(), p.proposal_id)
    )
  );

CREATE TRIGGER update_participant_departments_updated_at
  BEFORE UPDATE ON public.participant_departments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
