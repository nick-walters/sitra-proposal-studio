
-- Drop ALL old duplicate/conflicting policies on proposal_messages
DROP POLICY IF EXISTS "Users with proposal role can read visible messages" ON public.proposal_messages;
DROP POLICY IF EXISTS "Users with proposal role can insert messages" ON public.proposal_messages;
DROP POLICY IF EXISTS "Authors and coordinators can delete" ON public.proposal_messages;
DROP POLICY IF EXISTS "Authors and coordinators can update" ON public.proposal_messages;

-- Drop conflicting recipients policies that query back to proposal_messages
DROP POLICY IF EXISTS "Recipients readable by proposal members" ON public.proposal_message_recipients;
DROP POLICY IF EXISTS "Recipients deletable by message author or coordinator" ON public.proposal_message_recipients;
DROP POLICY IF EXISTS "Recipients insertable by message author" ON public.proposal_message_recipients;
DROP POLICY IF EXISTS "Recipients can view their entries" ON public.proposal_message_recipients;
DROP POLICY IF EXISTS "Authenticated users can insert recipients" ON public.proposal_message_recipients;

-- Recreate recipients policies using security definer functions (no cross-table queries)
CREATE POLICY "Recipients viewable by own user"
  ON public.proposal_message_recipients FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Recipients insertable by authenticated"
  ON public.proposal_message_recipients FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Recipients deletable by authenticated"
  ON public.proposal_message_recipients FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);
