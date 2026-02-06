
# Plan: Full RIA Template - Part A Enhancements and GEP Checkbox

## Overview

This plan addresses the following improvements:
1. GEP (Gender Equality Plan) checkbox with correct conditional display logic
2. Part A forms alignment with official EC Full RIA template
3. Export functionality changes (rename button, remove A3 export)
4. Add missing A4 (Ethics & Security) and A5 (Other Questions) sections

---

## 1. GEP Checkbox Logic

### Requirement Clarification
GEP is required ONLY for participants that meet BOTH conditions:
- **Country condition**: Located in an EU Member State OR Associated Country (NOT Third Countries)
- **Organisation type condition**: Is one of HES (Higher education), RES (Research organisation), or PUB (Public body)

### Current Infrastructure
- `src/lib/countries.ts` has `category: 'eu' | 'associated' | 'third'` for each country
- `src/components/ParticipantTable.tsx` has `OrganisationCategory` type: HES, RES, PRC, PUB, INT, OTH
- Participants table already has `country` and `organisation_category` fields

### Implementation

**Step 1: Add helper function to countries.ts**
```typescript
export const isEligibleForGEP = (countryName: string): boolean => {
  const country = ALL_COUNTRIES.find(c => c.name === countryName);
  return country?.category === 'eu' || country?.category === 'associated';
};
```

**Step 2: Add `has_gender_equality_plan` column to participants table**
- Type: boolean, nullable, default null

**Step 3: Update ParticipantDetailForm.tsx**
Add conditional GEP checkbox that appears only when:
```typescript
const showGEPCheckbox = useMemo(() => {
  const eligibleCategories = ['HES', 'RES', 'PUB'];
  const isEligibleCategory = eligibleCategories.includes(participant.organisationCategory || '');
  const isEligibleCountry = isEligibleForGEP(participant.country || '');
  return isEligibleCategory && isEligibleCountry;
}, [participant.organisationCategory, participant.country]);
```

UI display:
```text
Organisation details card:
  [existing fields...]
  
  {showGEPCheckbox && (
    <div className="space-y-2 pt-4 border-t">
      <Label>Gender Equality Plan (GEP)</Label>
      <p className="text-xs text-muted-foreground">
        Public bodies, higher education establishments, and research organisations 
        from EU Member States or Associated Countries must have a GEP in place.
      </p>
      <RadioGroup value={participant.hasGenderEqualityPlan}>
        <RadioGroupItem value="yes" label="Yes, we have a GEP" />
        <RadioGroupItem value="no" label="No GEP in place" />
      </RadioGroup>
    </div>
  )}
```

---

## 2. Part A2 - Alignment with Official EC Template

### Official EC Part A2 Fields Analysis

Based on the official Horizon Europe Application Form (Part A), Section 2 (Participants) includes:

**Per-Organisation Data (currently implemented):**
- PIC number (9 digits)
- Legal name
- Short name
- English name (if different)
- Country
- Organisation category (HES, RES, PRC, PUB, INT, OTH)
- Legal entity type
- Address

**Missing or Incomplete Fields:**

| Field | Status | Action |
|-------|--------|--------|
| Department | Missing | Add optional field for department/unit name |
| Main contact person | Partial | Exists but missing: title, position, phone |
| Researcher table | Present | Team members section exists |
| Dependencies declaration | Missing | Add declaration of links with other participants |
| SME self-declaration | Present | `is_sme` field exists |
| GEP declaration | Missing | Add (covered in section 1 above) |

### Implementation for Missing Fields

**Step 1: Database migration - Add new fields to participants table**
```sql
ALTER TABLE participants ADD COLUMN department text;
ALTER TABLE participants ADD COLUMN main_contact_title text;
ALTER TABLE participants ADD COLUMN main_contact_position text;
ALTER TABLE participants ADD COLUMN main_contact_phone text;
ALTER TABLE participants ADD COLUMN has_gender_equality_plan boolean;
ALTER TABLE participants ADD COLUMN dependency_declaration text;
```

**Step 2: Update ParticipantDetailForm.tsx**

Add new sections:

**Department Section:**
```text
<div>
  <Label>Department/unit (optional)</Label>
  <Input placeholder="e.g. Faculty of Engineering" />
  <p className="text-xs text-muted-foreground">
    Only if different from the main organisation
  </p>
</div>
```

**Main Contact Section Enhancement:**
```text
<Card>
  <CardHeader>
    <CardTitle>Main contact person</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label>Title</Label>
        <Select placeholder="Dr., Prof., Mr., Ms.">
          <SelectItem value="dr">Dr.</SelectItem>
          <SelectItem value="prof">Prof.</SelectItem>
          <SelectItem value="mr">Mr.</SelectItem>
          <SelectItem value="ms">Ms.</SelectItem>
        </Select>
      </div>
      <div>
        <Label>Full name *</Label>
        <Input />
      </div>
      <div>
        <Label>Position/Role *</Label>
        <Input placeholder="e.g. Project Manager" />
      </div>
      <div>
        <Label>Email *</Label>
        <Input type="email" />
      </div>
      <div>
        <Label>Phone</Label>
        <Input type="tel" placeholder="+358..." />
      </div>
    </div>
  </CardContent>
</Card>
```

**Dependencies Declaration:**
```text
<Card>
  <CardHeader>
    <CardTitle>Links with other participants</CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground mb-4">
      Declare any significant links with other participants in the consortium 
      (e.g. ownership, legal ties, shared resources, joint ventures).
    </p>
    <Textarea 
      placeholder="Describe any dependencies or links with other consortium members..."
      rows={3}
    />
  </CardContent>
</Card>
```

---

## 3. Export Functionality Changes

### Current State
- **A1 (GeneralInfoForm)**: "Export PDF" button at line 519-550
- **A3 (BudgetSpreadsheet)**: "Export" button at line 115-118

### Changes Required

**A1 - Rename and Scope:**
- Change button text from "Export PDF" to "Export Part B"
- Ensure only Part B sections are exported (already the case)
- Add participants table after the proposal title in exported PDF

**A3 - Remove Export:**
- Remove the export button entirely from BudgetSpreadsheet
- Part A is for data collection only, not export

### Implementation

**GeneralInfoForm.tsx (lines 520-523, 528-530):**
```typescript
// Change from:
<Download className="w-4 h-4" />
Export PDF

// Change to:
<Download className="w-4 h-4" />
Export Part B
```

**BudgetSpreadsheet.tsx (lines 115-118):**
Remove entirely:
```typescript
// DELETE THIS:
<Button variant="outline" className="gap-2">
  <Download className="w-4 h-4" />
  Export
</Button>
```

**usePdfExport.ts - Add participants table:**
After the title rendering (around line 690-720), add:
```typescript
// Add participants table after title
if (participants.length > 0) {
  yPosition += 4;
  
  // Prepare table data
  const participantRows = participants
    .sort((a, b) => (a.participantNumber || 0) - (b.participantNumber || 0))
    .map(p => [
      String(p.participantNumber || ''),
      p.organisationShortName || '',
      p.organisationName,
      p.country || ''
    ]);
  
  // Draw compact table
  await addTable({
    headers: ['No.', 'Short name', 'Legal name', 'Country'],
    rows: participantRows,
    columnWidths: [8, 20, 100, 30],
    fontSize: 9
  });
  
  yPosition += 6;
}
```

---

## 4. Add Missing A4 and A5 Sections

### A4: Ethics & Security

**Current State:**
- `EthicsForm.tsx` component exists with comprehensive ethics self-assessment
- NOT currently in the template's navigation for Full RIA

**Action:**
Add A4 section to the Full RIA template in the database.

**Database Migration:**
```sql
-- Add A4 section to Full RIA template (template_type_id for HE_RIA/IA_FULL)
INSERT INTO template_sections (
  id, template_type_id, part, section_number, title, 
  editor_type, order_index, is_required, is_active
) VALUES (
  gen_random_uuid(), 
  '33333333-3333-3333-3333-333333333333', -- Full RIA template ID
  'A', 
  'A4', 
  'Ethics & security',
  'form',
  4,
  true,
  true
);

-- Add official guideline
INSERT INTO section_guidelines (
  id, section_id, guideline_type, title, content, order_index, is_active
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM template_sections WHERE section_number = 'A4' AND template_type_id = '33333333-3333-3333-3333-333333333333'),
  'official',
  'Ethics self-assessment',
  'Complete the ethics self-assessment table. Answer YES or NO to each question. If YES, indicate the relevant section number in Part B where the ethics issue is addressed.',
  0,
  true
);

-- Add Sitra tip
INSERT INTO section_guidelines (
  id, section_id, guideline_type, title, content, order_index, is_active
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM template_sections WHERE section_number = 'A4' AND template_type_id = '33333333-3333-3333-3333-333333333333'),
  'sitra_tip',
  'Ethics assessment tips',
  'Be thorough but honest in your ethics self-assessment. Evaluators appreciate transparency. If you answer YES to ethics questions, ensure the corresponding mitigation measures are clearly described in the relevant Part B sections. Common issues include personal data processing (GDPR), activities in non-EU countries, and AI-related ethics.',
  1,
  true
);
```

### A5: Other Questions

**Content from Official EC Template:**

1. **Two-stage calls question:**
   - "For two-stage submission calls only: If the proposal is a revised version of a first stage proposal, please indicate if there are substantial changes compared to the first stage version."
   - If YES: checkboxes for Partnership, Budget, Approach with text explanations

2. **Clinical trials question (conditional):**
   - Only for calls involving clinical studies
   - Request to upload dedicated annex

**Implementation:**

**Step 1: Create OtherQuestionsForm.tsx**
```typescript
interface OtherQuestionsFormProps {
  proposalId: string;
  submissionStage: 'full' | 'stage_1';
  canEdit: boolean;
}

// Form fields:
// - isRevisedFromStage1: boolean
// - substantialChanges: { partnership: boolean, budget: boolean, approach: boolean }
// - partnershipChanges: string (text explanation)
// - budgetChanges: string (text explanation)  
// - approachChanges: string (text explanation)
// - involvesClinicalTrials: boolean (from ethics form)
// - clinicalTrialsAnnex: boolean (acknowledgment)
```

**Step 2: Database migration for A5 section**
```sql
-- Add A5 section to Full RIA template
INSERT INTO template_sections (
  id, template_type_id, part, section_number, title,
  editor_type, order_index, is_required, is_active
) VALUES (
  gen_random_uuid(),
  '33333333-3333-3333-3333-333333333333',
  'A',
  'A5',
  'Other questions',
  'form',
  5,
  true,
  true
);

-- Add guidelines for A5
INSERT INTO section_guidelines (...) VALUES (...);
```

**Step 3: Update ProposalEditor.tsx**
Add rendering logic for A4 and A5 sections:
```typescript
// In the section rendering switch/if
if (activeSection?.id === 'a4') {
  return (
    <EthicsForm
      ethics={ethics}
      onUpdateEthics={updateEthics}
      canEdit={canEdit}
    />
  );
}

if (activeSection?.id === 'a5') {
  return (
    <OtherQuestionsForm
      proposalId={id}
      submissionStage={proposal?.submissionStage || 'full'}
      canEdit={canEdit}
    />
  );
}
```

---

## 5. Section Numbering (Editor Headings)

### Requirement
- Navigation panel: Keep "B" prefix (e.g., "B1.1")
- Editor heading: Remove "B" prefix (e.g., "1.1. Objectives and ambition")

### Current Implementation
`DocumentEditor.tsx` already has `formatSectionHeading` function:
```typescript
const formatSectionHeading = (sectionNum: string) => {
  const numPart = sectionNum.replace(/^[A-Za-z]+/, '');
  return numPart ? `${numPart}.` : '';
};
```

### Verification Needed
Confirm this function is used for the main heading display in the editor. If not, update the heading rendering to use this format.

---

## Implementation Summary

### Database Migrations

| Change | Type |
|--------|------|
| Add `department` to participants | ALTER TABLE |
| Add `main_contact_title` to participants | ALTER TABLE |
| Add `main_contact_position` to participants | ALTER TABLE |
| Add `main_contact_phone` to participants | ALTER TABLE |
| Add `has_gender_equality_plan` to participants | ALTER TABLE |
| Add `dependency_declaration` to participants | ALTER TABLE |
| Add A4 section to template_sections | INSERT |
| Add A5 section to template_sections | INSERT |
| Add guidelines for A4 and A5 | INSERT |

### New Components

| Component | Purpose |
|-----------|---------|
| `OtherQuestionsForm.tsx` | A5 form for two-stage and clinical trials questions |

### Modified Components

| Component | Changes |
|-----------|---------|
| `countries.ts` | Add `isEligibleForGEP()` helper function |
| `ParticipantDetailForm.tsx` | Add GEP checkbox, department, main contact enhancements, dependencies |
| `GeneralInfoForm.tsx` | Rename export button to "Export Part B" |
| `BudgetSpreadsheet.tsx` | Remove export button |
| `usePdfExport.ts` | Add participants table after title |
| `ProposalEditor.tsx` | Add routing for A4 and A5 sections |

---

## Technical Notes

### GEP Country Detection Logic
```typescript
// Helper in countries.ts
export const isEligibleForGEP = (countryName: string): boolean => {
  const allEligible = [...EU_MEMBER_STATES, ...ASSOCIATED_COUNTRIES];
  return allEligible.some(c => c.name === countryName);
};

// Usage in ParticipantDetailForm
const GEP_ELIGIBLE_CATEGORIES = ['HES', 'RES', 'PUB'];
const showGEPCheckbox = 
  GEP_ELIGIBLE_CATEGORIES.includes(participant.organisationCategory) &&
  isEligibleForGEP(participant.country);
```

### Part A Purpose Reminder
Part A forms collect information for the coordinator to input into the Funding & Tenders Portal (FTP). They are NOT exported. This is the official workflow: collaborative data collection on the platform, manual input to the EC portal by the coordinator.
