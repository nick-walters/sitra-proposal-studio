-- Create table for frequently used/common figures
CREATE TABLE public.common_figures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  figure_type TEXT NOT NULL DEFAULT 'image',
  content JSONB,
  category TEXT,
  tags TEXT[],
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.common_figures ENABLE ROW LEVEL SECURITY;

-- Anyone can view common figures
CREATE POLICY "Anyone can view common figures"
  ON public.common_figures
  FOR SELECT
  USING (true);

-- Only owners can manage common figures
CREATE POLICY "Owners can manage common figures"
  ON public.common_figures
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'owner'::app_role
  ));

-- Create index for faster lookups
CREATE INDEX idx_common_figures_category ON public.common_figures(category);
CREATE INDEX idx_common_figures_tags ON public.common_figures USING GIN(tags);