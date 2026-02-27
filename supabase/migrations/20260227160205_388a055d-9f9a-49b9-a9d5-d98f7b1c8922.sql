-- Add composite index for faster comment loading per section
CREATE INDEX IF NOT EXISTS idx_section_comments_proposal_section 
ON public.section_comments (proposal_id, section_id, created_at);

-- Add index for parent comment lookups (threading)
CREATE INDEX IF NOT EXISTS idx_section_comments_parent
ON public.section_comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;