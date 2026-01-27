-- Create a centralized people/contacts table for reusable team member data
CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  default_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster searches (using btree on lower case for case-insensitive)
CREATE INDEX idx_people_full_name ON public.people (lower(full_name));
CREATE INDEX idx_people_email ON public.people (lower(email));

-- Enable RLS
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read people (for autocomplete)
CREATE POLICY "Authenticated users can read people"
ON public.people FOR SELECT
TO authenticated
USING (true);

-- Anyone authenticated can insert new people
CREATE POLICY "Authenticated users can insert people"
ON public.people FOR INSERT
TO authenticated
WITH CHECK (true);

-- Anyone authenticated can update people
CREATE POLICY "Authenticated users can update people"
ON public.people FOR UPDATE
TO authenticated
USING (true);

-- Add person_id to participant_members to link to the centralized people table
ALTER TABLE public.participant_members 
ADD COLUMN person_id UUID REFERENCES public.people(id) ON DELETE SET NULL;

-- Create trigger for updated_at
CREATE TRIGGER update_people_updated_at
BEFORE UPDATE ON public.people
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();