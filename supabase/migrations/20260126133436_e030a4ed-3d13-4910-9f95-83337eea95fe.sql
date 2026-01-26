-- Add Sitra's Tips for Part A1: General Information
INSERT INTO public.section_guidelines (section_id, guideline_type, title, content, order_index, is_active) VALUES
-- A1 Tips
('00000000-0002-0001-0000-000000000001', 'sitra_tip', 'Crafting an effective acronym', 
'Choose an acronym that is memorable, pronounceable, and ideally conveys the essence of your project. Avoid generic terms or overly complex abbreviations. A good acronym helps reviewers and stakeholders remember your project and can become an important part of your project''s brand identity.', 
8, true),

('00000000-0002-0001-0000-000000000001', 'sitra_tip', 'Writing a compelling abstract', 
'Your abstract is often the first thing evaluators read—make it count. Start with a strong opening sentence that captures the core innovation. Structure it clearly: problem → solution → impact. Avoid jargon and be specific about expected outcomes. Remember this will be published, so make it accessible to a broad audience.', 
9, true),

('00000000-0002-0001-0000-000000000001', 'sitra_tip', 'Strategic keyword selection', 
'Keywords are used to match proposals with appropriate evaluators. Select keywords that accurately reflect your project''s main scientific/technical domains. Consider using terms that align with the call text and work programme priorities. This helps ensure your proposal is evaluated by experts with relevant background.', 
10, true),

('00000000-0002-0001-0000-000000000001', 'sitra_tip', 'Handling previous submissions', 
'If resubmitting, be transparent and constructive. Clearly explain how you''ve addressed previous feedback and improved the proposal. Evaluators appreciate seeing genuine evolution of ideas. Even if the previous attempt was under a different call, mention relevant lessons learned.', 
11, true);

-- Add Sitra's Tips for Part A2: Participants
INSERT INTO public.section_guidelines (section_id, guideline_type, title, content, order_index, is_active) VALUES
('00000000-0002-0002-0000-000000000001', 'sitra_tip', 'Building a balanced consortium', 
'A strong consortium combines complementary expertise across the value chain. Aim for geographic diversity across EU member states and associated countries. Include a mix of research organisations, industry partners (including SMEs), and end-users. Each partner should have a clear, essential role—avoid "passengers" who don''t contribute meaningfully.', 
8, true),

('00000000-0002-0002-0000-000000000001', 'sitra_tip', 'Coordinator selection', 
'The coordinator (Participant #1) is critical to success. Choose an organisation with strong project management capacity, experience with EU-funded projects, and the administrative resources to handle financial and reporting obligations. The coordinator should be a neutral convener if the consortium includes competing organisations.', 
9, true),

('00000000-0002-0002-0000-000000000001', 'sitra_tip', 'Verifying PIC registration', 
'Start PIC verification early—new registrations can take several weeks for validation. Ensure all legal information matches official documents exactly. Common issues include mismatched VAT numbers, outdated addresses, or incorrect legal entity types. The coordinator should verify all partner PICs well before the submission deadline.', 
10, true),

('00000000-0002-0002-0000-000000000001', 'sitra_tip', 'SME involvement', 
'SMEs bring agility, market proximity, and innovation capacity. Horizon Europe has specific targets for SME participation. Clearly identify SME status in the participant list and highlight their unique contributions. SMEs may be eligible for higher funding rates depending on the action type.', 
11, true);