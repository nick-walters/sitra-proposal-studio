

## Fix: Scrolling + Template Content Contamination

### Issue 1: Scrolling Not Working in Proposal Editor

**Root Cause:**
The ProposalEditor's `<main>` element (line 1142) has `flex-1 flex flex-col min-h-0` but is missing `overflow-hidden`. Without this, flex children that have `overflow-y-auto` don't get properly height-constrained -- the browser doesn't know the container has a bounded height, so the inner `overflow-y-auto` never activates.

Additionally, the first `ParticipantDetailForm` rendering path (lines 576-601, when navigating from participant list) is NOT wrapped in a scrollable `<div className="flex-1 overflow-y-auto">` like other content areas.

**Fix:**
1. Add `overflow-hidden` to the `<main>` element in `ProposalEditor.tsx` (line 1142):
   - Change: `flex-1 flex flex-col min-h-0` to `flex-1 flex flex-col min-h-0 overflow-hidden`

2. Wrap the first `ParticipantDetailForm` (lines 576-601) in a scrollable container:
   - Add `<div className="flex-1 overflow-y-auto">` wrapper around it, matching the pattern used everywhere else

---

### Issue 2: Template B3.1 Contains Greentech Content

**Root Cause:**
The `template_sections` table contains a row for section `B3.1` (ID: `00000000-0003-0003-0001-000000000002`) with a large `placeholder_content` field. This placeholder contains pre-built HTML tables (3.1a through 3.1h) with static table structures.

When a new proposal is created and the user opens section B3.1:
1. The `useSectionContent` hook checks for `section_content` in the database for this proposal
2. If no content exists yet (which is the case for new proposals), it falls back to `placeholderContent` from the template section definition
3. This `placeholderContent` is stored in `template_sections.placeholder_content` and contains the old static HTML tables
4. The blue banner "Template placeholder text" appears because `isPlaceholder` is set to `true`

The problem is compounded by the fact that Section B3.1 now uses the `B31SectionContent` component to render dynamic, live tables (deliverables, milestones, effort matrix, etc.) pulled from the WP drafts system. The old placeholder HTML tables are redundant and conflict with the dynamic rendering.

**The "Greentech content" issue:** If a user edited section 3.1 in the Greentech proposal, that content was saved to `section_content`. But any content from Greentech's proposal-specific edits wouldn't leak to other proposals because `section_content` is keyed by `proposal_id`. What IS leaking is the `placeholder_content` from the shared `template_sections` table, which was likely populated with sample/demo content at some point and now shows up in every new proposal.

**Fix:**
1. Clear the `placeholder_content` column for section B3.1 in the `template_sections` table via a database migration. Section B3.1's content is entirely generated dynamically by `B31SectionContent`, so no placeholder is needed.

2. Also clear `placeholder_content` for section B1.1 (ID: `00000000-0003-0001-0001-000000000001`), which contains sample guidance text that would also appear as pre-filled content in every new proposal. New proposals should start with empty Part B sections.

---

### Technical Details

**File: `src/pages/ProposalEditor.tsx`**

Change 1 -- Add `overflow-hidden` to `<main>` (line 1142):
```tsx
// Before:
<main className="flex-1 flex flex-col min-h-0">

// After:
<main className="flex-1 flex flex-col min-h-0 overflow-hidden">
```

Change 2 -- Wrap first ParticipantDetailForm in scrollable container (lines 576-601):
```tsx
// Before:
return (
  <ParticipantDetailForm ... />
);

// After:
return (
  <div className="flex-1 overflow-y-auto">
    <ParticipantDetailForm ... />
  </div>
);
```

**Database Migration:**
```sql
UPDATE template_sections
SET placeholder_content = NULL
WHERE id IN (
  '00000000-0003-0001-0001-000000000001',
  '00000000-0003-0003-0001-000000000002'
);
```

This clears placeholder content from B1.1 and B3.1 template sections so new proposals start with truly empty Part B sections.

