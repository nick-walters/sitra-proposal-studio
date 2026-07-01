GRANT SELECT, INSERT, UPDATE, DELETE ON public.section_visibility_locks TO authenticated;
GRANT ALL ON public.section_visibility_locks TO service_role;

-- Clean up legacy/malformed lock rows that cannot be toggled from the UI
DELETE FROM public.section_visibility_locks
WHERE section_id IN ('part a', 'part b', 'b1', 'b2', 'b3', 'b1-1', 'b1-2', 'b2-1', 'b2-2', 'b3-1', 'b3-2');