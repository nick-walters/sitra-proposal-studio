
# Comprehensive Code Cleanup and Feature Completion Plan

## Overview
This plan addresses code redundancies, inconsistencies, and incomplete features identified across the Sitra Proposal Studio codebase. The cleanup will improve maintainability, reduce duplication, and complete partially implemented functionality.

---

## Part 1: Code Cleanup and Consolidation

### 1.1 Toast Notification Consolidation

**Current State**: Two toast systems in use:
- `sonner` (dominant - ~46 files)
- Custom `useToast` hook (~7 files)

Plus a redundant re-export file at `src/components/ui/use-toast.ts`.

**Action Required**:
1. Migrate remaining files using `useToast` to `sonner`
2. Delete `src/hooks/use-toast.ts`
3. Delete `src/components/ui/use-toast.ts`

**Files to update**:
- `src/hooks/useWPColorPalette.ts`
- `src/hooks/useTemplates.ts`
- `src/hooks/useWPDrafts.ts`
- `src/hooks/useSectionComments.ts`
- `src/hooks/useWPDependencies.ts`

**Migration pattern**:
```text
// Before (useToast)
const { toast } = useToast();
toast({ title: 'Success', description: 'Done' });

// After (sonner)
import { toast } from 'sonner';
toast.success('Done');
```

---

### 1.2 Centralize Participant Interface

**Current State**: `Participant` interface defined in 11+ files with slight variations.

**Action Required**:
1. Add lightweight `ParticipantSummary` type to `src/types/proposal.ts`:
```text
export interface ParticipantSummary {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
  organisation_name: string;
}
```
2. Update all components to import from central location

**Files with duplicate definitions**:
- `src/components/WPManagementCard.tsx`
- `src/components/CaseManagementCard.tsx`
- `src/components/WPEffortMatrix.tsx`
- `src/components/WPDraftEditor.tsx`
- `src/components/WPDeliverablesTable.tsx`
- `src/components/WPTableSection.tsx`
- `src/components/ParticipantMultiSelect.tsx`
- `src/components/InsertParticipantReferenceDialog.tsx`
- `src/lib/b31Population.ts`

---

### 1.3 Centralize WPDraft Interface

**Current State**: `WPDraft` defined in 6 files.

**Action Required**:
Export canonical `WPDraft` from `src/hooks/useWPDrafts.ts` and import everywhere else instead of redefining.

**Files to update**:
- `src/components/WPManagementCard.tsx`
- `src/components/WPDependencySelector.tsx`
- `src/components/InsertWPReferenceDialog.tsx`
- `src/lib/b31Population.ts`

---

### 1.4 Merge Template Type Files

**Current State**: Two overlapping type files:
- `src/types/templates.ts` - Funding programmes, template types, roles
- `src/types/templateSystem.ts` - Base templates, modifiers, proposal templates

**Action Required**:
1. Merge `templateSystem.ts` content into `templates.ts` with clear section comments
2. Delete `src/types/templateSystem.ts`
3. Update all imports

---

### 1.5 Guideline Component Clarification

**Current State**:
- `GuidelineBox.tsx` - Reusable styled guideline display with type variants (official, sitra_tip, evaluation)
- `SitraTipsBox.tsx` - Collapsible Sitra tips container with custom parsing

**Analysis**: These serve different purposes:
- `GuidelineBox` - Single guideline display
- `SitraTipsBox` - Multiple tips in a collapsible container

**Action Required**: Add JSDoc comments clarifying intended usage for each component.

---

### 1.6 Console.log Cleanup

**Current State**: ~216 console.log statements across 9 files, mostly in edge functions.

**Action Required**:
1. Keep logging in edge functions (useful for debugging)
2. Remove debug logs from frontend hooks (`useCollaborativeCursors.ts`)
3. Remove debug logs from `Dashboard.tsx`

---

## Part 2: Incomplete Features

### 2.1 Track Changes - Not Persisted to Database

**Current State**: Track changes UI and extension exist but changes are stored only in memory. When a user refreshes or returns later, all tracked changes are lost.

**Missing Implementation**:
- Database table for storing tracked changes per section
- Saving/loading changes on section load
- Persisting changes on each edit

**Required Database Schema**:
```text
CREATE TABLE section_tracked_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  section_id UUID NOT NULL,
  change_id TEXT NOT NULL,
  change_type TEXT NOT NULL, -- 'insertion' or 'deletion'
  author_id UUID REFERENCES profiles(id),
  author_name TEXT NOT NULL,
  author_color TEXT NOT NULL,
  from_pos INTEGER NOT NULL,
  to_pos INTEGER NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(proposal_id, section_id, change_id)
);
```

**Files to update**:
- `src/extensions/TrackChanges.ts` - Add persistence hooks
- `src/components/DocumentEditor.tsx` - Load/save on mount/change
- `src/hooks/useSectionContent.ts` - Include tracked changes in fetch

---

### 2.2 WorkPackageManager vs WPManagementCard Duplication

**Current State**: Two WP management components:
- `WorkPackageManager.tsx` - Uses `work_packages` table, has PM allocation matrix
- `WPManagementCard.tsx` - Uses `wp_drafts` table, modern implementation with themes

These use different database tables and serve different purposes.

**Analysis**:
- `WorkPackageManager` appears to be a legacy component still imported in `ProposalEditor.tsx`
- `WPManagementCard` is the modern implementation with WP themes support

**Action Required**:
1. Determine if `WorkPackageManager` is still needed for PM allocation matrix functionality
2. If superseded, remove from `ProposalEditor.tsx` imports
3. If both needed, rename for clarity:
   - `WorkPackageManager.tsx` to `WPAllocationMatrix.tsx`
   - Add deprecation notice if planned for removal

---

### 2.3 Section Version Comparison - Limited Functionality

**Current State**: `VersionComparisonDialog.tsx` exists with a diff algorithm but:
- Only compares plain text (strips HTML)
- No visual indication in the editor
- No ability to selectively restore portions

**Missing Implementation**:
- Rich text diff rendering
- Inline diff highlighting in editor
- Partial restore functionality

**Action Required**: Add rich text diff support to properly compare formatted content.

---

### 2.4 WP Effort Matrix - Not Connected to Budget

**Current State**: `WPEffortMatrix.tsx` displays effort per task/participant but the description states "This data feeds into the budget spreadsheet" - this connection is not implemented.

**Missing Implementation**:
- Automatic sync of effort data to budget personnel costs
- Calculation of costs based on effort and participant cost rates

**Action Required**:
1. Add cost rate field to participants or participant_members
2. Create calculation logic to derive personnel costs from effort matrix
3. Update budget spreadsheet to show derived personnel costs

---

### 2.5 Template Modifiers and Work Programme Extensions - Unused

**Current State**: Database tables exist for:
- `template_modifiers` - Conditional template adjustments
- `work_programme_extensions` - Programme-specific additions
- `funding_rules` - Funding rate calculations

Types defined in `src/types/templateSystem.ts` but no UI or logic to apply them.

**Missing Implementation**:
- Admin UI to manage modifiers and extensions
- Logic to apply modifiers during proposal creation
- Funding rule application to budget calculations

**Action Required**: Either implement or remove unused tables and types to reduce confusion.

---

### 2.6 Block Locking - Partial Implementation

**Current State**: Extensions exist for block locking (`BlockLocking.ts`) and UI indicator (`BlockLockIndicator.tsx`), but:
- No database persistence
- No multi-user coordination

**Missing Implementation**:
- Database table for locked blocks
- Real-time subscription for lock status
- Automatic lock release on disconnect

---

### 2.7 Collaborative Cursors - No Visual Feedback

**Current State**: `useCollaborativeCursors.ts` hook tracks presence but `CollaborativeCursors.tsx` component needs verification that cursors are actually rendered in the editor.

**Action Required**: Verify cursor rendering works and add position tracking within sections.

---

## Part 3: Implementation Priority

| Priority | Task | Impact | Effort |
|----------|------|--------|--------|
| **High** | Toast consolidation | Consistency | Low |
| **High** | Centralize Participant interface | Code reduction | Medium |
| **High** | Centralize WPDraft interface | Code reduction | Low |
| **Medium** | Track changes persistence | Feature completion | High |
| **Medium** | Merge template type files | Organization | Low |
| **Medium** | Clarify WP manager components | Tech debt | Medium |
| **Low** | Console.log cleanup | Code hygiene | Low |
| **Low** | Block locking persistence | Feature completion | High |
| **Low** | Effort to budget connection | Feature completion | High |

---

## Files Summary

### Files to Delete
- `src/hooks/use-toast.ts`
- `src/components/ui/use-toast.ts`
- `src/types/templateSystem.ts` (after merge)
- Potentially `src/components/WorkPackageManager.tsx` (after evaluation)

### Files to Modify
- 5 hooks files (toast migration)
- 9+ component files (interface imports)
- `src/types/proposal.ts` (add ParticipantSummary)
- `src/types/templates.ts` (merge in templateSystem types)
- `src/extensions/TrackChanges.ts` (add persistence)
- `src/components/DocumentEditor.tsx` (track changes persistence)

### Database Tables to Add
- `section_tracked_changes` (for track changes persistence)

### Documentation to Add
- JSDoc comments for `useSectionAssignment` vs `useSectionAssignments`
- JSDoc comments for `GuidelineBox` vs `SitraTipsBox`
- JSDoc comments for WP manager components

---

## Recommended Execution Order

1. **Phase 1 - Quick Wins** (Day 1)
   - Toast notification consolidation
   - Console.log cleanup
   - Type file merge

2. **Phase 2 - Interface Centralization** (Day 2)
   - Create ParticipantSummary type
   - Update all component imports
   - Centralize WPDraft imports

3. **Phase 3 - Feature Evaluation** (Day 3)
   - Evaluate WorkPackageManager usage
   - Document component purposes
   - Decide on deprecation path

4. **Phase 4 - Feature Completion** (Week 2+)
   - Track changes database persistence
   - Block locking persistence
   - Effort matrix to budget connection
