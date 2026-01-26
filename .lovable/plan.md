
# Checklist & Plan for Finalising Incomplete Functions

## Executive Summary
After thorough analysis of the codebase, I've identified 12 incomplete or partially-implemented features that need to be finalized. These range from minor cleanup tasks to significant feature implementations.

---

## Incomplete Features Checklist

### Priority 1: Critical Missing Functionality

| # | Feature | Status | Effort |
|---|---------|--------|--------|
| 1 | **Duplicate Proposal** | Placeholder only (toast message, no actual copy) | Medium |
| 2 | **Part A3 (Budget) - Access Control** | Missing admin/owner restriction like A1/A2 | Low |
| 3 | **Block Drag Handle Integration** | Code exists but delete confirmation missing | Low |

### Priority 2: Deferred Features (User Mentioned)

| # | Feature | Status | Effort |
|---|---------|--------|--------|
| 4 | **Part A3 - Sitra's Tips** | Not added (A1 and A2 have tips, A3 does not) | Low |
| 5 | **Part A3 - Full Implementation** | User stated "we'll build this later" | High |

### Priority 3: Code Cleanup & Technical Debt

| # | Feature | Status | Effort |
|---|---------|--------|--------|
| 6 | **EditorToolbar.tsx** | Unused component (replaced by FormattingToolbar) | Low |
| 7 | **Global Role Placeholder** | Uses UUID zeros for proposal_id in InitialSetup | Low |
| 8 | **ResizableImage Drag Handle** | Plan says to remove, but may already be handled | Low |

### Priority 4: Pending Planned Work

| # | Feature | Status | Effort |
|---|---------|--------|--------|
| 9 | **Block Drag-and-Drop** | Extension exists, plan file shows integration pending | Medium |
| 10 | **Template Placeholder Content** | DB field exists but not used in editor pre-fill | Low |
| 11 | **Budget Work Package Sync** | Lump sum categories hardcoded, not from work_packages table | Medium |
| 12 | **Figure Caption Renumbering after Drag** | Listed in plan success criteria | Low |

---

## Detailed Implementation Plans

### 1. Duplicate Proposal (Priority 1)

**Current State**: The `handleDuplicateProposal` function in `ProposalEditor.tsx` only shows a toast message.

**Required Work**:
- Create database function or edge function to copy all related data
- Tables to copy: `proposals`, `section_content`, `participants`, `participant_members`, `budget_items`, `work_packages`, `member_wp_allocations`, `ethics_assessment`, `figures`, `references`
- Update the new proposal's acronym, title, and set status to 'draft'
- Clear any user-specific assignments

**Files to Modify**:
- `src/pages/ProposalEditor.tsx` - Implement actual copy logic
- Optionally: Create `supabase/functions/duplicate-proposal/index.ts` for complex transaction

---

### 2. Part A3 Access Control (Priority 1)

**Current State**: A3 (Budget) is editable by anyone with `canEdit`, unlike A1 which restricts to admins/owners.

**Required Work**:
- Add similar access control pattern as A1
- Decide: Should only admins edit budget, or should participants edit their own rows?

**Files to Modify**:
- `src/pages/ProposalEditor.tsx` - Add `isAdmin` check to A3 section (lines 382-400)

---

### 3. Block Drag Handle Delete Confirmation (Priority 1)

**Current State**: The `onDeleteRequest` callback exists in `BlockDragHandle.ts` but no confirmation dialog is wired up.

**Required Work**:
- Wire up an AlertDialog in DocumentEditor to confirm block deletion
- Pass the `onDeleteRequest` callback to the extension

**Files to Modify**:
- `src/components/DocumentEditor.tsx` - Add confirmation dialog state and handler

---

### 4. Part A3 Sitra's Tips (Priority 2)

**Current State**: A1 and A2 have Sitra's Tips from the database, A3 does not.

**Required Work**:
- Insert tips into `section_guidelines` table for A3 section
- Modify BudgetSpreadsheetEnhanced to accept and display tips

**Files to Modify**:
- Database migration: Insert A3 tips
- `src/components/BudgetSpreadsheetEnhanced.tsx` - Add SitraTipsBox
- `src/pages/ProposalEditor.tsx` - Pass section to BudgetSpreadsheetEnhanced

---

### 5. Part A3 Full Build-Out (Priority 2 - Deferred)

User explicitly stated this will be built later. Placeholder for tracking.

---

### 6. Remove Unused EditorToolbar (Priority 3)

**Current State**: `EditorToolbar.tsx` is defined but never imported/used.

**Required Work**:
- Delete `src/components/EditorToolbar.tsx`

---

### 7. Global Role Placeholder UUID (Priority 3)

**Current State**: `InitialSetup.tsx` uses `'00000000-0000-0000-0000-000000000000'` as proposal_id for global roles.

**Required Work**:
- Decide if this is intentional (global roles don't need real proposal)
- If so, add comment explaining the pattern
- If not, implement proper global role handling

**Files to Modify**:
- `src/pages/admin/InitialSetup.tsx` - Add explanatory comment or refactor

---

### 8. ResizableImage Drag Handle (Priority 3)

**Current State**: Plan file mentions removing non-functional drag handle from ResizableImage, but BlockDragHandle now provides this globally.

**Required Work**:
- Verify if ResizableImage still has redundant drag handle code
- Remove if present

**Files to Check**:
- `src/components/ResizableImage.tsx`

---

### 9. Block Drag-and-Drop Final Integration (Priority 4)

**Current State**: `BlockDragHandle.ts` exists and is imported in `RichTextEditor.tsx`. Core functionality works.

**Required Work** (per .lovable/plan.md):
- Verify CSS styles for `.block-drag-container`, `.block-drop-indicator` exist
- Test caption bundling with figures/tables
- Ensure H1/H2 remain immovable

**Files to Verify**:
- `src/index.css` - Check for drag-related styles

---

### 10. Template Placeholder Content (Priority 4)

**Current State**: `placeholder_content` field exists in database schema but isn't used to pre-fill new sections.

**Required Work**:
- When a user opens a section for the first time, populate editor with placeholder content
- Check in `useSectionContent.ts` or `DocumentEditor.tsx`

**Files to Modify**:
- `src/hooks/useSectionContent.ts` or `src/components/DocumentEditor.tsx`

---

### 11. Budget/Work Package Sync (Priority 4)

**Current State**: `LUMP_SUM_CATEGORIES` in `BudgetSpreadsheetEnhanced.tsx` are hardcoded (WP1-WP8), not fetched from actual `work_packages` table.

**Required Work**:
- Fetch work packages for the proposal
- Use them as categories when budget type is 'lump_sum'

**Files to Modify**:
- `src/components/BudgetSpreadsheetEnhanced.tsx` - Accept work packages as prop
- `src/pages/ProposalEditor.tsx` - Pass work packages to component

---

### 12. Figure Caption Renumbering After Drag (Priority 4)

**Current State**: Plan mentions this as success criterion, but may not be triggered after drag operations.

**Required Work**:
- Verify `renumberCaptions` is called after drag transactions complete
- If not, add call in BlockDragHandle's drop handler

**Files to Modify**:
- `src/extensions/BlockDragHandle.ts` - Trigger renumbering after drop

---

## Recommended Implementation Order

1. **Quick Wins** (1-2 hours each):
   - Remove `EditorToolbar.tsx`
   - Add A3 access control
   - Add A3 Sitra's Tips
   - Wire up block delete confirmation

2. **Medium Effort** (4-8 hours each):
   - Implement Duplicate Proposal fully
   - Sync budget with work packages

3. **Verification Tasks** (1-2 hours):
   - Test block drag-and-drop end-to-end
   - Verify placeholder content usage
   - Confirm caption renumbering works

4. **Deferred**:
   - Part A3 full build-out (per user request)

---

## Database Tables Referenced

The application uses 36 tables. Key ones for incomplete features:
- `proposals` - Core proposal data
- `section_content` - Rich text content for sections
- `section_guidelines` - Tips and guidelines (need A3 entries)
- `participants`, `participant_members` - Consortium data
- `budget_items` - Budget entries
- `work_packages` - Project structure
- `figures`, `references` - Assets

---

## Success Metrics

After implementing all Priority 1-3 items:
- Duplicate Proposal creates a complete copy of all proposal data
- A3 Budget follows same access control pattern as A1/A2
- Sitra's Tips appear in all Part A sections (A1, A2, A3)
- Block deletion shows confirmation dialog
- No unused components remain in codebase
