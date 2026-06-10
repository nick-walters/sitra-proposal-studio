
-- ============ proposal_backups ============
CREATE TABLE public.proposal_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  backup_timestamp timestamptz NOT NULL DEFAULT now(),
  sharepoint_status text NOT NULL DEFAULT 'pending'
    CHECK (sharepoint_status IN ('pending','uploaded','failed','skipped')),
  sharepoint_path text,
  bucket_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  size_bytes integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_backups_proposal_time
  ON public.proposal_backups(proposal_id, backup_timestamp DESC);

GRANT SELECT ON public.proposal_backups TO authenticated;
GRANT ALL ON public.proposal_backups TO service_role;

ALTER TABLE public.proposal_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposal admins can view backups"
  ON public.proposal_backups
  FOR SELECT
  TO authenticated
  USING (public.is_proposal_admin(auth.uid(), proposal_id));

-- Inserts/updates/deletes happen via service role only (edge function).

-- ============ sharepoint_backup_config ============
CREATE TABLE public.sharepoint_backup_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text,
  site_url text,
  root_folder_path text NOT NULL DEFAULT 'Documents/Proposal backups',
  per_proposal_subfolder boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  singleton boolean NOT NULL DEFAULT true UNIQUE
);

GRANT SELECT, INSERT, UPDATE ON public.sharepoint_backup_config TO authenticated;
GRANT ALL ON public.sharepoint_backup_config TO service_role;

ALTER TABLE public.sharepoint_backup_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can read sharepoint config"
  ON public.sharepoint_backup_config
  FOR SELECT
  TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE POLICY "Global admins can insert sharepoint config"
  ON public.sharepoint_backup_config
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_global_admin(auth.uid()));

CREATE POLICY "Global admins can update sharepoint config"
  ON public.sharepoint_backup_config
  FOR UPDATE
  TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

CREATE TRIGGER trg_sharepoint_backup_config_updated_at
  BEFORE UPDATE ON public.sharepoint_backup_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed singleton row (disabled until admin configures it).
INSERT INTO public.sharepoint_backup_config (singleton, enabled)
VALUES (true, false)
ON CONFLICT DO NOTHING;
