-- Add new security field for "other security issues" question
ALTER TABLE public.ethics_assessment
ADD COLUMN IF NOT EXISTS security_other_issues boolean DEFAULT null,
ADD COLUMN IF NOT EXISTS security_other_issues_page text,
ADD COLUMN IF NOT EXISTS security_other_issues_details text;