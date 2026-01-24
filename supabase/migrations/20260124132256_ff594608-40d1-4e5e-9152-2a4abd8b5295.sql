-- First, update the check constraint to allow more field types
ALTER TABLE template_form_fields DROP CONSTRAINT template_form_fields_field_type_check;

ALTER TABLE template_form_fields ADD CONSTRAINT template_form_fields_field_type_check 
CHECK (field_type = ANY (ARRAY['text', 'textarea', 'select', 'checkbox', 'date', 'number', 'email', 'url', 'country', 'organisation', 'radio', 'multiselect']));

-- Clear existing guidelines for A1 and A2 to replace with complete official guidelines
DELETE FROM section_guidelines WHERE section_id IN (
  '00000000-0002-0001-0000-000000000001',  -- A1
  '00000000-0002-0002-0000-000000000001'   -- A2
);

-- =====================================================
-- A1: GENERAL INFORMATION - Official EC Guidelines
-- =====================================================

INSERT INTO section_guidelines (id, section_id, guideline_type, title, content, order_index, is_active)
VALUES 
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'official', '',
   'Acronym: Enter a short acronym for your proposal (maximum 20 characters). The acronym should be easy to remember and meaningful where possible. It will be used to identify your proposal throughout the evaluation and, if successful, during project implementation.',
   1, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'official', '',
   'Title: Enter the full title of your proposal (maximum 200 characters). The title should clearly and concisely describe the main topic and objectives of the project.',
   2, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'official', '',
   'Duration: Indicate the proposed duration of the project in months. The duration must be appropriate for the work planned and consistent with the call conditions.',
   3, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'official', '',
   'Abstract: Provide a short summary of your proposal (maximum 2000 characters, including spaces). The abstract should include:
• The main objectives of the project
• The novelty and ambition of the concept and approach
• The expected impacts and results
• A brief description of the methodology
⚠ The abstract will be published if your proposal is funded. Do not include confidential information.',
   4, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'official', '',
   'Keywords: Select up to 5 descriptors from the provided list that best describe the scientific and technical areas of your proposal. You may also add free keywords (maximum 200 characters) for additional precision. Keywords help evaluators and programme managers identify relevant expertise for evaluation.',
   5, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'official', '',
   'Previous submission: Indicate whether this proposal (or a very similar one) has been previously submitted under Horizon Europe or Horizon 2020. If yes, provide the proposal number and explain how the proposal has been improved based on any feedback received.',
   6, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'official', '',
   'Declarations: The following declarations are made on behalf of all applicants:
• Consent: All applicants have given explicit consent on their participation and on the content of this proposal
• Correctness: The information contained in this proposal is correct and complete
• Eligibility: All applicants comply with eligibility criteria and are not subject to exclusion grounds under the EU Financial Regulation
• Ethics: The proposal complies with ethical principles and the highest standards of research integrity
• Civil applications: The proposal has an exclusive focus on civil applications
⚠ By submitting this proposal, the coordinator confirms these declarations on behalf of all participants.',
   7, true);

-- =====================================================
-- A2: PARTICIPANTS - Official EC Guidelines
-- =====================================================

INSERT INTO section_guidelines (id, section_id, guideline_type, title, content, order_index, is_active)
VALUES 
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'official', '',
   'Participant Identification Code (PIC): Each organisation must have a valid 9-digit PIC to participate in Horizon Europe proposals. The PIC is obtained by registering your organisation in the Funding & Tenders Portal Participant Register. The coordinator must verify that all participants are properly registered before submission.',
   1, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'official', '',
   'Organisation details: Verify the following information for each participant:
• Legal name: The official registered name of the organisation
• Short name: An abbreviated name for easy identification
• Country: The country where the organisation is legally established
• Organisation type: Higher/Secondary Education (HES), Research Organisation (RES), Private For-Profit (PRC), Public Body (PUB), International Organisation (INT), or Other (OTH)
⚠ These details must match the registration in the Participant Register.',
   2, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'official', '',
   'Participant roles and status:
• Beneficiary: Main participant who signs the grant agreement and receives EU funding. Must be a legal entity established in an eligible country.
• Affiliated entity: Legal entity with a legal or capital link to a beneficiary. May receive part of the grant to carry out project tasks.
• Associated partner: Contributes to the project but does not receive EU funding.
• Third party giving in-kind contributions: Provides resources to a beneficiary free of charge.',
   3, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'official', '',
   'Consortium composition: For Research and Innovation Actions (RIA) and Innovation Actions (IA), the consortium must include at least 3 independent legal entities from 3 different EU Member States or Associated Countries. Check the specific call conditions for any additional requirements.',
   4, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'official', '',
   'Coordinator: Participant number 1 is automatically designated as the coordinator. The coordinator:
• Acts as the intermediary between the consortium and the European Commission
• Is responsible for submitting the proposal and managing the grant
• Receives and distributes EU funding to other beneficiaries
• Must be established in an EU Member State or Associated Country',
   5, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'official', '',
   'Contact persons: Identify the following for each participant:
• Primary Contact: Receives all official communications regarding the proposal and grant
• Administrative Contact: Handles administrative matters including legal and financial issues
• Scientific Contact: Responsible for scientific and technical aspects of the work
⚠ At least one contact person must be identified for each participant.',
   6, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'official', '',
   'Third country participation: Organisations from non-associated third countries may participate under certain conditions:
• Automatically eligible: Low and middle income countries (as per the Work Programme)
• Exceptionally eligible: When their participation is essential for the project
• May participate at own cost: Without EU funding
⚠ Check the Work Programme for the list of eligible countries and any specific restrictions.',
   7, true);

-- =====================================================
-- A1: FORM FIELDS
-- =====================================================

INSERT INTO template_form_fields (id, section_id, field_name, field_label, field_type, placeholder, validation_rules, help_text, is_required, order_index, is_active)
VALUES 
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'acronym', 'Proposal acronym', 'text', 
   'e.g., PROJECTNAME', '{"maxLength": 20}', 
   'Maximum 20 characters. Use only letters, numbers and hyphens.', true, 1, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'title', 'Proposal title', 'textarea', 
   'Enter the full title of your proposal', '{"maxLength": 200}', 
   'Maximum 200 characters. The title should clearly describe the main topic and objectives.', true, 2, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'duration', 'Duration (months)', 'number', 
   '36', '{"min": 1, "max": 72}', 
   'Enter the proposed duration in months (1-72).', true, 3, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'abstract', 'Abstract', 'textarea', 
   'Summarise your proposal including objectives, novelty, expected impacts, and methodology...', '{"maxLength": 2000}', 
   'Maximum 2000 characters. Will be published if funded - do not include confidential information.', true, 4, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'fixed_keywords', 'Descriptors (fixed keywords)', 'multiselect', 
   NULL, '{"maxItems": 5}', 
   'Select up to 5 descriptors from the list that best describe your proposal.', true, 5, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'free_keywords', 'Free keywords', 'text', 
   'Enter additional keywords separated by semicolons', '{"maxLength": 200}', 
   'Maximum 200 characters. Add specific terms not covered by the descriptors.', false, 6, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'previous_submission', 'Has this proposal been submitted before?', 'radio', 
   NULL, '{"options": ["Yes", "No"]}', 
   'Indicate if this or a similar proposal was submitted under Horizon Europe or Horizon 2020.', true, 7, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'previous_submission_reference', 'Previous proposal reference', 'text', 
   'e.g., 101234567', NULL, 
   'If yes, provide the proposal number of the previous submission.', false, 8, true),
  
  (gen_random_uuid(), '00000000-0002-0001-0000-000000000001', 'improvements_description', 'Improvements made', 'textarea', 
   'Describe how you have improved the proposal based on previous feedback...', '{"maxLength": 1000}', 
   'Explain how the proposal has been improved based on any feedback received.', false, 9, true);

-- =====================================================
-- A2: FORM FIELDS (Participant-specific)
-- =====================================================

INSERT INTO template_form_fields (id, section_id, field_name, field_label, field_type, placeholder, validation_rules, help_text, is_required, is_participant_specific, order_index, is_active)
VALUES 
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'pic', 'Participant Identification Code (PIC)', 'text', 
   '999999999', '{"pattern": "^[0-9]{9}$"}', 
   'Enter the 9-digit PIC from the Funding & Tenders Portal registration.', true, true, 1, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'legal_name', 'Legal name', 'text', 
   'e.g., University of Helsinki', NULL, 
   'Official registered name of the organisation.', true, true, 2, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'short_name', 'Short name', 'text', 
   'e.g., UH', '{"maxLength": 20}', 
   'Abbreviated name for easy identification (max 20 characters).', true, true, 3, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'country', 'Country', 'country', 
   NULL, NULL, 
   'Country where the organisation is legally established.', true, true, 4, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'organisation_type', 'Organisation type', 'select', 
   NULL, '{"options": ["HES", "RES", "PRC", "PUB", "INT", "OTH"]}', 
   'HES=Higher Education, RES=Research, PRC=Private, PUB=Public, INT=International, OTH=Other.', true, true, 5, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'role', 'Role in project', 'select', 
   NULL, '{"options": ["Beneficiary", "Affiliated Entity", "Associated Partner", "Third Party"]}', 
   'Select the participant''s role in the project.', true, true, 6, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'is_sme', 'Is the organisation an SME?', 'radio', 
   NULL, '{"options": ["Yes", "No"]}', 
   'Small and Medium Enterprise as defined by EU Recommendation 2003/361.', false, true, 7, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'primary_contact_name', 'Primary contact name', 'text', 
   'e.g., Dr. Jane Smith', NULL, 
   'Full name of the person receiving official communications.', true, true, 8, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'primary_contact_email', 'Primary contact email', 'email', 
   'contact@organisation.eu', '{"pattern": "^[^@]+@[^@]+\\\\.[^@]+$"}', 
   'Email address for official communications.', true, true, 9, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'primary_contact_phone', 'Primary contact phone', 'text', 
   '+358 1234567890', NULL, 
   'Phone number including country code.', false, true, 10, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'department', 'Department/Unit', 'text', 
   'e.g., Department of Computer Science', NULL, 
   'Specific department or unit within the organisation.', false, true, 11, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'address', 'Street address', 'text', 
   'e.g., 123 Research Boulevard', NULL, 
   'Street address of the organisation.', false, true, 12, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'city', 'City', 'text', 
   'e.g., Helsinki', NULL, 
   'City where the organisation is located.', false, true, 13, true),
  
  (gen_random_uuid(), '00000000-0002-0002-0000-000000000001', 'postal_code', 'Postal code', 'text', 
   'e.g., 00100', NULL, 
   'Postal/ZIP code.', false, true, 14, true);