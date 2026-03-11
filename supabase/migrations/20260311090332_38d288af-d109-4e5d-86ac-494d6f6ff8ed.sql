
-- Add OCD columns to proposals table
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS requires_ocd boolean DEFAULT false;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS ocd_template_path text;

-- Create table to track signed OCD uploads per participant
CREATE TABLE IF NOT EXISTS participant_ocd_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  participant_id uuid REFERENCES participants(id) ON DELETE CASCADE NOT NULL,
  file_path text NOT NULL,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(proposal_id, participant_id)
);

ALTER TABLE participant_ocd_uploads ENABLE ROW LEVEL SECURITY;

-- Select: any authenticated user with a role on the proposal (or global role)
CREATE POLICY "ocd_uploads_select" ON participant_ocd_uploads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND (proposal_id = participant_ocd_uploads.proposal_id OR proposal_id IS NULL)
  )
);

-- Insert: any authenticated user can upload (they set uploaded_by = their id)
CREATE POLICY "ocd_uploads_insert" ON participant_ocd_uploads
FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid());

-- Update: any authenticated user with a role on the proposal
CREATE POLICY "ocd_uploads_update" ON participant_ocd_uploads
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND (proposal_id = participant_ocd_uploads.proposal_id OR proposal_id IS NULL)
  )
);

-- Delete: coordinators+ only
CREATE POLICY "ocd_uploads_delete" ON participant_ocd_uploads
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND (
      proposal_id IS NULL
      OR (proposal_id = participant_ocd_uploads.proposal_id AND role IN ('coordinator'))
    )
  )
);
