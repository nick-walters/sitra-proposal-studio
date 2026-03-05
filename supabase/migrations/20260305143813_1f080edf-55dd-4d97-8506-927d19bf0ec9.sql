
-- Create feedback_comments table
CREATE TABLE public.feedback_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback_id UUID NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;

-- Policy: feedback submitter and owners can view comments
CREATE POLICY "Feedback participants can view comments"
  ON public.feedback_comments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.feedback f WHERE f.id = feedback_id AND f.user_id = auth.uid()
    )
  );

-- Policy: authenticated users can insert comments (submitter or owner)
CREATE POLICY "Feedback participants can insert comments"
  ON public.feedback_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.is_owner(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.feedback f WHERE f.id = feedback_id AND f.user_id = auth.uid()
      )
    )
  );

-- Policy: users can delete their own comments, owners can delete any
CREATE POLICY "Users can delete own comments, owners can delete any"
  ON public.feedback_comments FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_owner(auth.uid())
  );

-- Add 'declined' to feedback status options (currently uses text, no enum constraint)
-- Update feedback RLS: submitter can view own, owners can view all
-- First drop existing policies on feedback
DROP POLICY IF EXISTS "Users can insert feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users can view own feedback" ON public.feedback;
DROP POLICY IF EXISTS "Owners can view all feedback" ON public.feedback;
DROP POLICY IF EXISTS "Owners can update feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users can view feedback" ON public.feedback;
DROP POLICY IF EXISTS "Feedback select policy" ON public.feedback;
DROP POLICY IF EXISTS "Feedback insert policy" ON public.feedback;
DROP POLICY IF EXISTS "Feedback update policy" ON public.feedback;
DROP POLICY IF EXISTS "Feedback delete policy" ON public.feedback;

-- Recreate feedback policies
CREATE POLICY "feedback_select"
  ON public.feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_owner(auth.uid()));

CREATE POLICY "feedback_insert"
  ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "feedback_update"
  ON public.feedback FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_owner(auth.uid()));

CREATE POLICY "feedback_delete"
  ON public.feedback FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_owner(auth.uid()));

-- Enable realtime for feedback_comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_comments;
