
# Comprehensive Code Cleanup and Feature Completion Plan

**Status: Phase 4 Complete ✅ - All Major Tasks Done**

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

**Status: ✅ COMPLETE**

**Completed**:
- ✅ Created `section_tracked_changes` database table with RLS policies
- ✅ Created `useTrackedChanges` hook for loading/saving changes
- ✅ Integrated hook into `DocumentEditor.tsx`
- ✅ Changes now persist across page refreshes and sessions

**Database Table**: `section_tracked_changes` stores change_id, change_type, author info, positions, and content.

---

### 2.2 WorkPackageManager vs WPManagementCard Duplication

**Status: ✅ COMPLETE**

**Analysis Result**: `WorkPackageManager.tsx` was dead code - imported but never rendered.
- The modern `WPManagementCard.tsx` using `wp_drafts` table has fully replaced it.
- Legacy `work_packages` and `member_wp_allocations` tables exist but are unused.

**Completed**:
- ✅ Removed dead import from `ProposalEditor.tsx`
- ✅ Deleted `src/components/WorkPackageManager.tsx`

**Note**: Legacy tables (`work_packages`, `member_wp_allocations`) remain in DB but are no longer used.

---

### 2.3 Section Version Comparison - Enhanced

**Status: ✅ COMPLETE**

**Completed**:
- ✅ Added tabbed interface with "Text Diff" and "Side-by-Side Preview" modes
- ✅ Text diff shows line-by-line changes with add/remove indicators
- ✅ Side-by-side preview shows rendered HTML content from both versions
- ✅ Version labels displayed in preview headers

---

### 2.4 WP Effort Matrix - Connected to Budget

**Status: ✅ COMPLETE**

**Completed**:
- ✅ Added `personnel_cost_rate` field to participants table
- ✅ Updated `Participant` interface in `src/types/proposal.ts`
- ✅ Added cost rate input to `ParticipantDetailForm.tsx`
- ✅ Created `useEffortToBudget` hook for calculations
- ✅ Created `EffortToBudgetSummary` component for display

Personnel costs are now calculated from: person-months × cost rate (default €5000/PM).

---

### 2.5 Template Modifiers and Work Programme Extensions

**Status: ✅ COMPLETE**

**Completed**:
- ✅ Created `useTemplateModifiers` hook for CRUD operations
- ✅ Created `TemplateModifiersAdmin` component with full management UI
- ✅ Created `WorkProgrammeExtensionsAdmin` component with full management UI
- ✅ Added "Modifiers" and "WP Extensions" tabs to Template Admin page

Modifiers support JSON conditions/effects for template behavior rules.
Extensions support work programme-specific sections, fields, and funding overrides.

---

### 2.6 Block Locking - Functional via Presence

**Status: ✅ COMPLETE**

**Analysis**: Block locking correctly uses Supabase Presence (ephemeral).
- Locks should be released when users disconnect
- Database persistence would be inappropriate for this use case
- `useBlockLocking` hook + `BlockLocking` extension work correctly

---

### 2.7 Collaborative Cursors - Functional

**Status: ✅ COMPLETE**

- `useCollaborativeCursors` tracks presence
- `CollaborativeCursors` component renders cursor indicators
- `PresenceAvatars` shows active users

---

## Part 3: Implementation Priority

| Priority | Task | Status |
|----------|------|--------|
| **High** | Toast consolidation | ✅ Done |
| **High** | Centralize Participant interface | ✅ Done |
| **High** | Centralize WPDraft interface | ✅ Done |
| **Medium** | Merge template type files | ✅ Done |
| **Medium** | Add JSDoc documentation | ✅ Done |
| **Medium** | Track changes persistence | ✅ Done |
| **Medium** | Clarify WP manager components | ✅ Done |
| **Low** | Block locking (uses Presence) | ✅ Done |
| **Low** | Effort to budget connection | ✅ Done |

---

## Files Summary

### Files Deleted ✅
- `src/hooks/use-toast.ts`
- `src/components/ui/use-toast.ts`
- `src/components/ui/toaster.tsx`
- `src/types/templateSystem.ts`
- `src/components/WorkPackageManager.tsx`

### Files Created ✅
- `src/hooks/useTrackedChanges.ts` - Track changes persistence
- `src/hooks/useEffortToBudget.ts` - Effort to budget calculations
- `src/components/EffortToBudgetSummary.tsx` - Display component

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

**Phase 3-4:**
- `src/pages/ProposalEditor.tsx` (removed dead import)
- `src/components/DocumentEditor.tsx` (track changes integration)
- `src/types/proposal.ts` (added personnelCostRate to Participant)
- `src/components/ParticipantDetailForm.tsx` (cost rate field)
- `src/hooks/useEffortToBudget.ts` (new)
- `src/components/EffortToBudgetSummary.tsx` (new)
- `src/hooks/useTemplateModifiers.ts` (new)
- `src/components/admin/TemplateModifiersAdmin.tsx` (new)
- `src/components/admin/WorkProgrammeExtensionsAdmin.tsx` (new)
- `src/pages/admin/TemplateAdmin.tsx` (added modifiers/extensions tabs)
- `src/components/VersionComparisonDialog.tsx` (enhanced with side-by-side view)

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

3. **Phase 3 - Feature Evaluation** ✅ COMPLETE
   - ✅ Evaluated WorkPackageManager (was dead code)
   - ✅ Deleted legacy component
   - ✅ Documented component purposes

4. **Phase 4 - Feature Completion** ✅ COMPLETE
   - ✅ Track changes database persistence
   - ✅ Block locking verified (uses Presence correctly)
   - ✅ Effort matrix to budget connection
   - ✅ Collaborative cursors verified
   - ✅ Template modifiers admin UI
   - ✅ Work programme extensions admin UI
   - ✅ Rich text version comparison (side-by-side preview)

---

## 🎉 ALL TASKS COMPLETE

The comprehensive code cleanup and feature completion plan has been fully implemented.
