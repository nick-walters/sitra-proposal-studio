-- Create organisations table for storing organisation data
CREATE TABLE public.organisations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  short_name text,
  country text,
  logo_url text,
  pic_number text,
  legal_entity_type text,
  is_sme boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- Everyone can view organisations (for autocomplete)
CREATE POLICY "Anyone can view organisations" 
ON public.organisations 
FOR SELECT 
USING (true);

-- Authenticated users can create organisations
CREATE POLICY "Authenticated users can create organisations" 
ON public.organisations 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Only admins or creator can update
CREATE POLICY "Creator can update organisation" 
ON public.organisations 
FOR UPDATE 
USING (created_by = auth.uid());

-- Create trigger for updated_at
CREATE TRIGGER update_organisations_updated_at
BEFORE UPDATE ON public.organisations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();