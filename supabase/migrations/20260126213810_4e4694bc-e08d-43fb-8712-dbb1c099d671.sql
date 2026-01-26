-- Update the function to save uses_fstp
CREATE OR REPLACE FUNCTION public.create_proposal_with_role(
  p_acronym text,
  p_title text,
  p_type proposal_type,
  p_budget_type budget_type,
  p_submission_stage text DEFAULT 'full',
  p_work_programme text DEFAULT NULL,
  p_destination text DEFAULT NULL,
  p_topic_url text DEFAULT NULL,
  p_deadline timestamptz DEFAULT NULL,
  p_template_type_id uuid DEFAULT NULL,
  p_uses_fstp boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_proposal_id uuid;
BEGIN
  -- Insert the proposal
  INSERT INTO public.proposals (
    acronym,
    title,
    type,
    budget_type,
    submission_stage,
    work_programme,
    destination,
    topic_url,
    deadline,
    template_type_id,
    created_by,
    status,
    uses_fstp
  ) VALUES (
    p_acronym,
    p_title,
    p_type,
    p_budget_type,
    p_submission_stage,
    p_work_programme,
    p_destination,
    p_topic_url,
    p_deadline,
    p_template_type_id,
    auth.uid(),
    'draft',
    p_uses_fstp
  )
  RETURNING id INTO new_proposal_id;

  -- Assign the creator as admin
  INSERT INTO public.user_roles (user_id, proposal_id, role)
  VALUES (auth.uid(), new_proposal_id, 'admin');

  RETURN new_proposal_id;
END;
$$;