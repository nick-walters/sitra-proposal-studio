-- Create wp_themes table for grouping work packages by color theme
CREATE TABLE public.wp_themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  short_name TEXT,
  name TEXT,
  color TEXT NOT NULL DEFAULT '#2563EB',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add theme_id to wp_drafts
ALTER TABLE public.wp_drafts 
ADD COLUMN theme_id UUID REFERENCES public.wp_themes(id) ON DELETE SET NULL;

-- Add use_wp_themes to proposals
ALTER TABLE public.proposals 
ADD COLUMN use_wp_themes BOOLEAN NOT NULL DEFAULT false;

-- Enable RLS on wp_themes
ALTER TABLE public.wp_themes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for wp_themes (using existing helper functions)
CREATE POLICY "Users can view wp_themes"
ON public.wp_themes
FOR SELECT
USING (has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Admins can manage wp_themes"
ON public.wp_themes
FOR ALL
USING (is_proposal_admin(auth.uid(), proposal_id));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_wp_themes_updated_at
BEFORE UPDATE ON public.wp_themes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better query performance
CREATE INDEX idx_wp_themes_proposal_id ON public.wp_themes(proposal_id);
CREATE INDEX idx_wp_drafts_theme_id ON public.wp_drafts(theme_id);