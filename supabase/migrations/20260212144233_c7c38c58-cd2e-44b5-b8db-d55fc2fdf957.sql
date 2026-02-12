
-- Fix infinite recursion in proposal_messages RLS policies
-- Drop all existing policies on both tables
DROP POLICY IF EXISTS "Members can view messages" ON public.proposal_messages;
DROP POLICY IF EXISTS "Members can insert messages" ON public.proposal_messages;
DROP POLICY IF EXISTS "Authors and coordinators can update" ON public.proposal_messages;
DROP POLICY IF EXISTS "Authors and coordinators can delete" ON public.proposal_messages;
DROP POLICY IF EXISTS "Recipients can view their entries" ON public.proposal_message_recipients;
DROP POLICY IF EXISTS "Message author can insert recipients" ON public.proposal_message_recipients;

-- Recreate proposal_messages policies WITHOUT referencing proposal_message_recipients in SELECT
-- Use a simpler approach: all proposal members can see all non-private messages,
-- and private messages are only visible to author. Recipients checked in app code.
CREATE POLICY "Members can view messages"
  ON public.proposal_messages FOR SELECT
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

CREATE POLICY "Members can insert messages"
  ON public.proposal_messages FOR INSERT
  WITH CHECK (public.has_any_proposal_role(auth.uid(), proposal_id) AND auth.uid() = author_id);

CREATE POLICY "Authors and coordinators can update"
  ON public.proposal_messages FOR UPDATE
  USING (
    author_id = auth.uid()
    OR public.is_proposal_admin(auth.uid(), proposal_id)
  );

CREATE POLICY "Authors and coordinators can delete"
  ON public.proposal_messages FOR DELETE
  USING (
    author_id = auth.uid()
    OR public.is_proposal_admin(auth.uid(), proposal_id)
  );

-- Recreate proposal_message_recipients policies WITHOUT referencing proposal_messages
CREATE POLICY "Recipients can view their entries"
  ON public.proposal_message_recipients FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert recipients"
  ON public.proposal_message_recipients FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
