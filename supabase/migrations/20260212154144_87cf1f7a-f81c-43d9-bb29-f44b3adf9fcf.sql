
-- Fix infinite recursion: use a security definer function for recipient check
CREATE OR REPLACE FUNCTION public.is_message_recipient(_user_id uuid, _message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proposal_message_recipients
    WHERE message_id = _message_id AND user_id = _user_id
  )
$$;

-- Drop and recreate the SELECT policy without inline subquery
DROP POLICY IF EXISTS "Members can view messages" ON public.proposal_messages;

CREATE POLICY "Members can view messages"
  ON public.proposal_messages FOR SELECT
  USING (
    public.has_any_proposal_role(auth.uid(), proposal_id)
    AND (
      visibility = 'all'
      OR author_id = auth.uid()
      OR public.is_message_recipient(auth.uid(), id)
    )
  );
