-- 1. Columns
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by uuid;

CREATE INDEX IF NOT EXISTS proposals_deleted_at_idx ON public.proposals (deleted_at) WHERE deleted_at IS NOT NULL;

-- 2. purge_after trigger, mirroring set_card_deletion_purge_after
CREATE OR REPLACE FUNCTION public.set_proposal_purge_after()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND NEW.restored_at IS NULL AND NEW.purge_after IS NULL THEN
    NEW.purge_after := NEW.deleted_at + interval '90 days';
  END IF;
  IF NEW.deleted_at IS NULL THEN
    NEW.purge_after := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_proposal_purge_after ON public.proposals;
CREATE TRIGGER set_proposal_purge_after
BEFORE INSERT OR UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.set_proposal_purge_after();

-- 3. RLS split
DROP POLICY IF EXISTS "Users can view proposals they have access to" ON public.proposals;
CREATE POLICY "Users can view proposals they have access to"
ON public.proposals
FOR SELECT
USING (deleted_at IS NULL AND public.has_any_proposal_role(auth.uid(), id));

DROP POLICY IF EXISTS "Global admins can view suppressed proposals" ON public.proposals;
CREATE POLICY "Global admins can view suppressed proposals"
ON public.proposals
FOR SELECT
USING (deleted_at IS NOT NULL AND public.is_global_admin(auth.uid()));

-- 4. Suppress (same authorisation as delete_proposal)
CREATE OR REPLACE FUNCTION public.suppress_proposal(_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _proposal_id IS NULL THEN
    RAISE EXCEPTION 'Proposal id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE id = _proposal_id) THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  IF NOT (
    public.is_global_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.proposal_id = _proposal_id
        AND ur.role IN ('owner'::app_role, 'admin'::app_role)
    )
  ) THEN
    RAISE EXCEPTION 'Only a proposal owner or admin may delete a proposal';
  END IF;

  UPDATE public.proposals
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         purge_after = NULL,
         restored_at = NULL,
         restored_by = NULL
   WHERE id = _proposal_id
     AND deleted_at IS NULL;
END;
$$;

-- 5. Restore (global admins only: a suppressed proposal is in nobody's list)
CREATE OR REPLACE FUNCTION public.restore_suppressed_proposal(_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a global admin may restore a suppressed proposal';
  END IF;

  UPDATE public.proposals
     SET deleted_at = NULL,
         purge_after = NULL,
         restored_at = now(),
         restored_by = auth.uid()
   WHERE id = _proposal_id
     AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found in the recycle bin';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suppress_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_suppressed_proposal(uuid) TO authenticated;