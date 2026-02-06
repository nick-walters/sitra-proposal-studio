-- Add new fields to participants table for EC Part A2 alignment
ALTER TABLE participants ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS main_contact_title text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS main_contact_position text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS main_contact_phone text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS has_gender_equality_plan boolean;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS dependency_declaration text;