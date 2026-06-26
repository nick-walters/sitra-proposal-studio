-- Collapse multi-task deliverable links to a single task per deliverable (lowest-numbered task within the deliverable's WP).
WITH ranked AS (
  SELECT l.id,
         l.deliverable_id,
         ROW_NUMBER() OVER (
           PARTITION BY l.deliverable_id
           ORDER BY COALESCE(t.number::text, '999')::int ASC, t.id ASC
         ) AS rn
  FROM wp_draft_deliverable_tasks l
  JOIN wp_draft_tasks t ON t.id = l.wp_draft_task_id
)
DELETE FROM wp_draft_deliverable_tasks
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);