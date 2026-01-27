-- Enable realtime for wp_drafts table so deletions/changes are reflected in the left panel
ALTER PUBLICATION supabase_realtime ADD TABLE public.wp_drafts;