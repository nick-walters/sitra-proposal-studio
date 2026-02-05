
# Comprehensive Code Cleanup and Feature Completion Plan

**Status: Phase 2 Complete ✅**

## Overview
This plan addresses code redundancies, inconsistencies, and incomplete features identified across the Sitra Proposal Studio codebase. The cleanup will improve maintainability, reduce duplication, and complete partially implemented functionality.

---

## Part 1: Code Cleanup and Consolidation

### 1.1 Toast Notification Consolidation

**Status: ✅ COMPLETE**

Migrated all hooks to `sonner` and deleted redundant toast files.

---

### 1.2 Centralize Participant Interface

**Status: ✅ COMPLETE**

**Completed**:
- ✅ Added `ParticipantSummary` type to `src/types/proposal.ts`
- ✅ Updated 9 components to import from central location:
  - `WPManagementCard.tsx`
  - `CaseManagementCard.tsx`
  - `WPEffortMatrix.tsx`
  - `WPDraftEditor.tsx`
  - `WPDeliverablesTable.tsx`
  - `WPTableSection.tsx`
  - `ParticipantMultiSelect.tsx`
  - `InsertParticipantReferenceDialog.tsx`
  - `src/lib/b31Population.ts`

---

### 1.3 Centralize WPDraft Interface

**Status: ✅ COMPLETE**

- ✅ `WPDraft` is exported from `src/hooks/useWPDrafts.ts`
- ✅ `InsertWPReferenceDialog.tsx` uses local lightweight `WPRefData` type (appropriate for its limited needs)
- ✅ Components that need full WPDraft import from the hook

---

### 1.4 Merge Template Type Files

**Status: ✅ COMPLETE**

Merged `templateSystem.ts` into `templates.ts` and deleted the redundant file.

---

### 1.5 Guideline Component Clarification

**Status: ✅ COMPLETE**

**Completed**:
- ✅ Added JSDoc comments to `GuidelineBox.tsx` clarifying single guideline display
- ✅ Added JSDoc comments to `SitraTipsBox.tsx` clarifying multiple tips in collapsible container
- ✅ Added JSDoc comments to `useSectionAssignment.ts` (single section CRUD)
- ✅ Added JSDoc comments to `useSectionAssignments.ts` (batch read-only for navigator)

---

### 1.6 Console.log Cleanup

**Status: ✅ COMPLETE**

Removed debug logs from frontend hooks and Dashboard.

---

## Part 2: Incomplete Features

### 2.1 Track Changes - Not Persisted to Database

**Status: 🔴 NOT STARTED**

Track changes UI exists but changes are stored only in memory.

**Required**: Database table `section_tracked_changes` and persistence logic.

---

### 2.2 WorkPackageManager vs WPManagementCard Duplication

**Status: 🟡 NEEDS EVALUATION**

Two WP management components using different tables:
- `WorkPackageManager.tsx` - Legacy, uses `work_packages` table
- `WPManagementCard.tsx` - Modern, uses `wp_drafts` table

**Action**: Evaluate if WorkPackageManager is still needed.

---

### 2.3 Section Version Comparison - Limited Functionality

**Status: 🔴 NOT STARTED**

`VersionComparisonDialog.tsx` only compares plain text.

**Required**: Rich text diff rendering.

---

### 2.4 WP Effort Matrix - Not Connected to Budget

**Status: 🔴 NOT STARTED**

Effort data is not synced to budget spreadsheet.

**Required**: Cost rate fields and calculation logic.

---

### 2.5 Template Modifiers and Work Programme Extensions - Unused

**Status: 🔴 NOT STARTED**

Database tables exist but no UI or logic to use them.

**Required**: Admin UI or removal of unused tables.

---

### 2.6 Block Locking - Partial Implementation

**Status: 🔴 NOT STARTED**

Extensions exist but no database persistence.

**Required**: Database table and real-time coordination.

---

### 2.7 Collaborative Cursors - No Visual Feedback

**Status: 🟡 NEEDS VERIFICATION**

Hook tracks presence but cursor rendering needs verification.

---

## Part 3: Implementation Priority

| Priority | Task | Status |
|----------|------|--------|
| **High** | Toast consolidation | ✅ Done |
| **High** | Centralize Participant interface | ✅ Done |
| **High** | Centralize WPDraft interface | ✅ Done |
| **Medium** | Merge template type files | ✅ Done |
| **Medium** | Add JSDoc documentation | ✅ Done |
| **Medium** | Track changes persistence | 🔴 Not Started |
| **Medium** | Clarify WP manager components | 🟡 Needs Evaluation |
| **Low** | Block locking persistence | 🔴 Not Started |
| **Low** | Effort to budget connection | 🔴 Not Started |

---

## Files Summary

### Files Deleted ✅
- `src/hooks/use-toast.ts`
- `src/components/ui/use-toast.ts`
- `src/components/ui/toaster.tsx`
- `src/types/templateSystem.ts`

### Files to Delete (Pending)
- Potentially `src/components/WorkPackageManager.tsx` (after evaluation)

### Files Modified ✅
**Phase 1:**
- `src/hooks/useWPColorPalette.ts`
- `src/hooks/useTemplates.ts`
- `src/hooks/useWPDrafts.ts`
- `src/hooks/useSectionComments.ts`
- `src/hooks/useWPDependencies.ts`
- `src/hooks/useCollaborativeCursors.ts`
- `src/hooks/useTemplateSystem.ts`
- `src/pages/Dashboard.tsx`
- `src/types/templates.ts`
- `src/App.tsx`

**Phase 2:**
- `src/types/proposal.ts` (added ParticipantSummary)
- `src/components/WPManagementCard.tsx`
- `src/components/CaseManagementCard.tsx`
- `src/components/WPEffortMatrix.tsx`
- `src/components/WPDraftEditor.tsx`
- `src/components/WPDeliverablesTable.tsx`
- `src/components/WPTableSection.tsx`
- `src/components/ParticipantMultiSelect.tsx`
- `src/components/InsertParticipantReferenceDialog.tsx`
- `src/components/InsertWPReferenceDialog.tsx`
- `src/lib/b31Population.ts`
- `src/hooks/useSectionAssignment.ts` (JSDoc)
- `src/hooks/useSectionAssignments.ts` (JSDoc)
- `src/components/GuidelineBox.tsx` (JSDoc)
- `src/components/SitraTipsBox.tsx` (JSDoc)

---

## Recommended Execution Order

1. **Phase 1 - Quick Wins** ✅ COMPLETE
   - ✅ Toast notification consolidation
   - ✅ Console.log cleanup
   - ✅ Type file merge

2. **Phase 2 - Interface Centralization** ✅ COMPLETE
   - ✅ Created ParticipantSummary type
   - ✅ Updated all component imports
   - ✅ Added JSDoc documentation

3. **Phase 3 - Feature Evaluation** (Next)
   - Evaluate WorkPackageManager usage
   - Document component purposes
   - Decide on deprecation path

4. **Phase 4 - Feature Completion** (Future)
   - Track changes database persistence
   - Block locking persistence
   - Effort matrix to budget connection
