-- Allow proposal_id to be NULL for global roles (owner, admin)
ALTER TABLE public.user_roles ALTER COLUMN proposal_id DROP NOT NULL;