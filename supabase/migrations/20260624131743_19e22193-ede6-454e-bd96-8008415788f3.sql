DROP TABLE IF EXISTS public.b31_task_participants, public.b31_tasks, public.b31_deliverables, public.b31_milestones, public.b31_risks, public.b12_case_subsections, public.b12_cases CASCADE;

ALTER TABLE public.wp_drafts
  DROP COLUMN IF EXISTS b31_populated_tasks,
  DROP COLUMN IF EXISTS b31_populated_deliverables,
  DROP COLUMN IF EXISTS b31_populated_milestones,
  DROP COLUMN IF EXISTS b31_populated_risks,
  DROP COLUMN IF EXISTS b31_populated_objectives,
  DROP COLUMN IF EXISTS b31_populated_description;

DROP FUNCTION IF EXISTS public.initialize_b31_tasks() CASCADE;