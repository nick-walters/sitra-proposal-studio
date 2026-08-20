ALTER TABLE public.wp_draft_tasks
  ADD CONSTRAINT wp_draft_tasks_wp_number_key UNIQUE (wp_draft_id, number) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.wp_draft_deliverables
  ADD CONSTRAINT wp_draft_deliverables_wp_number_key UNIQUE (wp_draft_id, number) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.proposal_milestones
  ADD CONSTRAINT proposal_milestones_proposal_number_key UNIQUE (proposal_id, number) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.proposal_risks
  ADD CONSTRAINT proposal_risks_proposal_number_key UNIQUE (proposal_id, number) DEFERRABLE INITIALLY IMMEDIATE;