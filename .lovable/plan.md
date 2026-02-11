

## Reorder WP Draft Sections

Rearrange the sections in `src/components/WPDraftEditor.tsx` (lines 797-864) to the following order:

1. **Methodology** (unchanged position)
2. **WP Table** (unchanged position)
3. **Deliverables** (unchanged position)
4. **Task Interactions & Bottlenecks + Milestones** -- move Task Interactions up from its current position (after Risks) and place Milestones table directly below it within the same visual grouping. These two will be wrapped in a shared Card container with a combined header (e.g., "Interactions & Milestones") so they appear as one section.
5. **Risks** (moved down, after the combined section)
6. **Staff Effort Matrix** (stays last)

### Technical Details

**File: `src/components/WPDraftEditor.tsx`**

- Move the `WPPlanningQuestions` block (lines 846-855) to appear after the `WPDeliverablesTable` block (after line 833)
- Place the new `WPMilestonesTable` component (from the already-approved milestones plan) immediately after `WPPlanningQuestions`
- Wrap both in a single `Card` so they read as one combined section
- Move `WPRisksTable` (lines 836-844) to appear after this combined section
- `WPEffortMatrix` remains last

No other files need changes for this reordering.
