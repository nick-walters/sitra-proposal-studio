-- Create section_versions table for page-specific version history
CREATE TABLE public.section_versions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    version_number INTEGER NOT NULL DEFAULT 1,
    is_auto_save BOOLEAN DEFAULT true
);

-- Create index for efficient queries
CREATE INDEX idx_section_versions_lookup ON public.section_versions(proposal_id, section_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.section_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users with any role on the proposal can view versions
CREATE POLICY "Users can view section versions for their proposals"
ON public.section_versions FOR SELECT
USING (public.has_any_proposal_role(auth.uid(), proposal_id));

-- Users who can edit can create versions
CREATE POLICY "Editors can create section versions"
ON public.section_versions FOR INSERT
WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

-- Enable realtime for section_versions
ALTER PUBLICATION supabase_realtime ADD TABLE public.section_versions;