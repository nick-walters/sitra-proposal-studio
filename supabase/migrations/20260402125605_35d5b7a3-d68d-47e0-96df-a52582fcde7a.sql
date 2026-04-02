
-- Create b31_tasks table (independent from wp_draft_tasks)
CREATE TABLE public.b31_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wp_draft_id uuid REFERENCES public.wp_drafts(id) ON DELETE CASCADE NOT NULL,
  number integer NOT NULL,
  title text,
  description text,
  lead_participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  start_month integer,
  end_month integer,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create b31_task_participants table
CREATE TABLE public.b31_task_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.b31_tasks(id) ON DELETE CASCADE NOT NULL,
  participant_id uuid REFERENCES public.participants(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(task_id, participant_id)
);

-- Enable RLS
ALTER TABLE public.b31_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b31_task_participants ENABLE ROW LEVEL SECURITY;

-- RLS for b31_tasks: users who can edit the proposal
CREATE POLICY "Users can view b31_tasks for their proposals" ON public.b31_tasks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.wp_drafts wd
    JOIN public.proposals p ON p.id = wd.proposal_id
    WHERE wd.id = b31_tasks.wp_draft_id
    AND public.has_any_proposal_role(auth.uid(), p.id)
  ));

CREATE POLICY "Users can insert b31_tasks for their proposals" ON public.b31_tasks
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.wp_drafts wd
    JOIN public.proposals p ON p.id = wd.proposal_id
    WHERE wd.id = b31_tasks.wp_draft_id
    AND public.can_edit_proposal(auth.uid(), p.id)
  ));

CREATE POLICY "Users can update b31_tasks for their proposals" ON public.b31_tasks
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.wp_drafts wd
    JOIN public.proposals p ON p.id = wd.proposal_id
    WHERE wd.id = b31_tasks.wp_draft_id
    AND public.can_edit_proposal(auth.uid(), p.id)
  ));

CREATE POLICY "Users can delete b31_tasks for their proposals" ON public.b31_tasks
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.wp_drafts wd
    JOIN public.proposals p ON p.id = wd.proposal_id
    WHERE wd.id = b31_tasks.wp_draft_id
    AND public.can_edit_proposal(auth.uid(), p.id)
  ));

-- RLS for b31_task_participants
CREATE POLICY "Users can view b31_task_participants" ON public.b31_task_participants
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.b31_tasks bt
    JOIN public.wp_drafts wd ON wd.id = bt.wp_draft_id
    JOIN public.proposals p ON p.id = wd.proposal_id
    WHERE bt.id = b31_task_participants.task_id
    AND public.has_any_proposal_role(auth.uid(), p.id)
  ));

CREATE POLICY "Users can insert b31_task_participants" ON public.b31_task_participants
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.b31_tasks bt
    JOIN public.wp_drafts wd ON wd.id = bt.wp_draft_id
    JOIN public.proposals p ON p.id = wd.proposal_id
    WHERE bt.id = b31_task_participants.task_id
    AND public.can_edit_proposal(auth.uid(), p.id)
  ));

CREATE POLICY "Users can update b31_task_participants" ON public.b31_task_participants
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.b31_tasks bt
    JOIN public.wp_drafts wd ON wd.id = bt.wp_draft_id
    JOIN public.proposals p ON p.id = wd.proposal_id
    WHERE bt.id = b31_task_participants.task_id
    AND public.can_edit_proposal(auth.uid(), p.id)
  ));

CREATE POLICY "Users can delete b31_task_participants" ON public.b31_task_participants
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.b31_tasks bt
    JOIN public.wp_drafts wd ON wd.id = bt.wp_draft_id
    JOIN public.proposals p ON p.id = wd.proposal_id
    WHERE bt.id = b31_task_participants.task_id
    AND public.can_edit_proposal(auth.uid(), p.id)
  ));

-- Trigger to update updated_at
CREATE TRIGGER b31_tasks_updated_at BEFORE UPDATE ON public.b31_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to create 3 default b31_tasks when a wp_draft is created
CREATE OR REPLACE FUNCTION public.initialize_b31_tasks()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.b31_tasks (wp_draft_id, number, order_index)
  VALUES
    (NEW.id, 1, 0),
    (NEW.id, 2, 1),
    (NEW.id, 3, 2);
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_default_b31_tasks
  AFTER INSERT ON public.wp_drafts
  FOR EACH ROW EXECUTE FUNCTION public.initialize_b31_tasks();

-- Initialize 3 empty b31_tasks for all existing wp_drafts that don't have them yet
INSERT INTO public.b31_tasks (wp_draft_id, number, order_index)
SELECT wd.id, n, n - 1
FROM public.wp_drafts wd
CROSS JOIN generate_series(1, 3) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.b31_tasks bt WHERE bt.wp_draft_id = wd.id
);
