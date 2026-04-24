-- 1. Background-execution columns
ALTER TABLE public.proposal_analyses
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS error_message text;

UPDATE public.proposal_analyses SET status = 'complete' WHERE status IS NULL;

-- 2. Map thematic areas to the four approved values
UPDATE public.evaluator_personas SET thematic_area = 'Data & AI'
  WHERE thematic_area ILIKE '%data%' OR thematic_area ILIKE '%digital%' OR thematic_area ILIKE '%ai%';

UPDATE public.evaluator_personas SET thematic_area = 'Health & Wellbeing'
  WHERE thematic_area ILIKE '%health%' OR thematic_area ILIKE '%well%';

UPDATE public.evaluator_personas SET thematic_area = 'Circular Economy'
  WHERE thematic_area ILIKE '%circular%' OR thematic_area ILIKE '%climate%' OR thematic_area ILIKE '%environment%';

UPDATE public.evaluator_personas SET thematic_area = 'Democracy & Trust'
  WHERE thematic_area NOT IN ('Circular Economy', 'Data & AI', 'Democracy & Trust', 'Health & Wellbeing')
     OR thematic_area IS NULL;

-- 3. Diversify personas
UPDATE public.evaluator_personas SET
  name = 'R&D director, major technology company',
  brief = 'Leads applied research in a large tech firm; evaluates commercial viability, scalability, and whether academic proposals translate to real-world deployment'
WHERE name ILIKE '%interoperability engineer%' OR name ILIKE '%data interoperability%';

UPDATE public.evaluator_personas SET
  name = 'Circular economy entrepreneur, SME founder',
  brief = 'Founded and scaled a circular materials startup; evaluates business model credibility, market realism, and whether proposals go beyond theory'
WHERE name ILIKE '%circular business model%';

UPDATE public.evaluator_personas SET
  name = 'Impact investor, sustainable finance',
  brief = 'Manages an ESG-focused fund; evaluates investment readiness, EU taxonomy alignment, and whether proposals can attract follow-on private capital'
WHERE name ILIKE '%sustainable finance%' OR name ILIKE '%ESG investor%';

UPDATE public.evaluator_personas SET
  name = 'Senior EU policy officer, digital regulation',
  brief = 'Works within EU institutions on digital policy; evaluates regulatory alignment, policy uptake pathways, and institutional feasibility'
WHERE name ILIKE '%national data infrastructure%';

UPDATE public.evaluator_personas SET
  name = 'Government innovation adviser',
  brief = 'Advises national ministries on R&I strategy; evaluates whether proposals align with public sector priorities and have realistic adoption pathways'
WHERE name ILIKE '%science-policy interface%';

UPDATE public.evaluator_personas SET
  name = 'NGO director, transparency and accountability',
  brief = 'Leads a civil society organisation focused on governance; scrutinises power structures, conflict of interest, and whether proposals genuinely serve the public interest'
WHERE name ILIKE '%transparency and accountability%';

UPDATE public.evaluator_personas SET
  name = 'Patient advocacy organisation representative',
  brief = 'Represents patients in policy and research settings; scrutinises whether health interventions are truly person-centred, accessible, and co-designed with affected communities'
WHERE name ILIKE '%patient and citizen%';

UPDATE public.evaluator_personas SET
  name = 'SME owner, environmental services sector',
  brief = 'Runs a small environmental consultancy; evaluates whether proposals are accessible to smaller partners, realistic about SME capacity, and commercially viable at scale'
WHERE name ILIKE '%SME and startup%';

UPDATE public.evaluator_personas SET
  name = 'Health tech startup founder',
  brief = 'Founded a digital health company; evaluates commercialisation paths, regulatory timelines, and genuine patient benefit'
WHERE name ILIKE '%regulatory affairs specialist%';

INSERT INTO public.evaluator_personas (name, brief, thematic_area, active)
SELECT 'Supply chain director, multinational manufacturer',
       'Oversees sustainable sourcing across a large industrial group; evaluates whether proposals address real supply chain constraints and have genuine industry buy-in',
       'Circular Economy', true
WHERE NOT EXISTS (SELECT 1 FROM public.evaluator_personas WHERE name = 'Supply chain director, multinational manufacturer');

INSERT INTO public.evaluator_personas (name, brief, thematic_area, active)
SELECT 'Civil servant, national digital transformation unit',
       'Implements digital public services at national level; evaluates whether proposals have credible public sector adoption plans and understand procurement realities',
       'Data & AI', true
WHERE NOT EXISTS (SELECT 1 FROM public.evaluator_personas WHERE name = 'Civil servant, national digital transformation unit');