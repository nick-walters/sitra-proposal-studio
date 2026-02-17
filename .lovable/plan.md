
## Right-Align Assign Buttons

**Change**: Add `ml-auto` to the assign buttons container in `src/components/B31SectionContent.tsx` (line 69).

**Current**: `className="mb-1 print:hidden flex gap-2"`
**Updated**: `className="mb-1 print:hidden flex gap-2 ml-auto"`

This pushes the DeliverableTaskMappingDialog and MilestoneTaskMappingDialog buttons to the right side using flexbox auto margin.
