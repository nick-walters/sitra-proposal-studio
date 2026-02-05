-- Create table for storing tracked changes per section
CREATE TABLE public.section_tracked_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  change_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('insertion', 'deletion')),
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_color TEXT NOT NULL DEFAULT '#3B82F6',
  from_pos INTEGER NOT NULL,
  to_pos INTEGER NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, section_id, change_id)
);

-- Enable RLS
ALTER TABLE public.section_tracked_changes ENABLE ROW LEVEL SECURITY;

-- Create index for efficient lookups
CREATE INDEX idx_section_tracked_changes_proposal_section 
  ON public.section_tracked_changes(proposal_id, section_id);

-- RLS Policies: Users can view changes in proposals they have access to
-- For now, allow authenticated users to view/manage changes
CREATE POLICY "Users can view tracked changes"
  ON public.section_tracked_changes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create tracked changes"
  ON public.section_tracked_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update tracked changes"
  ON public.section_tracked_changes
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Users can delete tracked changes"
  ON public.section_tracked_changes
  FOR DELETE
  TO authenticated
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_section_tracked_changes_updated_at
  BEFORE UPDATE ON public.section_tracked_changes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();