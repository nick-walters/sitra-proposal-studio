
-- Create workspace-level snippets library
CREATE TABLE public.snippet_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  tags TEXT[] DEFAULT '{}',
  section_ids TEXT[] DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.snippet_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all snippets"
  ON public.snippet_library FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create snippets"
  ON public.snippet_library FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own snippets"
  ON public.snippet_library FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own snippets"
  ON public.snippet_library FOR DELETE
  USING (auth.uid() = created_by);

CREATE TRIGGER update_snippet_library_updated_at
  BEFORE UPDATE ON public.snippet_library
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create section reviews for collaborative review mode
CREATE TABLE public.section_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  reviewer_id UUID NOT NULL,
  score INTEGER CHECK (score >= 1 AND score <= 5),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'needs_revision', 'rejected')),
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, section_id, reviewer_id)
);

ALTER TABLE public.section_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with proposal access can view reviews"
  ON public.section_reviews FOR SELECT
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Users with proposal access can create reviews"
  ON public.section_reviews FOR INSERT
  WITH CHECK (public.has_any_proposal_role(auth.uid(), proposal_id) AND auth.uid() = reviewer_id);

CREATE POLICY "Reviewers can update their own reviews"
  ON public.section_reviews FOR UPDATE
  USING (auth.uid() = reviewer_id);

CREATE POLICY "Admins can delete reviews"
  ON public.section_reviews FOR DELETE
  USING (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE TRIGGER update_section_reviews_updated_at
  BEFORE UPDATE ON public.section_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for section_reviews
ALTER PUBLICATION supabase_realtime ADD TABLE public.section_reviews;
