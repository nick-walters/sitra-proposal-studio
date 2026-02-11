
-- Phase 1b: Migrate existing proposal-level admins to coordinators
UPDATE public.user_roles SET role = 'coordinator' WHERE role = 'admin' AND proposal_id IS NOT NULL;

-- Phase 1c: Update security-definer functions to recognise coordinator

CREATE OR REPLACE FUNCTION public.can_edit_proposal(_user_id uuid, _proposal_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        (proposal_id = _proposal_id AND role IN ('owner', 'admin', 'coordinator', 'editor'))
        OR
        (proposal_id IS NULL AND role IN ('owner', 'admin'))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_proposal_admin(_user_id uuid, _proposal_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        (proposal_id = _proposal_id AND role IN ('owner', 'admin', 'coordinator'))
        OR
        (proposal_id IS NULL AND role IN ('owner', 'admin'))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_proposal_role(_user_id uuid, _proposal_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        proposal_id = _proposal_id
        OR
        (proposal_id IS NULL AND role IN ('owner', 'admin'))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.create_proposal_with_role(p_acronym text, p_title text, p_type proposal_type, p_budget_type budget_type, p_submission_stage text DEFAULT 'full'::text, p_work_programme text DEFAULT NULL::text, p_destination text DEFAULT NULL::text, p_topic_url text DEFAULT NULL::text, p_deadline timestamp with time zone DEFAULT NULL::timestamp with time zone, p_template_type_id uuid DEFAULT NULL::uuid, p_uses_fstp boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  new_proposal_id uuid;
BEGIN
  INSERT INTO public.proposals (
    acronym, title, type, budget_type, submission_stage, work_programme,
    destination, topic_url, deadline, template_type_id, created_by, status, uses_fstp
  ) VALUES (
    p_acronym, p_title, p_type, p_budget_type, p_submission_stage, p_work_programme,
    p_destination, p_topic_url, p_deadline, p_template_type_id, auth.uid(), 'draft', p_uses_fstp
  )
  RETURNING id INTO new_proposal_id;

  INSERT INTO public.user_roles (user_id, proposal_id, role)
  VALUES (auth.uid(), new_proposal_id, 'coordinator');

  RETURN new_proposal_id;
END;
$$;

-- Phase 1d: Auto-downgrade trigger
CREATE OR REPLACE FUNCTION public.downgrade_editors_on_submit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'submitted' AND OLD.status IS DISTINCT FROM 'submitted' THEN
    UPDATE public.user_roles SET role = 'viewer'
    WHERE proposal_id = NEW.id AND role = 'editor';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

CREATE TRIGGER on_proposal_submit
BEFORE UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.downgrade_editors_on_submit();

-- Phase 1e: RLS policy for Coordinators managing roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Proposal coordinators can manage proposal roles' AND tablename = 'user_roles'
  ) THEN
    EXECUTE 'CREATE POLICY "Proposal coordinators can manage proposal roles"
      ON public.user_roles FOR ALL TO authenticated
      USING (proposal_id IS NOT NULL AND public.is_proposal_admin(auth.uid(), proposal_id))
      WITH CHECK (proposal_id IS NOT NULL AND public.is_proposal_admin(auth.uid(), proposal_id))';
  END IF;
END $$;

-- Phase 1f: Add contact access columns to participant_members
ALTER TABLE public.participant_members ADD COLUMN IF NOT EXISTS access_requested boolean DEFAULT false;
ALTER TABLE public.participant_members ADD COLUMN IF NOT EXISTS access_requested_by uuid;
ALTER TABLE public.participant_members ADD COLUMN IF NOT EXISTS access_granted boolean DEFAULT false;
ALTER TABLE public.participant_members ADD COLUMN IF NOT EXISTS access_granted_role text;
ALTER TABLE public.participant_members ADD COLUMN IF NOT EXISTS access_granted_by uuid;
ALTER TABLE public.participant_members ADD COLUMN IF NOT EXISTS access_granted_at timestamptz;

-- Add contact access columns to participants (for main contact)
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS main_contact_access_requested boolean DEFAULT false;
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS main_contact_access_requested_by uuid;
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS main_contact_access_granted boolean DEFAULT false;
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS main_contact_access_granted_role text;
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS main_contact_access_granted_by uuid;
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS main_contact_access_granted_at timestamptz;
