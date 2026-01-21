
-- Move evaluation criteria from H1 sections to H2 subsections
-- B1 (Excellence) evaluation criteria → B1.1 (Objectives & ambition)
UPDATE section_guidelines 
SET section_id = 'b0000002-0000-0000-0000-000000000002',
    order_index = 10
WHERE id = 'dae281d6-e0d4-4dda-825d-36e3e83da948';

-- B2 (Impact) evaluation criteria → B2.1 (Project's pathways towards impact)
UPDATE section_guidelines 
SET section_id = 'b0000005-0000-0000-0000-000000000005',
    order_index = 10
WHERE id = '8bf7484c-c9e7-43cb-9c7f-9652e2bf7338';

-- H1 sections (B1, B2) should no longer have any guidelines attached
-- They are now just navigation headings
