# Rebuild researcher cards to match contact cards

## Scope
- Change only `src/components/participant/ResearchersTable.tsx` and the contact Email width in `src/components/participant/ContactPersonsSection.tsx`.
- Make no data-model, backend, budget, B3, Typst or shared UI changes.

## Implementation
1. Double the contact Email field’s current minimum width from 160px to 320px, retaining the existing flexible row so the remaining controls wrap cleanly where required.
2. Replace the researcher card rendering with the contact-card conventions:
   - pale-blue `bg-primary/5`, transparent border, `p-2`, `rounded-lg` card;
   - left grip with `mt-1 text-blue-600` and a 16px `GripVertical`;
   - right destructive ghost delete control sized 28px with a 16px `Trash2`;
   - fields between those controls, using 28px height, `text-sm`, 8px horizontal padding, italic muted placeholders and 4px row/column gaps;
   - text-field copy controls and hairline dividers only where specified;
   - two fixed field rows with the requested widths.
3. Preserve existing researcher behaviour: linked Title/name/email read-only, all other fields editable, role choices, category warning, 350ms trailing saves plus blur flush, error handling and contiguous drag-order writes.
4. Replace the separate add form with a local unsaved researcher card appended to the list and scrolled into view. Discard removes only the local card; a database row is created only once meaningful required content is saved.
5. Constrain the country trigger to the same 28px height and 14px font as every other field while retaining its flag.

## Verification
- Run exactly `tsc --noEmit -p tsconfig.app.json`, then the project-local Vite binary and capture exit codes.
- At a 1280px viewport, measure both contact and researcher cards and confirm no horizontal page overflow.
- On live SUSIE-Q, edit and reload a researcher’s name, role and identifier, then restore all original values; verify linked Title/name/email are read-only; reorder and reload, then restore the original order. Delete nothing.
- Test the add/discard flow without saving a blank row, recording list counts before and after. This is non-destructive and may run on SUSIE-Q; if any delete were needed, use a throwaway proposal instead.
- Report every requested width, copied class/value, measurement, test target and whether anything was deleted.
