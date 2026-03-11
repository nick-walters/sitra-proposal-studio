-- Add fstp_type column to distinguish grant vs prize content
ALTER TABLE public.fstp_content ADD COLUMN IF NOT EXISTS fstp_type text NOT NULL DEFAULT 'grant';

-- Update existing ADDGenAI row to be tagged as prize (since that proposal uses prize)
UPDATE public.fstp_content SET fstp_type = 'prize' WHERE proposal_id = '9d7716c3-e0cb-4bad-a862-1abc0acb97e4';

-- Drop the old unique constraint on proposal_id and create new one on (proposal_id, fstp_type)
ALTER TABLE public.fstp_content DROP CONSTRAINT IF EXISTS fstp_content_proposal_id_key;
ALTER TABLE public.fstp_content ADD CONSTRAINT fstp_content_proposal_id_fstp_type_key UNIQUE (proposal_id, fstp_type);