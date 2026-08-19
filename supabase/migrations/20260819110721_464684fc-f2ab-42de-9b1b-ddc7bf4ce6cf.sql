-- (a) task 4b763bc9 : deliverable 9035efa4 label D5.6 -> D5.5
UPDATE wp_draft_tasks
SET description = regexp_replace(
  description,
  '(data-deliverable-id="9035efa4-e8dd-4b88-8cbc-d65a81fdcf61"[^!]*?z-index:1">)D5\.6<',
  '\1D5.5<'
)
WHERE id = '4b763bc9-0000-0000-0000-000000000000'::uuid OR id::text LIKE '4b763bc9%';

-- (b) milestone 3381e281 : deliverable 9035efa4 label D5.3 -> D5.5 (incl. data-deliverable-label)
UPDATE proposal_milestones
SET means_of_verification = regexp_replace(
  regexp_replace(
    means_of_verification,
    '(data-deliverable-id="9035efa4-e8dd-4b88-8cbc-d65a81fdcf61" data-deliverable-label=")D5\.3"',
    '\1D5.5"'
  ),
  '(data-deliverable-id="9035efa4-e8dd-4b88-8cbc-d65a81fdcf61"[^!]*?z-index:1">)D5\.3<',
  '\1D5.5<'
)
WHERE id::text LIKE '3381e281%';

-- (c) task 27c1ea0f : task 6a69198a label T5.3 -> T5.5
UPDATE wp_draft_tasks
SET description = regexp_replace(
  description,
  '(data-task-id="6a69198a-fa17-4775-9bc4-6b6950985d63"[^>]*>)T5\.3<',
  '\1T5.5<'
)
WHERE id::text LIKE '27c1ea0f%';

-- (d) milestone 01f90ea2 : task 6aefeb11 label T4.5 -> T4.6
UPDATE proposal_milestones
SET means_of_verification = regexp_replace(
  means_of_verification,
  '(data-task-id="6aefeb11-ee2e-4789-90b0-b809e27f54e6"[^>]*>)T4\.5<',
  '\1T4.6<'
)
WHERE id::text LIKE '01f90ea2%';