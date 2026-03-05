
-- Create feedback table
CREATE TABLE public.feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('feature_request', 'bug_report')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  ai_analysis TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own feedback
CREATE POLICY "Users can read own feedback" ON public.feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_owner(auth.uid()));

-- Owners can update feedback (status, ai_analysis)
CREATE POLICY "Owners can update feedback" ON public.feedback
  FOR UPDATE TO authenticated
  USING (public.is_owner(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback;

-- Trigger for updated_at
CREATE TRIGGER update_feedback_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to notify owners on new feedback
CREATE OR REPLACE FUNCTION public.notify_owners_on_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  owner_record RECORD;
  submitter_email TEXT;
  cat_label TEXT;
BEGIN
  -- Get submitter email
  SELECT email INTO submitter_email FROM public.profiles WHERE id = NEW.user_id;
  
  -- Category label
  cat_label := CASE WHEN NEW.category = 'feature_request' THEN 'Feature request' ELSE 'Bug report' END;

  -- Notify all owners
  FOR owner_record IN
    SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'owner' AND proposal_id IS NULL
  LOOP
    INSERT INTO public.notifications (user_id, proposal_id, type, title, message, metadata)
    VALUES (
      owner_record.user_id,
      '00000000-0000-0000-0000-000000000000',
      'mention',
      cat_label || ': ' || NEW.title,
      'Submitted by ' || COALESCE(submitter_email, 'unknown user'),
      jsonb_build_object('source', 'feedback', 'feedback_id', NEW.id, 'category', NEW.category)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_owners_feedback
  AFTER INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.notify_owners_on_feedback();
