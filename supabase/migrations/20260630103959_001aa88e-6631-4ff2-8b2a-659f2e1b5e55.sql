
DO $$
DECLARE
  proposal UUID := 'dd66432e-dccb-4303-9db3-dcba9e16bfc9';
  badge TEXT := '<span data-acronym-reference="" contenteditable="false" style="display: inline; font-family: ''Arial Black'', Arial, sans-serif; font-weight: 900; font-size: inherit; white-space: nowrap; cursor: pointer;" data-acronym-segments="[{&quot;text&quot;:&quot;ADD&quot;,&quot;color&quot;:&quot;#f59e0b&quot;},{&quot;text&quot;:&quot;GenAI&quot;,&quot;color&quot;:&quot;#2563eb&quot;}]"><span style="color: #f59e0b">ADD</span><span style="color: #2563eb">GenAI</span></span>';
  badge_json TEXT;
BEGIN
  -- JSON-escape the badge for in-jsonb text replacement (only " needs escaping here).
  badge_json := replace(badge, '"', '\"');

  UPDATE section_content
     SET content = replace(content, 'ADDgenAI', badge)
   WHERE proposal_id = proposal AND content LIKE '%ADDgenAI%';

  UPDATE case_drafts
     SET subsection_content = replace(subsection_content::text, 'ADDgenAI', badge_json)::jsonb
   WHERE proposal_id = proposal AND subsection_content::text LIKE '%ADDgenAI%';

  UPDATE case_drafts SET background_context = replace(background_context, 'ADDgenAI', badge)
   WHERE proposal_id = proposal AND background_context LIKE '%ADDgenAI%';
  UPDATE case_drafts SET proposed_solutions = replace(proposed_solutions, 'ADDgenAI', badge)
   WHERE proposal_id = proposal AND proposed_solutions LIKE '%ADDgenAI%';
  UPDATE case_drafts SET expected_outcomes = replace(expected_outcomes, 'ADDgenAI', badge)
   WHERE proposal_id = proposal AND expected_outcomes LIKE '%ADDgenAI%';
  UPDATE case_drafts SET replicability = replace(replicability, 'ADDgenAI', badge)
   WHERE proposal_id = proposal AND replicability LIKE '%ADDgenAI%';
  UPDATE case_drafts SET key_stakeholders = replace(key_stakeholders, 'ADDgenAI', badge)
   WHERE proposal_id = proposal AND key_stakeholders LIKE '%ADDgenAI%';

  UPDATE wp_draft_tasks
     SET description = replace(description, 'ADDgenAI', badge)
   WHERE wp_draft_id IN (SELECT id FROM wp_drafts WHERE proposal_id = proposal)
     AND description LIKE '%ADDgenAI%';
END $$;
