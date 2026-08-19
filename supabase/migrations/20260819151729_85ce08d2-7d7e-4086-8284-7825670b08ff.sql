update case_drafts
set subsection_content = jsonb_set(subsection_content, '{replicability}', '""'::jsonb)
where id = 'fdefdc8d-8bdf-4a3a-935c-ecdd3466c2bf';