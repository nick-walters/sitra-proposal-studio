-- Update WP draft templates to use correct short names and sentence case titles
UPDATE public.wp_draft_templates
SET 
  short_name = 'COORD',
  title = 'Project coordination & administration'
WHERE name = 'Coordination' AND is_system = true;

UPDATE public.wp_draft_templates
SET 
  short_name = 'DEC',
  title = 'Dissemination, exploitation & communication'
WHERE name = 'DEC Standard' AND is_system = true;

-- Update the initialize_wp_drafts function to use the updated template values
-- (The function already reads from wp_draft_templates, so it will pick up the new values automatically)
-- No function change needed since it reads short_name and title from the templates table.