-- Drop the regular index and replace with a unique constraint
DROP INDEX IF EXISTS idx_organisations_pic_number;
ALTER TABLE public.organisations ADD CONSTRAINT organisations_pic_number_key UNIQUE (pic_number);