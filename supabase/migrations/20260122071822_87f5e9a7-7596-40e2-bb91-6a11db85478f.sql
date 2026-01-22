-- Update RIA Stage 1 guidelines with complete official EC content, Sitra tips, and evaluation criteria

-- B1.1 Objectives & Ambition - Official Guidelines (enhanced)
UPDATE section_guidelines 
SET content = 'Describe the specific objectives for the project, which should be clear, measurable, realistic and achievable within the duration of the project. Objectives should be consistent with the expected exploitation and impact of the project as set out in Section 2.

**State of the Art and Progress Beyond**
Explain how your project will move beyond the state-of-the-art and the extent the proposed work is ambitious. Show how the objectives build on and advance current knowledge and capacity to address the call''s expected outcomes.

Where relevant, describe any national or international R&I activities which will be linked with the project (and explain how these activities will be aligned with Horizon Europe requirements).

**Technology Readiness Level**
Indicate the TRL at the start and at the end of the project. For guidance on TRL, please see the General Annexes of the Work Programme.

**Contribution to Work Programme Objectives**
Explain how the proposal addresses the expected outcomes and topic objectives of the call. Demonstrate that your project will contribute to the broader destination and mission objectives if applicable.'
WHERE id = '69b8a77e-f786-410d-a7eb-82474c0b27bd';

-- B1.1 Objectives & Ambition - Sitra Tips (enhanced)
UPDATE section_guidelines 
SET content = '**✓ Be SMART with objectives** — Specific, Measurable, Achievable, Relevant, Time-bound. Evaluators look for tangible outcomes, not vague aspirations. Aim for 3-5 clear objectives maximum.

**✓ Quantify your ambition** — Use concrete metrics: "improve efficiency by 40%" not "significantly improve efficiency". Reference baseline data from literature or preliminary results.

**✓ Map to call text** — Explicitly link each objective to the expected outcomes in the call. Use the exact terminology from the work programme. Create a clear table mapping objectives to call requirements.

**✓ State-of-the-art analysis** — Include a brief but comprehensive review of competing approaches and explain why yours is superior. Include recent publications (2023-2026). Reference key projects (H2020, HE) and explain how you build upon them.

**✓ TRL clarity** — Be precise about starting and target TRL. Include a brief justification if claiming TRL advancement of more than 2-3 levels. Consider different TRLs for different technology components.

**✓ Show the gap** — Clearly articulate what is currently missing or inadequate, and how your project fills this gap. The more specific the gap, the stronger the case.

**⚠ Common pitfalls:** Objectives that are too broad or too numerous, missing link to call outcomes, claiming novelty without evidence, unrealistic TRL jumps, not addressing all aspects of the call.'
WHERE id = '2a813ca5-8706-4418-9341-7b2a391688b7';

-- B1.1 Excellence Evaluation Criteria (enhanced)
UPDATE section_guidelines 
SET content = '**Threshold: 4/5** | **Weight: 50%** (combined Excellence score for Stage 1)

**Evaluators will assess:**

**1. Clarity and pertinence of objectives (Score 0-5)**
• Are the objectives SMART (Specific, Measurable, Achievable, Relevant, Time-bound)?
• Do they clearly address the expected outcomes stated in the call?
• Is there a logical link between objectives and the proposed methodology?

**2. Ambition and progress beyond state-of-the-art (Score 0-5)**
• Does the proposal demonstrate comprehensive knowledge of the current state-of-the-art?
• Is the proposed advancement realistic yet genuinely ambitious?
• Are competing approaches adequately analysed and differentiated from?

**3. Soundness of methodology (Score 0-5)**
• Are the underlying concepts, models and assumptions credible?
• Is the proposed approach plausible for achieving the objectives?
• Are risks identified and mitigation strategies adequate?

**Key indicators of a 5/5 score:** Exceptional objectives perfectly aligned with call, outstanding ambition with credible advancement path, methodology that demonstrates innovative yet proven approaches.'
WHERE id = 'dae281d6-e0d4-4dda-825d-36e3e83da948';

-- B1.2 Methodology - Official Guidelines (enhanced)
UPDATE section_guidelines 
SET content = 'Describe and explain the overall methodology, including the concepts, models and assumptions that underpin your work. Explain how this will enable you to deliver your project''s objectives. Refer to any important challenges you may have identified in the relevant section of Part A and show how you will overcome them.

**Gender Dimension**
Where relevant, describe how the gender dimension (sex and/or gender analysis) is taken into account in the project''s research and innovation content. If you do not consider such a gender dimension to be relevant in your project, please provide a justification.

**Open Science and Data Management**
Where relevant, describe how you will manage research data and allow reuse taking into account the principle of ''as open as possible, as closed as necessary'' and the requirements in the call. Outline your approach to FAIR data principles.

**Interdisciplinary Approaches**
Describe any relevant inter-disciplinary approaches proposed and identify any significant collaboration with stakeholders including citizens and civil society organisations.

**Technical Approach**
Describe the technical approach you will follow, the research activities and the methodologies you will use. Explain how these relate to the project objectives.'
WHERE id = '240b2756-e8ba-459f-9278-f4bffdcf42b4';

-- B1.2 Methodology - Sitra Tips (enhanced)
UPDATE section_guidelines 
SET content = '**✓ Show the logic** — Use a clear work package structure that demonstrates logical progression. Consider including a simplified methodology diagram or flowchart. Show dependencies between work packages.

**✓ Risk awareness** — Acknowledge methodological challenges and include mitigation strategies. This shows maturity, not weakness. Use a risk matrix (probability × impact) for key technical risks.

**✓ Gender dimension** — Even in technical projects, consider if user research, testing, or deployment might involve gender-relevant factors. Consult the Gendered Innovations resources for guidance. If genuinely not applicable, state this clearly with justification.

**✓ Open Science** — Be specific about data management: what data will be generated, how will it be stored, how will it be shared, what licenses will apply. Reference FAIR principles explicitly. Mention data repositories you will use.

**✓ Interdisciplinarity** — Name specific disciplines and explain how they will interact. Show how SSH (Social Sciences & Humanities) integration adds value if relevant. Avoid generic statements like "multi-disciplinary team".

**✓ Visual communication** — Include at least one high-quality figure illustrating your methodology. A "project concept" diagram is highly effective for Stage 1.

**⚠ Common pitfalls:** Over-complex methodology diagrams, missing gender justification, vague data management statements, claiming interdisciplinarity without demonstrating it.'
WHERE id = '91da951d-a3f5-4aab-8c2b-b6a76d409b62';

-- B2.1 Pathways to Impact - Official Guidelines (enhanced)
UPDATE section_guidelines 
SET content = 'Describe how the project''s results will contribute to the expected impacts mentioned in the Work Programme under the relevant topic.

**Expected Outcomes**
Describe how the project''s results will directly contribute to the expected outcomes of the call. Show the clear logical pathway from project outputs to these outcomes.

**Wider Impacts**
Describe the potential for the proposed outcomes to contribute to any wider scientific, economic, societal or environmental impacts. Identify the target groups, including research communities, industry sectors, policy makers, civil society, or other relevant stakeholders.

**Scale and Significance**
Describe the scale and significance of the project''s contribution to the expected impacts. Consider both short-term and long-term impacts.

**Barriers and Critical Risks**
Identify any barriers/obstacles and critical risks that may affect the achievement of the expected impacts, and outline measures to address them.

**Pathways to Impact**
Describe concrete measures and milestones for achieving the impacts. Include timing, responsible partners, and key performance indicators where possible.'
WHERE id = '251e1156-dc1a-4fda-8a55-193101561f15';

-- B2.1 Pathways to Impact - Sitra Tips (enhanced)
UPDATE section_guidelines 
SET content = '**✓ Think like an evaluator** — Impact is weighted 50% in Stage 1. Make every sentence count. Focus on credibility and specificity rather than grandiose claims.

**✓ Logic chain** — Build a clear narrative: Project outputs → Short-term outcomes → Medium-term impacts → Long-term transformation. Use the Horizon Europe "Impact Framework" structure.

**✓ Quantify impacts** — Use numbers wherever possible: "potential to reach 50,000 SMEs" rather than "wide reach". Include market sizes, user numbers, emission reductions, etc.

**✓ Identify beneficiaries** — Name specific types of organisations, communities, or sectors that will benefit. Show you understand their needs and how your project addresses them.

**✓ Address barriers realistically** — Acknowledge real-world barriers to adoption (regulatory, market, behavioural) and explain how you will overcome them. This shows maturity.

**✓ Consider SDGs** — Link impacts to relevant UN Sustainable Development Goals where appropriate. This provides a universal framework for societal impact.

**✓ Use the impact pathway diagram** — The Sitra Proposal Studio includes an Impact Pathway Generator that creates publication-ready diagrams. Use it!

**⚠ Common pitfalls:** Vague impact claims without evidence, ignoring barriers to adoption, focusing only on academic impacts, disconnection between project outputs and claimed impacts.'
WHERE id = 'ca642164-150b-40bd-a48c-18570c612c2a';

-- B2.1 Impact Evaluation Criteria (enhanced)
UPDATE section_guidelines 
SET content = '**Threshold: 4/5** | **Weight: 50%** (combined Impact score for Stage 1)

**Evaluators will assess:**

**1. Contribution to expected outcomes (Score 0-5)**
• Does the proposal clearly address the expected outcomes in the call?
• Is the logical pathway from outputs to outcomes credible and well-articulated?
• Are the proposed outcomes realistic within the project timeframe?

**2. Scale and significance of impacts (Score 0-5)**
• Are the potential wider impacts (scientific, economic, societal, environmental) significant?
• Is the scale of impact appropriate to the funding requested?
• Are target beneficiaries clearly identified and well-understood?

**3. Barriers and pathways (Score 0-5)**
• Are relevant barriers and risks identified?
• Are mitigation measures credible and proportionate?
• Is there a clear, feasible pathway to achieving the impacts?

**Key indicators of a 5/5 score:** Outstanding impact potential that clearly addresses EU priorities, compelling and credible pathway with measurable milestones, excellent understanding of target beneficiaries and realistic assessment of barriers.'
WHERE id = '8bf7484c-c9e7-43cb-9c7f-9652e2bf7338';