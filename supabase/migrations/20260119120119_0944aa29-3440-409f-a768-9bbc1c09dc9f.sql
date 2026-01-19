-- First drop the default on status column
ALTER TABLE proposals ALTER COLUMN status DROP DEFAULT;

-- Create new enum with desired values
CREATE TYPE proposal_status_v3 AS ENUM ('draft', 'submitted', 'funded', 'not_funded');

-- Update the column to use new type
ALTER TABLE proposals 
  ALTER COLUMN status TYPE proposal_status_v3 
  USING (
    CASE status::text
      WHEN 'draft' THEN 'draft'::proposal_status_v3
      WHEN 'in_review' THEN 'draft'::proposal_status_v3
      WHEN 'submitted' THEN 'submitted'::proposal_status_v3
      ELSE 'draft'::proposal_status_v3
    END
  );

-- Set the default again
ALTER TABLE proposals ALTER COLUMN status SET DEFAULT 'draft'::proposal_status_v3;

-- Drop old enum and rename new one
DROP TYPE proposal_status;
ALTER TYPE proposal_status_v3 RENAME TO proposal_status;

-- Same for proposal_type - drop default first
ALTER TABLE proposals ALTER COLUMN type DROP DEFAULT;

-- Create new proposal_type enum without OTHER
CREATE TYPE proposal_type_v3 AS ENUM ('RIA', 'IA', 'CSA');

-- Update the column to use new type
ALTER TABLE proposals 
  ALTER COLUMN type TYPE proposal_type_v3 
  USING (
    CASE type::text
      WHEN 'OTHER' THEN 'RIA'::proposal_type_v3
      ELSE type::text::proposal_type_v3
    END
  );

-- Set the default again
ALTER TABLE proposals ALTER COLUMN type SET DEFAULT 'RIA'::proposal_type_v3;

-- Drop old enum and rename new one
DROP TYPE proposal_type;
ALTER TYPE proposal_type_v3 RENAME TO proposal_type;

-- Add new columns to proposals table
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS work_programme text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS destination text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS decision_date timestamp with time zone;