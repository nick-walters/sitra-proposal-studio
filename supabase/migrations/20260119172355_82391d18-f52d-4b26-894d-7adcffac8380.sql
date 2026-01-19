-- Create function to update timestamps if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table for figures/diagrams
CREATE TABLE public.figures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  figure_number TEXT NOT NULL,
  section_id TEXT NOT NULL,
  title TEXT NOT NULL,
  figure_type TEXT NOT NULL DEFAULT 'custom',
  content JSONB,
  caption TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for figure references in section content
CREATE TABLE public.figure_references (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_content_id UUID NOT NULL REFERENCES public.section_content(id) ON DELETE CASCADE,
  figure_id UUID NOT NULL REFERENCES public.figures(id) ON DELETE CASCADE,
  position_in_text INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.figures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.figure_references ENABLE ROW LEVEL SECURITY;

-- RLS policies for figures
CREATE POLICY "Users can view figures" ON public.figures 
  FOR SELECT USING (has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Editors can manage figures" ON public.figures 
  FOR ALL USING (can_edit_proposal(auth.uid(), proposal_id));

-- RLS policies for figure references
CREATE POLICY "Users can view figure references" ON public.figure_references 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM section_content sc 
      WHERE sc.id = figure_references.section_content_id 
      AND has_any_proposal_role(auth.uid(), sc.proposal_id)
    )
  );

CREATE POLICY "Editors can manage figure references" ON public.figure_references 
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM section_content sc 
      WHERE sc.id = figure_references.section_content_id 
      AND can_edit_proposal(auth.uid(), sc.proposal_id)
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER update_figures_updated_at
  BEFORE UPDATE ON public.figures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();