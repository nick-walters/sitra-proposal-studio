
-- 1. proposal_messages (without SELECT policy that references recipients)
CREATE TABLE public.proposal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.proposal_messages(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'all',
  is_high_priority boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_messages ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_proposal_messages_updated_at
BEFORE UPDATE ON public.proposal_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.proposal_messages;

-- 2. proposal_message_recipients (create before the SELECT policy)
CREATE TABLE public.proposal_message_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.proposal_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
);

ALTER TABLE public.proposal_message_recipients ENABLE ROW LEVEL SECURITY;

-- 3. Now add all RLS policies for messages
CREATE POLICY "Users with proposal role can read visible messages"
ON public.proposal_messages FOR SELECT TO authenticated
USING (
  public.has_any_proposal_role(auth.uid(), proposal_id)
  AND (
    visibility = 'all'
    OR author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.proposal_message_recipients r
      WHERE r.message_id = id AND r.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users with proposal role can insert messages"
ON public.proposal_messages FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_proposal_role(auth.uid(), proposal_id)
  AND author_id = auth.uid()
);

CREATE POLICY "Author or coordinator can update messages"
ON public.proposal_messages FOR UPDATE TO authenticated
USING (
  author_id = auth.uid()
  OR public.is_proposal_admin(auth.uid(), proposal_id)
);

CREATE POLICY "Author or coordinator can delete messages"
ON public.proposal_messages FOR DELETE TO authenticated
USING (
  author_id = auth.uid()
  OR public.is_proposal_admin(auth.uid(), proposal_id)
);

-- 4. RLS for recipients
CREATE POLICY "Recipients readable by proposal members"
ON public.proposal_message_recipients FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_messages m
    WHERE m.id = message_id
    AND public.has_any_proposal_role(auth.uid(), m.proposal_id)
  )
);

CREATE POLICY "Recipients insertable by message author"
ON public.proposal_message_recipients FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_messages m
    WHERE m.id = message_id AND m.author_id = auth.uid()
  )
);

CREATE POLICY "Recipients deletable by message author or coordinator"
ON public.proposal_message_recipients FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_messages m
    WHERE m.id = message_id
    AND (m.author_id = auth.uid() OR public.is_proposal_admin(auth.uid(), m.proposal_id))
  )
);

-- 5. proposal_tasks
CREATE TABLE public.proposal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text,
  responsible_user_id uuid,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'not_started',
  order_index integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposal members can read tasks"
ON public.proposal_tasks FOR SELECT TO authenticated
USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Coordinators can insert tasks"
ON public.proposal_tasks FOR INSERT TO authenticated
WITH CHECK (
  public.is_proposal_admin(auth.uid(), proposal_id)
  AND created_by = auth.uid()
);

CREATE POLICY "Coordinators can update tasks"
ON public.proposal_tasks FOR UPDATE TO authenticated
USING (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY "Coordinators can delete tasks"
ON public.proposal_tasks FOR DELETE TO authenticated
USING (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE TRIGGER update_proposal_tasks_updated_at
BEFORE UPDATE ON public.proposal_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. proposal_task_assignees
CREATE TABLE public.proposal_task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.proposal_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
);

ALTER TABLE public.proposal_task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignees readable by proposal members"
ON public.proposal_task_assignees FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_tasks t
    WHERE t.id = task_id
    AND public.has_any_proposal_role(auth.uid(), t.proposal_id)
  )
);

CREATE POLICY "Assignees manageable by coordinators"
ON public.proposal_task_assignees FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_tasks t
    WHERE t.id = task_id
    AND public.is_proposal_admin(auth.uid(), t.proposal_id)
  )
);

CREATE POLICY "Assignees deletable by coordinators"
ON public.proposal_task_assignees FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_tasks t
    WHERE t.id = task_id
    AND public.is_proposal_admin(auth.uid(), t.proposal_id)
  )
);

-- 7. proposal_progress
CREATE TABLE public.proposal_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_id text NOT NULL,
  section_label text NOT NULL DEFAULT '',
  progress_percent integer NOT NULL DEFAULT 0,
  notes text,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, section_id)
);

ALTER TABLE public.proposal_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposal members can read progress"
ON public.proposal_progress FOR SELECT TO authenticated
USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Coordinators can insert progress"
ON public.proposal_progress FOR INSERT TO authenticated
WITH CHECK (
  public.is_proposal_admin(auth.uid(), proposal_id)
  AND updated_by = auth.uid()
);

CREATE POLICY "Coordinators can update progress"
ON public.proposal_progress FOR UPDATE TO authenticated
USING (public.is_proposal_admin(auth.uid(), proposal_id));
