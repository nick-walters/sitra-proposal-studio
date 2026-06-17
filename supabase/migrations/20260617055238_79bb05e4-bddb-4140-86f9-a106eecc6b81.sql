ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS main_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS main_contact_phone2 TEXT,
  ADD COLUMN IF NOT EXISTS main_contact_website TEXT;