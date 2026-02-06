
# Plan: Enhanced Part A2 Participant Form (Official EC Compliance)

## Overview

This plan adds the missing fields from the official Horizon Europe RIA/IA Standard Application Form (Version 10.0, January 2026) to the Part A2 (Participants) section. The goal is to match the exact structure and field requirements of the official EC form.

## Current State Analysis

### Already Implemented
- Organisation details (legal name, short name, address, country, PIC, legal entity type, SME status)
- Main contact person (title, position, email, phone)
- Basic dependency declaration (free text)
- Basic GEP (yes/no checkbox, conditional on organisation type)
- Team members (name, email, role, person-months)

### Missing from Official Form (All High Priority)

| Section | Official Requirement |
|---------|---------------------|
| Researchers Table | Full researcher details with career stage, ORCID, gender, nationality |
| Organisation Roles | 16 checkboxes defining organisation's role in project |
| Publications | Up to 5 achievements (publications, datasets, software, etc.) |
| Previous Projects | Up to 5 relevant previous projects |
| Infrastructure | Significant infrastructure/equipment descriptions |
| Enhanced GEP | Detailed GEP building blocks and content areas |
| Main Contact | Separate first/last name, gender field, full address fields |
| Dependencies | Structured link type selector (Same group, Controls, Is controlled by) |

## Implementation Plan

### Phase 1: Database Schema Updates

Create new tables and update existing ones:

**1. New Table: `participant_researchers`**
```text
- id (uuid, PK)
- participant_id (FK to participants)
- title (text) - Dr., Prof., Mr., Ms., Mx.
- first_name (text)
- last_name (text)
- gender (text) - Woman, Man, Non-binary
- nationality (text)
- email (text)
- career_stage (text) - Category A/B/C/D
- role_in_project (text) - Team member, etc.
- reference_identifier (text) - ORCID ID, etc.
- identifier_type (text) - ORCID, ResearcherID, Other
- order_index (int)
```

**2. New Table: `participant_organisation_roles`**
```text
- id (uuid, PK)
- participant_id (FK to participants)
- role_type (text) - Enum of 16+ role types
- other_description (text) - For "Other" role
```

**3. New Table: `participant_achievements`**
```text
- id (uuid, PK)
- participant_id (FK to participants)
- achievement_type (text) - Publication, Dataset, Software, Good, Service, Other
- description (text) - With DOI/PID
- order_index (int)
```

**4. New Table: `participant_previous_projects`**
```text
- id (uuid, PK)
- participant_id (FK to participants)
- project_name (text)
- description (text)
- order_index (int)
```

**5. New Table: `participant_infrastructure`**
```text
- id (uuid, PK)
- participant_id (FK to participants)
- name (text)
- description (text)
- order_index (int)
```

**6. Update `participants` Table** - Add Main Contact columns:
```text
- main_contact_first_name (text)
- main_contact_last_name (text)
- main_contact_gender (text) - Woman, Man, Non-binary
- main_contact_street (text)
- main_contact_town (text)
- main_contact_postcode (text)
- main_contact_country (text)
- use_organisation_address (boolean) - default true
```

**7. Update `participants` Table** - Add GEP detail columns:
```text
- gep_publication (boolean)
- gep_dedicated_resources (boolean)
- gep_data_collection (boolean)
- gep_training (boolean)
- gep_work_life_balance (boolean)
- gep_gender_leadership (boolean)
- gep_recruitment_progression (boolean)
- gep_research_teaching (boolean)
- gep_gender_violence (boolean)
```

**8. New Table: `participant_dependencies`**
```text
- id (uuid, PK)
- participant_id (FK to participants)
- linked_participant_id (FK to participants)
- link_type (text) - Same group, Controls, Is controlled by
```

### Phase 2: UI Components

**1. New Component: `ResearchersTable.tsx`**
- Displays researchers in a table format matching EC form
- Add/edit/delete functionality with inline editing
- Fields: Title, First Name, Last Name, Gender, Nationality, Email, Career Stage, Role, Reference ID
- Career stage definitions shown as tooltips (Category A-D explanations)

**2. New Component: `OrganisationRolesSection.tsx`**
- 16+ checkboxes in a grid layout matching EC form
- Includes "Other" option with text input
- Role options:
  - Project management
  - Communication, dissemination and engagement
  - Provision of research and technology infrastructure
  - Co-definition of research and market needs
  - Civil society representative
  - Policy maker or regulator, incl. standardisation body
  - Research performer
  - Technology developer
  - Testing/validation of approaches and ideas
  - Prototyping and demonstration
  - IPR management incl. technology transfer
  - Public procurer of results
  - Private buyer of results
  - Finance provider (public or private)
  - Education and training
  - Contributions from the social sciences or/and the humanities
  - Other (specify)

**3. New Component: `AchievementsSection.tsx`**
- List of up to 5 achievements
- Dropdown for type (Publication, Dataset, Software, Good, Service, Other)
- Text area for description with DOI/PID guidance
- Matches EC form wording about open access expectations

**4. New Component: `PreviousProjectsSection.tsx`**
- List of up to 5 previous projects
- Fields: Project name, Short description

**5. New Component: `InfrastructureSection.tsx`**
- List of significant infrastructure/equipment
- Fields: Name, Short description

**6. New Component: `GEPSection.tsx`**
- Replaces simple yes/no with detailed checklist
- Section 1: Minimum process-related requirements (building blocks)
  - Publication checkbox
  - Dedicated resources checkbox
  - Data collection and monitoring checkbox
  - Training checkbox
- Section 2: Recommended content areas
  - Work-life balance and organisational culture
  - Gender balance in leadership and decision-making
  - Gender equality in recruitment and career progression
  - Integration of gender dimension into research and teaching content
  - Measures against gender-based violence including sexual harassment

**7. New Component: `DependenciesSection.tsx`**
- Replace free text with structured entries
- Link type selector + participant selector
- Keep free text area for additional notes

**8. Enhanced: `MainContactSection` in `ParticipantDetailForm.tsx`**
- Add first_name, last_name fields (separate from full name)
- Add gender selector (Woman, Man, Non-binary)
- Add address fields with "Same as organisation address" checkbox

### Phase 3: Update ParticipantDetailForm Layout

Reorganize `ParticipantDetailForm.tsx` to match EC form order:
1. Organisation details (existing)
2. Department (existing)
3. Links with other participants (enhanced)
4. Main contact person (enhanced)
5. Other contact persons (existing team members, minor updates)
6. Researchers involved in the proposal (NEW)
7. Role of participating organisation in the project (NEW)
8. List of up to 5 achievements (NEW)
9. List of up to 5 previous projects (NEW)
10. Description of infrastructure/equipment (NEW)
11. Gender Equality Plan (enhanced)

### Phase 4: Type Definitions

Update `src/types/proposal.ts`:
- Add interfaces for new data structures
- Add enums for Career Stage, Achievement Type, Organisation Roles, Link Types
- Update Participant interface with new fields

## Technical Details

### Career Stage Categories (exact EC wording)
- **Category A - Leading researcher**: The single highest grade/post at which research is normally conducted (e.g., Full professor, Director of research)
- **Category B - Senior researcher**: Researchers working in positions not as senior as top position but more senior than newly qualified doctoral graduates (e.g., Associate professor, Senior researcher, Principal investigator)
- **Category C - Recognised researcher**: The first grade/post into which a newly qualified doctoral graduate would normally be recruited (e.g., Assistant professor, Investigator, Post-doctoral fellow)
- **Category D - First stage researcher**: Either doctoral students at ISCED level 8 who are engaged as researchers, or researchers working in posts that do not normally require a doctorate degree (e.g., PhD students, Junior researchers without PhD)

### Achievement Types
- Publication
- Dataset
- Software
- Good
- Service
- Other achievement

### Reference Identifier Types
- ORCID
- ResearcherID
- Other (specify)

### Link Types
- Same group
- Controls
- Is controlled by

## Files to Create/Modify

### New Files
- `src/components/participant/ResearchersTable.tsx`
- `src/components/participant/OrganisationRolesSection.tsx`
- `src/components/participant/AchievementsSection.tsx`
- `src/components/participant/PreviousProjectsSection.tsx`
- `src/components/participant/InfrastructureSection.tsx`
- `src/components/participant/GEPSection.tsx`
- `src/components/participant/DependenciesSection.tsx`
- `src/hooks/useParticipantDetails.ts` (for managing new tables)

### Modified Files
- `src/components/ParticipantDetailForm.tsx` - Major restructure to include new sections
- `src/types/proposal.ts` - Add new interfaces and enums
- Database migrations for new tables

## Implementation Order

1. Database migrations (create tables, update participants)
2. Type definitions update
3. Create new hook for fetching/updating participant details
4. Create ResearchersTable component
5. Create OrganisationRolesSection component
6. Create AchievementsSection component
7. Create PreviousProjectsSection component
8. Create InfrastructureSection component
9. Create enhanced GEPSection component
10. Update MainContactSection with new fields
11. Create DependenciesSection component
12. Integrate all sections into ParticipantDetailForm
13. Testing and validation
