-- Add section locking capability to proposal template sections
ALTER TABLE public.proposal_template_sections 
ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS locked_at timestamptz,
ADD COLUMN IF NOT EXISTS lock_reason text;

-- Add section assignment capability
ALTER TABLE public.proposal_template_sections 
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
ADD COLUMN IF NOT EXISTS due_date timestamptz;

-- Add placeholder content to template sections
ALTER TABLE public.template_sections
ADD COLUMN IF NOT EXISTS placeholder_content text;

ALTER TABLE public.proposal_template_sections
ADD COLUMN IF NOT EXISTS placeholder_content text;

-- Create a table for section comments
CREATE TABLE IF NOT EXISTS public.section_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    section_id text NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    selection_start integer,
    selection_end integer,
    selected_text text,
    is_suggestion boolean DEFAULT false,
    suggested_text text,
    status text DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
    parent_comment_id uuid REFERENCES public.section_comments(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on section_comments
ALTER TABLE public.section_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies for section_comments
CREATE POLICY "Users with proposal access can view comments"
ON public.section_comments
FOR SELECT
USING (public.has_any_proposal_role(proposal_id, auth.uid()));

CREATE POLICY "Users with edit access can create comments"
ON public.section_comments
FOR INSERT
WITH CHECK (public.can_edit_proposal(proposal_id, auth.uid()));

CREATE POLICY "Users can update their own comments"
ON public.section_comments
FOR UPDATE
USING (user_id = auth.uid() OR public.is_proposal_admin(proposal_id, auth.uid()));

CREATE POLICY "Users can delete their own comments"
ON public.section_comments
FOR DELETE
USING (user_id = auth.uid() OR public.is_proposal_admin(proposal_id, auth.uid()));

-- Enable realtime for section_comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.section_comments;

-- Create index for faster comment lookups
CREATE INDEX IF NOT EXISTS idx_section_comments_proposal_section 
ON public.section_comments(proposal_id, section_id);

CREATE INDEX IF NOT EXISTS idx_section_comments_user 
ON public.section_comments(user_id);