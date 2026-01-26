-- Update the coordination WP template preset
UPDATE public.wp_draft_templates
SET 
  short_name = 'C&A',
  title = 'Project coordination & administration'
WHERE name = 'Coordination';

-- Update any existing WP drafts that still have the old values (for proposals already created)
UPDATE public.wp_drafts
SET 
  short_name = 'C&A',
  title = 'Project coordination & administration'
WHERE short_name = 'COORD' 
  AND title = 'Project Coordination and Management';