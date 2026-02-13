

# Create Baseline Versions at Proposal Creation Time

## What Changes

Currently, a "Version 1" baseline is only created for a section when someone first opens it. This means sections that nobody has visited yet have no version history at all.

After this change, when a new proposal is created, the system will immediately create a Version 1 baseline for **every subsection** in the template -- before anyone opens them.

## Current Version Intervals (for reference)

- **Autosave** (content to database): 1 second after you stop typing
- **Version snapshots**: Every 2 minutes, but only if something changed
- **On navigation/close**: A version is saved immediately when you leave a section or close the tab

## Technical Details

### 1. Update proposal creation logic

**File**: `src/hooks/useProposalTemplateCreation.ts`

After the template sections are copied into the proposal (around line 150+), add a step that:
- Collects all the subsection IDs from the newly created `proposal_sections`
- For each subsection that has `section_content` (i.e. placeholder or copied content), calls the `insert_section_version` RPC to create a Version 1 baseline
- Uses the creating user's ID as the `created_by`

This ensures every editable subsection starts with a version history entry from the moment the proposal exists.

### 2. Remove the lazy baseline logic from section loading

**File**: `src/hooks/useSectionContent.ts`

Remove the "check if versions exist and create baseline" block (lines 238-261). Since baselines will already exist from proposal creation, this check becomes unnecessary. This also slightly speeds up opening a section for the first time.

### 3. Handle edge case: existing proposals without baselines

Keep a lightweight fallback: if a section is opened and has content but zero versions, still create a baseline. This handles proposals created before this change. The code will be simplified to just a brief check rather than the current block, or we can keep the existing logic as-is for backwards compatibility -- it's harmless since it only fires once per section.

### Files to modify

- `src/hooks/useProposalTemplateCreation.ts` -- add baseline version creation after sections are set up
- `src/hooks/useSectionContent.ts` -- optionally simplify or keep the fallback baseline logic

